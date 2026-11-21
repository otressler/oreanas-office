using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Spells;
using OreanasOffice.Server.Tests.Images;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SpellTestApi;

namespace OreanasOffice.Server.Tests;

// knowledge/features/spell-cards.md, "Creating a spell": by name through the wiki and by photo,
// against the fake text model and wiki. The fakes are shared by the app; only this class
// sets their answers, and its tests run one after another.
public sealed class SpellImportTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private FakeTextModel Model => fixture.App.Services.GetRequiredService<FakeTextModel>();

    private FakeWiki Wiki => fixture.App.Services.GetRequiredService<FakeWiki>();

    private const string WikiHtml =
        """
        <html><body><div id="page-content">
        <p>Source: Player's Handbook</p>
        <p><em>Level 2 Evocation (Druid)</em></p>
        <p><strong>Casting Time:</strong> Action<br />
        <strong>Range:</strong> 120 feet</p>
        <p>A silvery beam of pale light shines down in a 5-foot-radius Cylinder.</p>
        </div>
        <!-- mobile bottom 320x50 --><script>ads()</script>
        <div class="page-tags"><a>druid</a></div></body></html>
        """;

    private static string CardJson(string nameEn, string name, string icon = "moon") => JsonSerializer.Serialize(new
    {
        nameEn,
        name,
        level = 2,
        school = "evocation",
        castingTime = "1 Aktion",
        range = "36 m",
        components = "V, G, M",
        duration = "bis 1 Minute",
        concentration = true,
        ritual = false,
        description = "Ein silbriger Strahl.",
        effects = new[] { new { icon, title = "Zylinder", tag = (string?)null, text = "RW Konstitution", chip = new { big = "2W10", small = "Gleißend", kind = "radiant" } } },
        icon,
        pips = new[] { icon, "star", "sun" },
        higherLevels = "+1W10 je Grad über 2",
        tip = "",
        material = "ein Mondsamenblatt",
        source = "",
        writeIns = new[] { "saveDc" },
    });

    private Func<TextModelRequest, TextModelResult> Answers(string nameEn, string? wikiCard = null) => request => request.Purpose switch
    {
        "spell-name" => new TextModelResult(JsonSerializer.Serialize(new { nameEn = (string?)nameEn }), 60, 20, "fake-text"),
        "spell-wiki" => new TextModelResult(wikiCard ?? CardJson("ignored", "Mondstrahl"), 4000, 1000, "fake-text"),
        _ => throw new TextModelException("unexpected"),
    };

    [Fact]
    public async Task A_german_name_goes_through_the_english_name_and_the_wiki_to_a_german_draft()
    {
        Model.Reset();
        var nameEn = UniqueName("Moonbeam");
        Wiki.Pages[SpellImport.Slug(nameEn)] = WikiHtml;
        Model.Answer = Answers(nameEn, CardJson("Something Else", "Mondstrahl", icon: "unicorn"));
        var mira = await fixture.App.CreatePersonAsync("Mira");

        var response = await (await mira.Client.PostAsJsonAsync("/api/spells/import/name", new ImportByNameRequest("Mondstrahl"), Json))
            .ReadAsync<ImportByNameResponse>(HttpStatusCode.OK);

        Assert.Equal((nameEn, (Guid?)null), (response.NameEn, response.ExistingSpellId));
        var draft = response.Draft!;
        // The wiki's name wins over the model's; unknown icons become "spark"; two pips at most.
        Assert.Equal((nameEn, 2, SpellSchool.Evocation, SpellVariantOrigin.Wiki), (draft.NameEn, draft.Level, draft.School, draft.Origin));
        Assert.Equal(("Mondstrahl", "spark"), (draft.Card.Name, draft.Card.Icon));
        Assert.Equal(["spark", "star"], draft.Card.Pips);

        var requests = Model.Requests.ToList();
        Assert.Equal(["spell-name", "spell-wiki"], requests.Select(r => r.Purpose));
        Assert.Equal("Mondstrahl", requests[0].User);
        Assert.Contains("A silvery beam of pale light shines down in a 5-foot-radius Cylinder.", requests[1].User);
        Assert.Contains("Casting Time: Action\nRange: 120 feet", requests[1].User);
        Assert.DoesNotContain("ads()", requests[1].User);
        Assert.DoesNotContain("druid", requests[1].User);

        // Both calls are recorded with their cost: (60 + 4000) × 0.10 + (20 + 1000) × 0.50 per million.
        await using var scope = fixture.App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var calls = await db.TextModelCalls.Where(c => c.UserId == mira.Id).OrderBy(c => c.CreatedAt).ToListAsync();
        Assert.Equal([("spell-name", 0.000016m), ("spell-wiki", 0.0009m)], calls.Select(c => (c.Purpose, c.CostUsd)));
    }

    [Fact]
    public async Task A_spell_in_the_library_is_offered_instead_of_a_draft_unless_forced()
    {
        Model.Reset();
        var mira = await fixture.App.CreatePersonAsync("Mira");
        var existing = await mira.CreateSpellAsync(level: 3, school: SpellSchool.Conjuration);
        Wiki.Pages[SpellImport.Slug(existing.NameEn)] = WikiHtml;
        Model.Answer = Answers(existing.NameEn);

        var found = await (await mira.Client.PostAsJsonAsync("/api/spells/import/name", new ImportByNameRequest("Mondstrahl"), Json))
            .ReadAsync<ImportByNameResponse>(HttpStatusCode.OK);
        Assert.Equal((existing.SpellId, (SpellDraft?)null), (found.ExistingSpellId, found.Draft));

        var forced = await (await mira.Client.PostAsJsonAsync("/api/spells/import/name", new ImportByNameRequest("Mondstrahl", Force: true), Json))
            .ReadAsync<ImportByNameResponse>(HttpStatusCode.OK);
        // The library's level and school win over the model's.
        Assert.Equal((existing.SpellId, 3, SpellSchool.Conjuration), (forced.Draft!.ExistingSpellId, forced.Draft.Level, forced.Draft.School));
    }

    [Fact]
    public async Task Unknown_names_missing_pages_and_failures_have_their_own_errors()
    {
        Model.Reset();
        var mira = await fixture.App.CreatePersonAsync("Mira");
        async Task Expect(ApiErrorCode code) =>
            await (await mira.Client.PostAsJsonAsync("/api/spells/import/name", new ImportByNameRequest("Blubb"), Json))
                .AssertErrorAsync(HttpStatusCode.Conflict, code);

        Model.Answer = _ => new TextModelResult("""{"nameEn":null}""", 10, 5, null);
        await Expect(ApiErrorCode.SpellNotRecognized);

        Model.Answer = Answers(UniqueName("Not In The Wiki"));
        await Expect(ApiErrorCode.SpellNotInWiki);

        Model.Answer = _ => throw new TextModelException("busy");
        await Expect(ApiErrorCode.SpellImportFailed);

        Model.Answer = _ => throw new TextModelException("filtered", refused: true);
        await Expect(ApiErrorCode.SpellNotRecognized);

        Model.Configured = false;
        await Expect(ApiErrorCode.TextModelUnavailable);
        Model.Configured = true;
    }

    [Fact]
    public async Task A_photo_becomes_one_draft_per_spell_on_the_page()
    {
        Model.Reset();
        var mira = await fixture.App.CreatePersonAsync("Mira");
        var existing = await mira.CreateSpellAsync();
        var newName = UniqueName("Thunderwave");
        Model.Answer = request => new TextModelResult(
            $$"""{"spells":[{{CardJson(existing.NameEn, "Mondstrahl")}},{{CardJson(newName, "Donnerwoge")}},{{CardJson("", "Ohne Namen")}}]}""",
            3000,
            2000,
            null);

        var content = new ByteArrayContent(TestPictures.SplitJpeg(3000, 2000));
        content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        var response = await (await mira.Client.PostAsync("/api/spells/import/photo", content)).ReadAsync<ImportByPhotoResponse>(HttpStatusCode.OK);

        Assert.Equal(
            [(existing.NameEn, (Guid?)existing.SpellId, SpellVariantOrigin.Photo), (newName, null, SpellVariantOrigin.Photo)],
            response.Drafts.Select(d => (d.NameEn, d.ExistingSpellId, d.Origin)));

        // The photo goes to the model upright, as a JPEG of at most 2048 px.
        var sent = Assert.Single(Assert.Single(Model.Requests).Images!);
        using var bitmap = TestPictures.Decode(sent.Content);
        Assert.Equal(("image/jpeg", 2048, 1365), (sent.ContentType, bitmap.Width, bitmap.Height));

        var notAPicture = new ByteArrayContent([1, 2, 3]);
        notAPicture.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        await (await mira.Client.PostAsync("/api/spells/import/photo", notAPicture)).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.UploadInvalid);
    }
}
