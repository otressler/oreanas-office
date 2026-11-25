using System.Net;
using System.Net.Http.Json;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Spells;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// The rules glossary (knowledge/features/rules-glossary.md): an admin uploads it, every
// signed-in user reads it. The texts here are made up; the real ones never enter the repository.
public sealed class GlossaryTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private static readonly List<GlossaryEntryView> Entries =
    [
        new("Festgesetzt", "Zustand", "Erfundener Text.\r\n\r\nSiehe „[[Gepackt]]“."),
        new("Gepackt", " Zustand ", "  Noch ein erfundener Text.  "),
        new("Vorteil", null, "Wirf zwei W20."),
    ];

    [Fact]
    public async Task An_admin_uploads_the_glossary_and_everyone_signed_in_reads_it()
    {
        var player = await fixture.App.CreatePersonAsync("Mira");
        var admin = new Person(await fixture.App.CreateUserAsync("Admin", isAdmin: true), null!);
        admin = admin with { Client = fixture.App.CreateClientFor(admin.User) };

        Assert.Equal(HttpStatusCode.Forbidden,
            (await player.Client.PutAsJsonAsync("/api/admin/rules/glossary", new UploadGlossaryRequest(Entries), Json)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await fixture.App.CreateClient().GetAsync("/api/rules/glossary")).StatusCode);

        var uploaded = await (await admin.Client.PutAsJsonAsync("/api/admin/rules/glossary", new UploadGlossaryRequest(Entries), Json))
            .ReadAsync<UploadGlossaryResponse>(HttpStatusCode.OK);
        Assert.Equal(3, uploaded.Entries);

        var glossary = await (await player.Client.GetAsync("/api/rules/glossary")).ReadAsync<List<GlossaryEntryView>>(HttpStatusCode.OK);
        Assert.Equal(
            [
                new GlossaryEntryView("Festgesetzt", "Zustand", "Erfundener Text.\n\nSiehe „[[Gepackt]]“."),
                new GlossaryEntryView("Gepackt", "Zustand", "Noch ein erfundener Text."),
                new GlossaryEntryView("Vorteil", null, "Wirf zwei W20."),
            ],
            glossary);

        // A new upload replaces the whole glossary.
        (await admin.Client.PutAsJsonAsync("/api/admin/rules/glossary", new UploadGlossaryRequest([Entries[2]]), Json)).EnsureSuccessStatusCode();
        var replaced = await (await player.Client.GetAsync("/api/rules/glossary")).ReadAsync<List<GlossaryEntryView>>(HttpStatusCode.OK);
        Assert.Equal(["Vorteil"], replaced.Select(e => e.Name));

        await (await admin.Client.PutAsJsonAsync("/api/admin/rules/glossary", new UploadGlossaryRequest([Entries[0], Entries[0] with { Name = "festgesetzt" }]), Json))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.GlossaryInvalid, "entries[1]");
    }
}

[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class GlossaryUnitTests
{
    [Fact]
    public void An_upload_is_checked_entry_by_entry()
    {
        string? Field(List<GlossaryEntryView>? entries) => GlossaryEndpoints.Validate(entries).Error?.Field;
        var ok = new GlossaryEntryView("Blind", "Zustand", "Text");
        Assert.Null(Field([ok]));
        Assert.Equal("entries", Field([]));
        Assert.Equal("entries", Field(null));
        Assert.Equal("entries", Field([.. Enumerable.Range(0, GlossaryEntry.MaxEntries + 1).Select(i => ok with { Name = $"E{i}" })]));
        Assert.Equal("entries[1]", Field([ok, ok with { Name = " " }]));
        Assert.Equal("entries[0]", Field([ok with { Name = new string('x', GlossaryEntry.NameMaxLength + 1) }]));
        Assert.Equal("entries[0]", Field([ok with { Tag = new string('x', GlossaryEntry.TagMaxLength + 1) }]));
        Assert.Equal("entries[0]", Field([ok with { Text = "  " }]));
        Assert.Equal("entries[0]", Field([ok with { Text = new string('x', GlossaryEntry.TextMaxLength + 1) }]));
        var (saved, _) = GlossaryEndpoints.Validate([ok, ok with { Name = "Taub", Tag = "" }]);
        Assert.Equal([("Blind", "Zustand", 0), ("Taub", null, 1)], saved!.Select(e => (e.Name, e.Tag, e.Position)));
    }

    [Fact]
    public void Spell_import_asks_to_mark_the_glossary_terms_only_when_there_is_a_glossary()
    {
        Assert.Equal(SpellImportPrompts.WikiSystem, SpellImportPrompts.WikiSystemWith([]));
        var system = SpellImportPrompts.WikiSystemWith(["Festgesetzt", "Vorteil"]);
        Assert.StartsWith(SpellImportPrompts.WikiSystem, system);
        Assert.Contains("[[festgesetzt]]", system);
        Assert.EndsWith("The terms: Festgesetzt, Vorteil.", system);
    }
}
