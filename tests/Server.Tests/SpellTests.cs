using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Spells;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SpellTestApi;

namespace OreanasOffice.Server.Tests;

// knowledge/features/spell-cards.md and knowledge/domain/spell.md: the site-wide library,
// variants that only their author changes, and characters' spells.
public sealed class SpellTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private static string Json(SpellCard card) => JsonSerializer.Serialize(card, CampaignTestApi.Json);

    [Fact]
    public async Task The_library_holds_the_handbooks_spells_with_their_class_lists()
    {
        var mira = await fixture.App.CreatePersonAsync("Mira");

        var library = await (await mira.Client.GetAsync("/api/spells")).ReadAsync<List<SpellSummary>>(HttpStatusCode.OK);

        Assert.Equal(390, library.Count);
        // A spell nobody wrote a card for yet shows the German Handbook's name.
        var foresight = Assert.Single(library, s => s.NameEn == "Foresight");
        Assert.Equal((9, SpellSchool.Divination, "Voraussicht", 0), (foresight.Level, foresight.School, foresight.Name, foresight.VariantCount));
        var moonbeam = Assert.Single(library, s => s.NameEn == "Moonbeam");
        Assert.Contains(new SpellListLink("druid", "circle-of-the-moon", 3), moonbeam.Lists);
        Assert.Contains(new SpellListLink("paladin", "oath-of-the-ancients", 5), moonbeam.Lists);
        // The class lists come first.
        Assert.Equal(new SpellListLink("druid", null, null), moonbeam.Lists[0]);
    }

    [Fact]
    public async Task Variants_join_their_handbook_spell()
    {
        var mira = await fixture.App.CreatePersonAsync("Mira");
        var brom = await fixture.App.CreatePersonAsync("Brom");

        var first = await mira.CreateSpellAsync("Moonbeam");
        var second = await brom.CreateSpellAsync("Moonbeam", Card("Mondlicht"));

        Assert.Equal(first.SpellId, second.SpellId);
        Assert.Equal(("Moonbeam", 2, SpellSchool.Evocation), (second.NameEn, second.Level, second.School));
        Assert.Equal((mira.Id, "Mira", true), (first.Author.Id, first.Author.DisplayName, first.CanEdit));

        var spell = await brom.GetSpellAsync(first.SpellId);
        Assert.True(spell.InHandbook);
        Assert.Contains(new SpellListLink("druid", null, null), spell.Lists);
        var ours = spell.Variants.Where(v => v.Id == first.Id || v.Id == second.Id).ToList();
        Assert.Equal([first.Id, second.Id], ours.Select(v => v.Id));
        Assert.Equal([false, true], ours.Select(v => v.CanEdit));
        Assert.Equal(Json(Card()), Json(ours[0].Card));
    }

    [Fact]
    public async Task Only_the_author_or_an_admin_changes_a_variant()
    {
        var author = await fixture.App.CreatePersonAsync("Mira");
        var other = await fixture.App.CreatePersonAsync("Brom");
        var admin = new Person(await fixture.App.CreateUserAsync("Admin", isAdmin: true), null!);
        admin = admin with { Client = fixture.App.CreateClientFor(admin.User) };
        var variant = await author.CreateSpellAsync();

        await (await other.UpdateVariantAsync(variant.Id, Card("Fremd"))).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.NotSpellAuthor);
        await (await other.Client.DeleteAsync($"/api/spells/variants/{variant.Id}")).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.NotSpellAuthor);

        var edited = await (await author.UpdateVariantAsync(variant.Id, Card("  Mondstrahl der Alten  ")))
            .ReadAsync<SpellVariantView>(HttpStatusCode.OK);
        Assert.Equal("Mondstrahl der Alten", edited.Card.Name);

        var fixedByAdmin = await (await admin.UpdateVariantAsync(variant.Id, Card("Mondstrahl"))).ReadAsync<SpellVariantView>(HttpStatusCode.OK);
        Assert.Equal(("Mondstrahl", true), (fixedByAdmin.Card.Name, fixedByAdmin.CanEdit));
    }

    [Fact]
    public async Task Cards_are_checked_and_trimmed()
    {
        var mira = await fixture.App.CreatePersonAsync("Mira");
        var spellId = (await mira.LibrarySpellAsync("Moonbeam")).Id;

        await (await mira.CreateVariantAsync(new CreateVariantRequest(spellId, Card() with { Icon = "unicorn" })))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.SpellInvalid, "card.icon");
        await (await mira.CreateVariantAsync(new CreateVariantRequest(spellId, Card(new string('x', 61)))))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.SpellInvalid, "card.name");
        await (await mira.CreateVariantAsync(new CreateVariantRequest(Guid.NewGuid(), Card())))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.SpellNotFound, "spellId");
        var tooManyRows = Card() with { Effects = [.. Enumerable.Repeat(Card().Effects[0], 7)] };
        await (await mira.CreateVariantAsync(new CreateVariantRequest(spellId, tooManyRows)))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.SpellInvalid, "card.effects");
        var badChip = Card() with { Effects = [Card().Effects[0] with { Chip = new SpellChip { Big = "" } }] };
        await (await mira.CreateVariantAsync(new CreateVariantRequest(spellId, badChip)))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.SpellInvalid, "card.effects[0]");

        var saved = await mira.CreateSpellAsync("Moonbeam", Card() with { Tip = "  Tipp\r\n\r\n\r\n\r\nzwei  ", Pips = ["moon", "star"] });
        Assert.Equal("Tipp\n\nzwei", saved.Card.Tip);
        Assert.Equal(["moon", "star"], saved.Card.Pips);
    }

    [Fact]
    public async Task A_variant_in_use_stays_and_a_handbook_spell_stays_without_variants()
    {
        var (_, player, campaignId) = await fixture.App.CreateSpellTableAsync();
        var character = await player.CreateCharacterAsync(campaignId, "Liriel");
        var used = await player.CreateSpellAsync();
        (await player.SetCharacterSpellAsync(campaignId, character.Id, used.SpellId, used.Id)).EnsureSuccessStatusCode();

        await (await player.Client.DeleteAsync($"/api/spells/variants/{used.Id}")).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.VariantInUse);

        var unused = await player.CreateSpellAsync("Dream");
        Assert.Equal(HttpStatusCode.NoContent, (await player.Client.DeleteAsync($"/api/spells/variants/{unused.Id}")).StatusCode);
        var spell = await player.GetSpellAsync(unused.SpellId);
        Assert.DoesNotContain(spell.Variants, v => v.Id == unused.Id);
    }

    [Fact]
    public async Task A_spell_that_isnt_the_handbooks_keeps_its_variants_but_leaves_the_library()
    {
        var (_, player, campaignId) = await fixture.App.CreateSpellTableAsync();
        var character = await player.CreateCharacterAsync(campaignId, "Liriel");
        var variant = await player.CreateSpellAsync("Shillelagh");
        (await player.SetCharacterSpellAsync(campaignId, character.Id, variant.SpellId, variant.Id)).EnsureSuccessStatusCode();
        // Moves the variant to a spell from before the library was limited, as HandbookSync leaves it.
        var oldSpellId = Guid.NewGuid();
        await using (var scope = fixture.App.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var name = $"Buzzing Bee {oldSpellId:N}";
            db.Spells.Add(new Spell { Id = oldSpellId, NameEn = name, NameKey = Spell.KeyOf(name), Level = 0, School = SpellSchool.Evocation });
            await db.SaveChangesAsync();
            await db.SpellVariants.Where(v => v.Id == variant.Id).ExecuteUpdateAsync(set => set.SetProperty(v => v.SpellId, oldSpellId));
            await db.CharacterSpells.Where(c => c.VariantId == variant.Id).ExecuteUpdateAsync(set => set.SetProperty(c => c.SpellId, oldSpellId));
        }

        var library = await (await player.Client.GetAsync("/api/spells")).ReadAsync<List<SpellSummary>>(HttpStatusCode.OK);
        Assert.DoesNotContain(library, s => s.Id == oldSpellId);
        Assert.False((await player.GetSpellAsync(oldSpellId)).InHandbook);
        Assert.Equal([variant.Id], (await player.ListCharacterSpellsAsync(campaignId, character.Id)).Select(s => s.Variant.Id));
        await (await player.CreateVariantAsync(new CreateVariantRequest(oldSpellId, Card())))
            .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.SpellNotInHandbook, "spellId");
    }

    [Fact]
    public async Task Whoever_edits_a_character_keeps_its_spells_and_every_member_reads_them()
    {
        var (dm, player, campaignId) = await fixture.App.CreateSpellTableAsync();
        var otherPlayer = await fixture.App.CreatePersonAsync("Brom");
        await otherPlayer.JoinAsync((await dm.GetCampaignAsync(campaignId)).JoinCode!);
        var stranger = await fixture.App.CreatePersonAsync("Fremd");
        var character = await player.CreateCharacterAsync(campaignId, "Liriel");
        var moonbeam = await dm.CreateSpellAsync("Moonbeam", Card("Mondstrahl"));
        var ownVariant = await player.CreateSpellAsync("Moonbeam", Card("Mondlicht"));
        var cantrip = await dm.CreateSpellAsync("Mending", Card("Ausbessern"));

        var added = await (await player.SetCharacterSpellAsync(campaignId, character.Id, moonbeam.SpellId, moonbeam.Id))
            .ReadAsync<CharacterSpellView>(HttpStatusCode.OK);
        Assert.Equal((moonbeam.Id, false, 1), (added.Variant.Id, added.Prepared, added.Variant.UsedBy));
        (await player.SetCharacterSpellAsync(campaignId, character.Id, cantrip.SpellId, cantrip.Id, prepared: true)).EnsureSuccessStatusCode();

        // Switching the variant keeps the entry; prepared stays unless it is sent.
        var switched = await (await player.SetCharacterSpellAsync(campaignId, character.Id, moonbeam.SpellId, ownVariant.Id, prepared: true))
            .ReadAsync<CharacterSpellView>(HttpStatusCode.OK);
        Assert.Equal((ownVariant.Id, true), (switched.Variant.Id, switched.Prepared));
        var dmChange = await (await dm.SetCharacterSpellAsync(campaignId, character.Id, moonbeam.SpellId, ownVariant.Id))
            .ReadAsync<CharacterSpellView>(HttpStatusCode.OK);
        Assert.True(dmChange.Prepared);

        // A variant of another spell doesn't fit.
        await (await player.SetCharacterSpellAsync(campaignId, character.Id, moonbeam.SpellId, cantrip.Id))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.SpellNotFound, "variantId");

        var read = await otherPlayer.ListCharacterSpellsAsync(campaignId, character.Id);
        Assert.Equal(["Ausbessern", "Mondlicht"], read.Select(s => s.Variant.Card.Name));
        Assert.Equal(HttpStatusCode.Forbidden, (await otherPlayer.SetCharacterSpellAsync(campaignId, character.Id, cantrip.SpellId, cantrip.Id, false)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await otherPlayer.Client.DeleteAsync($"{CharacterSpellsUrl(campaignId, character.Id)}/{cantrip.SpellId}")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.Client.GetAsync(CharacterSpellsUrl(campaignId, character.Id))).StatusCode);

        var all = await (await otherPlayer.Client.GetAsync($"/api/campaigns/{campaignId}/character-spells"))
            .ReadAsync<Dictionary<Guid, List<CharacterSpellView>>>(HttpStatusCode.OK);
        Assert.Equal(2, all[character.Id].Count);

        Assert.Equal(HttpStatusCode.NoContent, (await player.Client.DeleteAsync($"{CharacterSpellsUrl(campaignId, character.Id)}/{cantrip.SpellId}")).StatusCode);
        Assert.Equal(["Mondlicht"], (await player.ListCharacterSpellsAsync(campaignId, character.Id)).Select(s => s.Variant.Card.Name));
    }

    [Fact]
    public async Task An_imported_character_brings_its_spells()
    {
        var (dm, player, here) = await fixture.App.CreateSpellTableAsync();
        var there = await dm.CreateCampaignAsync("Die Rabenküste");
        await player.JoinAsync(there.JoinCode!);
        var source = await player.CreateCharacterAsync(there.Id, "Thorin", CreatureSize.Small);
        var spell = await player.CreateSpellAsync();
        (await player.SetCharacterSpellAsync(there.Id, source.Id, spell.SpellId, spell.Id, prepared: true)).EnsureSuccessStatusCode();

        var copy = await (await player.Client.PostAsJsonAsync(
                $"/api/campaigns/{here}/characters/import", new ImportCharacterRequest(source.Id), CampaignTestApi.Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.Created);

        var spells = await player.ListCharacterSpellsAsync(here, copy.Id);
        Assert.Equal([(spell.Id, true)], spells.Select(s => (s.Variant.Id, s.Prepared)));
    }
}
