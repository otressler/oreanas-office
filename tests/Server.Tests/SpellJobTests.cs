using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Spells;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SpellTestApi;

namespace OreanasOffice.Server.Tests;

// knowledge/features/spell-cards.md, "Planned", steps 4 and 5: the suggestion queue writes card
// drafts and motifs, the revision pass saves a card's new form only when its words stay. Against
// the fake text model and wiki, which SpellImportTests uses too: the Images collection runs them
// one after another. The level 9 necromancy and conjuration spells get cards only here.
[Collection("Images")]
public sealed class SpellJobTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private FakeTextModel Model => fixture.App.Services.GetRequiredService<FakeTextModel>();

    private FakeWiki Wiki => fixture.App.Services.GetRequiredService<FakeWiki>();

    private const string Jobs = "/api/admin/spells/jobs";

    private static readonly string DraftCard = JsonSerializer.Serialize(new
    {
        nameEn = "ignored",
        name = "Entwurf",
        level = 9,
        school = "necromancy",
        castingTime = "1 Stunde",
        range = "Berührung",
        components = "V, G, M",
        duration = "Unmittelbar",
        concentration = false,
        ritual = false,
        description = "Ein Entwurf.",
        effects = Array.Empty<object>(),
        tables = Array.Empty<object>(),
        icon = "skull",
        pips = Array.Empty<string>(),
        higherLevels = "",
        tip = "",
        material = "",
        source = "",
        writeIns = Array.Empty<string>(),
        offerStatus = false,
        statuses = Array.Empty<string>(),
    });

    private const string Before = "Der Strahl trifft. Zweiter Teil: das Ziel ist festgesetzt.";

    private const string After = "Der Strahl trifft.\n\n**Zweiter Teil:** das Ziel ist [[festgesetzt]].";

    // Drafts from the wiki, motifs, and the revision: the form of "Before" becomes "After", a card
    // with "Wortwechsel" gets a word changed, every other card comes back as it was sent.
    private static TextModelResult Answer(TextModelRequest request) => request.Purpose switch
    {
        "spell-wiki" => new(DraftCard, 4000, 1000, "fake-text"),
        "spell-motif" => new(JsonSerializer.Serialize(new { subject = "A necromancer raising a pale light over a grave." }), 500, 100, "fake-text"),
        "spell-revise" when request.User.Contains("Zweiter Teil", StringComparison.Ordinal) =>
            new(Revised(request.User, r => r with { Description = After, OfferStatus = true, Statuses = ["restrained"] }), 3000, 1000, "fake-text"),
        "spell-revise" when request.User.Contains("Wortwechsel", StringComparison.Ordinal) =>
            new(Revised(request.User, r => r with { Description = "Ganz andere Worte." }), 3000, 1000, "fake-text"),
        "spell-revise" => new(request.User, 3000, 1000, "fake-text"),
        _ => throw new TextModelException("unexpected"),
    };

    private sealed record RevisedFields(string Description, bool OfferStatus, List<string> Statuses);

    // The card the model was sent, with its description and status fields changed.
    private static string Revised(string sent, Func<RevisedFields, RevisedFields> change)
    {
        var json = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(sent)!;
        var fields = change(new RevisedFields(json["description"].GetString()!, false, []));
        var result = json.ToDictionary(p => p.Key, p => (object?)p.Value);
        result["description"] = fields.Description;
        result["offerStatus"] = fields.OfferStatus;
        result["statuses"] = fields.Statuses;
        return JsonSerializer.Serialize(result);
    }

    private async Task<Person> AdminAsync()
    {
        var user = await fixture.App.CreateUserAsync("Admin", isAdmin: true);
        return new Person(user, fixture.App.CreateClientFor(user));
    }

    private static async Task<SpellJobsOverview> OverviewAsync(Person admin) =>
        await (await admin.Client.GetAsync(Jobs)).ReadAsync<SpellJobsOverview>(HttpStatusCode.OK);

    // Until the worker has nothing open.
    private static async Task<SpellJobsOverview> SettledAsync(Person admin)
    {
        for (var i = 0; ; i++)
        {
            var overview = await OverviewAsync(admin);
            if (overview.Counts.All(c => c.Queued + c.Running == 0) || i >= 150)
            {
                return overview;
            }

            await Task.Delay(100, TestContext.Current.CancellationToken);
        }
    }

    [Fact]
    public async Task Only_admins_see_and_start_the_queue()
    {
        var (_, player, _) = await fixture.App.CreateSpellTableAsync();
        Assert.Equal(HttpStatusCode.Forbidden, (await player.Client.GetAsync(Jobs)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await player.Client.PostAsJsonAsync(Jobs, new SpellJobsRequest(SpellJobRun.Suggestions), Json)).StatusCode);
    }

    [Fact]
    public async Task Suggestions_write_a_draft_per_spell_without_a_card_which_becomes_a_variant_when_checked()
    {
        Model.Reset();
        Model.Answer = Answer;
        Wiki.Fallback = "<html><body><div id=\"page-content\"><p>Level 9 Necromancy</p></div></body></html>";
        try
        {
            var admin = await AdminAsync();
            var (_, player, _) = await fixture.App.CreateSpellTableAsync();
            var request = new SpellJobsRequest(SpellJobRun.Suggestions, Level: 9, School: SpellSchool.Necromancy);
            var library = await (await player.Client.GetAsync("/api/spells")).ReadAsync<List<SpellSummary>>(HttpStatusCode.OK);
            var wanted = library.Where(s => s is { Level: 9, School: SpellSchool.Necromancy, VariantCount: 0, HasDraft: false }).ToList();
            Assert.NotEmpty(wanted);

            var plan = await (await admin.Client.PostAsJsonAsync($"{Jobs}/plan", request, Json)).ReadAsync<SpellJobsPlan>(HttpStatusCode.OK);
            Assert.Equal((wanted.Count, 0, 0), (plan.Drafts, plan.Motifs, plan.Revisions));
            Assert.True(plan.EstimatedUsd > 0);

            var started = await (await admin.Client.PostAsJsonAsync(Jobs, request, Json)).ReadAsync<SpellJobsPlan>(HttpStatusCode.Accepted);
            Assert.Equal(wanted.Count, started.Drafts);
            var overview = await SettledAsync(admin);
            Assert.DoesNotContain(overview.Failed, j => wanted.Any(w => w.Id == j.SpellId));

            // Queued again, nothing new: every spell has its draft.
            Assert.Equal(0, (await (await admin.Client.PostAsJsonAsync($"{Jobs}/plan", request, Json)).ReadAsync<SpellJobsPlan>(HttpStatusCode.OK)).Drafts);

            // The library says so; the spell's page shows the draft, which has no character yet.
            library = await (await player.Client.GetAsync("/api/spells")).ReadAsync<List<SpellSummary>>(HttpStatusCode.OK);
            Assert.All(wanted, w => Assert.True(library.Single(s => s.Id == w.Id) is { HasDraft: true, VariantCount: 0 }));
            var spell = await player.GetSpellAsync(wanted[0].Id);
            var draft = Assert.IsType<SpellCardDraftView>(spell.Draft);
            Assert.Equal(("Entwurf", "A necromancer raising a pale light over a grave."), (draft.Card.Name, draft.MotifSubject));

            // Checked and saved, it's the player's variant with the motif as a suggestion.
            var variant = await (await player.CreateVariantAsync(new CreateVariantRequest(spell.Id, draft.Card with { Name = "Geprüft" }, SpellVariantOrigin.Wiki, DraftId: draft.Id)))
                .ReadAsync<SpellVariantView>(HttpStatusCode.Created);
            Assert.Equal(("Geprüft", player.User.Id, SpellVariantOrigin.Wiki), (variant.Card.Name, variant.Author.Id, variant.Origin));
            var studio = await (await player.Client.GetAsync($"/api/spells/variants/{variant.Id}/studio")).ReadAsync<SpellStudio>(HttpStatusCode.OK);
            var motif = Assert.Single(studio.Prompts);
            Assert.Equal(("a", SpellArtPromptSource.Suggestion), (motif.Letter, motif.Source));
            Assert.Null((await player.GetSpellAsync(spell.Id)).Draft);

            // An admin discards another draft.
            if (wanted.Count > 1 && (await player.GetSpellAsync(wanted[1].Id)).Draft is { } other)
            {
                Assert.Equal(HttpStatusCode.Forbidden, (await player.Client.DeleteAsync($"/api/spells/drafts/{other.Id}")).StatusCode);
                Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.DeleteAsync($"/api/spells/drafts/{other.Id}")).StatusCode);
                Assert.Null((await player.GetSpellAsync(wanted[1].Id)).Draft);
            }
        }
        finally
        {
            Wiki.Fallback = null;
        }
    }

    [Fact]
    public async Task Suggestions_give_a_motif_to_a_card_without_one()
    {
        Model.Reset();
        Model.Answer = Answer;
        var admin = await AdminAsync();
        var (_, player, _) = await fixture.App.CreateSpellTableAsync();
        var variant = await player.CreateSpellAsync("Gate", Card("Tor"));

        await (await admin.Client.PostAsJsonAsync(Jobs, new SpellJobsRequest(SpellJobRun.Suggestions, Level: 9, School: SpellSchool.Conjuration, OnlyWithoutCard: false), Json))
            .ReadAsync<SpellJobsPlan>(HttpStatusCode.Accepted);
        await SettledAsync(admin);

        var studio = await (await player.Client.GetAsync($"/api/spells/variants/{variant.Id}/studio")).ReadAsync<SpellStudio>(HttpStatusCode.OK);
        Assert.Equal([("a", SpellArtPromptSource.Suggestion)], studio.Prompts.Select(p => (p.Letter, p.Source)));
    }

    [Fact]
    public async Task The_revision_saves_a_new_form_lists_changed_words_and_can_be_put_back()
    {
        Model.Reset();
        Model.Answer = Answer;
        var admin = await AdminAsync();
        var (_, player, _) = await fixture.App.CreateSpellTableAsync();
        var formed = await player.CreateSpellAsync("Gate", Card("Tor") with { Description = Before });
        var reworded = await player.CreateSpellAsync("Gate", Card("Tor") with { Description = "Wortwechsel im Text." });
        var request = new SpellJobsRequest(SpellJobRun.Revision, Level: 9, School: SpellSchool.Conjuration, OnlyUnrevised: false);

        var plan = await (await admin.Client.PostAsJsonAsync($"{Jobs}/plan", request, Json)).ReadAsync<SpellJobsPlan>(HttpStatusCode.OK);
        Assert.True(plan.Revisions >= 2);
        await (await admin.Client.PostAsJsonAsync(Jobs, request, Json)).ReadAsync<SpellJobsPlan>(HttpStatusCode.Accepted);
        var overview = await SettledAsync(admin);

        // Same words: saved in the new form, with the status fields.
        var spell = await player.GetSpellAsync(formed.SpellId);
        var card = spell.Variants.Single(v => v.Id == formed.Id).Card;
        Assert.Equal(After, card.Description);
        Assert.True(card.OfferStatus);
        Assert.Equal(["restrained"], card.Statuses);
        var revision = Assert.Single(overview.Revisions, r => r.VariantId == formed.Id);
        Assert.True(revision.CanRevert);

        // A word changed: nothing saved, listed to check with the field.
        Assert.Equal("Wortwechsel im Text.", spell.Variants.Single(v => v.Id == reworded.Id).Card.Description);
        var check = Assert.Single(overview.ToCheck, j => j.VariantId == reworded.Id);
        Assert.Equal(("card.description", SpellJobOutcome.WordsChanged), (check.Detail, check.Outcome));

        // Put back as it was; a second time there's nothing to put back.
        Assert.Equal(HttpStatusCode.NoContent, (await admin.Client.PostAsync($"/api/admin/spells/revisions/{revision.Id}/revert", null)).StatusCode);
        Assert.Equal(Before, (await player.GetSpellAsync(formed.SpellId)).Variants.Single(v => v.Id == formed.Id).Card.Description);
        Assert.Equal(HttpStatusCode.NotFound, (await admin.Client.PostAsync($"/api/admin/spells/revisions/{revision.Id}/revert", null)).StatusCode);

        // Revised again and then edited by its author: putting it back would lose the edit.
        await (await admin.Client.PostAsJsonAsync(Jobs, request, Json)).ReadAsync<SpellJobsPlan>(HttpStatusCode.Accepted);
        overview = await SettledAsync(admin);
        var second = Assert.Single(overview.Revisions, r => r.VariantId == formed.Id);
        (await player.UpdateVariantAsync(formed.Id, Card("Tor") with { Description = "Neu geschrieben." })).EnsureSuccessStatusCode();
        await (await admin.Client.PostAsync($"/api/admin/spells/revisions/{second.Id}/revert", null))
            .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.RevisionOutdated);
        Assert.False((await OverviewAsync(admin)).Revisions.Single(r => r.Id == second.Id).CanRevert);
    }
}
