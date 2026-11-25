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

    private static string CardJson(string nameEn, string name, string icon = "moon", object[]? tables = null) => JsonSerializer.Serialize(new
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
        tables = tables ?? [],
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
        // Nobody else writes cards for it, so the library has none yet. The wiki writes the
        // apostrophe as a dash.
        Wiki.Pages["hunter-s-mark"] = WikiHtml;
        Model.Answer = Answers("hunter's mark", CardJson("Something Else", "Mal des Jägers", icon: "unicorn"));
        var mira = await fixture.App.CreatePersonAsync("Mira");
        var spell = await mira.LibrarySpellAsync("Hunter's Mark");

        var response = await (await mira.Client.PostAsJsonAsync("/api/spells/import/name", new ImportByNameRequest("Mal des Jägers"), Json))
            .ReadAsync<ImportByNameResponse>(HttpStatusCode.OK);

        Assert.Equal(("Hunter's Mark", spell.Id, 0), (response.NameEn, response.SpellId, response.VariantCount));
        var draft = response.Draft!;
        // The Handbook's name, level and school win over the model's; unknown icons become
        // "spark"; two pips at most.
        Assert.Equal(
            (spell.Id, "Hunter's Mark", 1, SpellSchool.Divination, SpellVariantOrigin.Wiki),
            (draft.SpellId, draft.NameEn, draft.Level, draft.School, draft.Origin));
        Assert.Equal(("Mal des Jägers", "spark"), (draft.Card.Name, draft.Card.Icon));
        Assert.Equal(["spark", "star"], draft.Card.Pips);

        var requests = Model.Requests.ToList();
        Assert.Equal(["spell-name", "spell-wiki"], requests.Select(r => r.Purpose));
        Assert.Equal("Mal des Jägers", requests[0].User);
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
    public async Task A_table_in_the_rules_comes_as_a_table_cut_to_the_limits()
    {
        Model.Reset();
        // Nobody else writes cards for it.
        Wiki.Pages["prismatic-wall"] = WikiHtml;
        object Row(string key, string? color, string title, string text, object? chip = null) => new { key, color, title, text, chip };
        Model.Answer = Answers("Prismatic Wall", CardJson("Prismatic Wall", "Prismatische Wand", icon: "shield", tables:
        [
            new
            {
                caption = "Je Schicht RW Geschick",
                rows = new[]
                {
                    Row("1", "red", "Rot", "**Zerstört:** 25 Kälteschaden", new { big = "12W6", small = "Feuer", kind = "fire" }),
                    Row("", null, " ", " "),
                    Row("1234567", "violet", "Violett", new string('x', 400), new { big = "", small = "", kind = (string?)null }),
                },
            },
            new { caption = "leer", rows = new[] { Row("1", null, "", "") } },
        ]));
        var mira = await fixture.App.CreatePersonAsync("Mira");

        var draft = (await (await mira.Client.PostAsJsonAsync("/api/spells/import/name", new ImportByNameRequest("Prismatische Wand"), Json))
            .ReadAsync<ImportByNameResponse>(HttpStatusCode.OK)).Draft!;

        // The empty row and the table without rows go; the rest is cut to fit and saves as it is.
        var table = Assert.Single(draft.Card.Tables);
        Assert.Equal("Je Schicht RW Geschick", table.Caption);
        Assert.Equal(
            [("1", SpellRowColor.Red, "Rot", "12W6"), ("123456", SpellRowColor.Violet, "Violett", null)],
            table.Rows.Select(r => (r.Key, r.Color, r.Title, r.Chip?.Big)));
        Assert.Equal(SpellCards.TableTextMax, table.Rows[1].Text.Length);
        Assert.Contains("\"tables\"", Model.Requests.Last().System);
        var saved = await mira.CreateSpellAsync("Prismatic Wall", draft.Card);
        Assert.Equal(draft.Card.Tables[0].Rows, saved.Card.Tables[0].Rows);
    }

    [Fact]
    public async Task A_spell_with_cards_is_offered_instead_of_a_draft_unless_forced()
    {
        Model.Reset();
        var mira = await fixture.App.CreatePersonAsync("Mira");
        var existing = await mira.CreateSpellAsync("Thunderwave");
        Wiki.Pages["thunderwave"] = WikiHtml;
        Model.Answer = Answers("Thunderwave");

        var found = await (await mira.Client.PostAsJsonAsync("/api/spells/import/name", new ImportByNameRequest("Donnerwoge"), Json))
            .ReadAsync<ImportByNameResponse>(HttpStatusCode.OK);
        Assert.Equal((existing.SpellId, (SpellDraft?)null), (found.SpellId, found.Draft));
        Assert.True(found.VariantCount >= 1);

        var forced = await (await mira.Client.PostAsJsonAsync("/api/spells/import/name", new ImportByNameRequest("Donnerwoge", Force: true), Json))
            .ReadAsync<ImportByNameResponse>(HttpStatusCode.OK);
        // The Handbook's level wins over the model's 2.
        Assert.Equal((existing.SpellId, 1, SpellSchool.Evocation), (forced.Draft!.SpellId, forced.Draft.Level, forced.Draft.School));
    }

    [Fact]
    public async Task Unknown_names_other_books_missing_pages_and_failures_have_their_own_errors()
    {
        Model.Reset();
        var mira = await fixture.App.CreatePersonAsync("Mira");
        async Task Expect(ApiErrorCode code) =>
            await (await mira.Client.PostAsJsonAsync("/api/spells/import/name", new ImportByNameRequest("Blubb"), Json))
                .AssertErrorAsync(HttpStatusCode.Conflict, code);

        Model.Answer = _ => new TextModelResult("""{"nameEn":null}""", 10, 5, null);
        await Expect(ApiErrorCode.SpellNotRecognized);

        // A spell, but from another book.
        Model.Answer = Answers("Buzzing Bee");
        await Expect(ApiErrorCode.SpellNotInHandbook);

        // A Handbook spell nobody writes cards for, whose page the fake wiki doesn't have.
        Model.Answer = Answers("Wish");
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
        var existing = await mira.CreateSpellAsync("Moonbeam");
        var tsunami = await mira.LibrarySpellAsync("Tsunami");
        // Spells of other books and spells without a name are left out.
        Model.Answer = request => new TextModelResult(
            $$"""{"spells":[{{CardJson("moonbeam", "Mondstrahl")}},{{CardJson("Buzzing Bee", "Summende Biene")}},{{CardJson("Tsunami", "Flutwelle")}},{{CardJson("", "Ohne Namen")}}]}""",
            3000,
            2000,
            null);

        var content = new ByteArrayContent(TestPictures.SplitJpeg(3000, 2000));
        content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        var response = await (await mira.Client.PostAsync("/api/spells/import/photo", content)).ReadAsync<ImportByPhotoResponse>(HttpStatusCode.OK);

        Assert.Equal(
            [("Moonbeam", existing.SpellId, 2, SpellVariantOrigin.Photo), ("Tsunami", tsunami.Id, 8, SpellVariantOrigin.Photo)],
            response.Drafts.Select(d => (d.NameEn, d.SpellId, d.Level, d.Origin)));

        // The photo goes to the model upright, as a JPEG of at most 2048 px.
        var sent = Assert.Single(Assert.Single(Model.Requests).Images!);
        using var bitmap = TestPictures.Decode(sent.Content);
        Assert.Equal(("image/jpeg", 2048, 1365), (sent.ContentType, bitmap.Width, bitmap.Height));

        Model.Answer = request => new TextModelResult(
            $$"""{"spells":[{{CardJson("Buzzing Bee", "Summende Biene")}}]}""", 3000, 2000, null);
        var onlyOtherBooks = new ByteArrayContent(TestPictures.SplitJpeg(300, 200));
        onlyOtherBooks.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        await (await mira.Client.PostAsync("/api/spells/import/photo", onlyOtherBooks))
            .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.SpellNotInHandbook);

        var notAPicture = new ByteArrayContent([1, 2, 3]);
        notAPicture.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        await (await mira.Client.PostAsync("/api/spells/import/photo", notAPicture)).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.UploadInvalid);
    }

    [Fact]
    public async Task The_studio_suggests_a_motif_from_the_card_without_saving_it()
    {
        Model.Reset();
        var mira = await fixture.App.CreatePersonAsync("Mira");
        var other = await fixture.App.CreatePersonAsync("Brom");
        var variant = await mira.CreateSpellAsync("Moonbeam");
        var studio = $"/api/spells/variants/{variant.Id}/studio";
        (await mira.Client.PostAsJsonAsync(studio + "/prompts", new SaveArtPromptRequest("a", "a wolf in moonlight"), Json)).EnsureSuccessStatusCode();
        (await mira.Client.PostAsJsonAsync(studio + "/prompts", new SaveArtPromptRequest("a", "a grey wolf howling in moonlight"), Json)).EnsureSuccessStatusCode();
        (await mira.Client.PostAsJsonAsync(studio + "/events", new AddArtEventRequest(SpellArtEventKind.Comment, Value: "Mehr Nacht"), Json)).EnsureSuccessStatusCode();
        Model.Answer = _ => new TextModelResult("""{"subject":"  close view of a hand raising a moonseed leaf  "}""", 900, 300, null);

        Assert.True((await (await mira.Client.GetAsync(studio)).ReadAsync<SpellStudio>(HttpStatusCode.OK)).MotifSuggestions);
        var suggestion = await (await mira.Client.PostAsync(studio + "/motif", null)).ReadAsync<SuggestMotifResponse>(HttpStatusCode.OK);

        Assert.Equal("close view of a hand raising a moonseed leaf", suggestion.Subject);
        // The model reads the card, the spell's classes, each motif's current revision and the notes.
        var request = Assert.Single(Model.Requests);
        Assert.Equal("spell-motif", request.Purpose);
        Assert.Contains("Spell: Moonbeam (German: Mondstrahl), level 2, evocation", request.User);
        Assert.Contains("Classes: Druid", request.User);
        Assert.Contains(variant.Card.Description, request.User);
        Assert.Contains("- a grey wolf howling in moonlight", request.User);
        Assert.DoesNotContain("- a wolf in moonlight", request.User);
        Assert.Contains("- Mehr Nacht", request.User);
        // Nothing is saved but the call and its cost.
        await using (var scope = fixture.App.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(2, await db.SpellArtPrompts.CountAsync(p => p.VariantId == variant.Id));
            Assert.Equal(("spell-motif", 0.00024m), await db.TextModelCalls.Where(c => c.UserId == mira.Id).Select(c => ValueTuple.Create(c.Purpose, c.CostUsd)).SingleAsync());
        }

        async Task Expect(Person person, ApiErrorCode code) =>
            await (await person.Client.PostAsync(studio + "/motif", null)).AssertErrorAsync(HttpStatusCode.Conflict, code);

        await Expect(other, ApiErrorCode.NotSpellAuthor);
        Assert.Equal(HttpStatusCode.NotFound, (await mira.Client.PostAsync($"/api/spells/variants/{Guid.NewGuid()}/studio/motif", null)).StatusCode);
        Model.Answer = _ => new TextModelResult("""{"subject":" "}""", 10, 5, null);
        await Expect(mira, ApiErrorCode.MotifSuggestionFailed);
        Model.Answer = _ => throw new TextModelException("filtered", refused: true);
        await Expect(mira, ApiErrorCode.MotifSuggestionFailed);
        Model.Configured = false;
        await Expect(mira, ApiErrorCode.TextModelUnavailable);
        Assert.False((await (await mira.Client.GetAsync(studio)).ReadAsync<SpellStudio>(HttpStatusCode.OK)).MotifSuggestions);
        Model.Configured = true;
    }
}
