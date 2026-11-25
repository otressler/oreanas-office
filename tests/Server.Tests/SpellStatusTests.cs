using System.Net;
using System.Net.Http.Json;
using OreanasOffice.Server.Spells;
using OreanasOffice.Server.Statuses;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SpellTestApi;
using static OreanasOffice.Server.Tests.StatusTestApi;

namespace OreanasOffice.Server.Tests;

// knowledge/features/spell-cards.md, "Statuses when a spell is added": a spell added to a
// character offers the statuses its card names that the character's list is missing; a spell
// status is one per campaign and spell. Hex and Entangle get cards only here.
public sealed class SpellStatusTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private static readonly Guid Restrained = Library("restrained");

    private static SpellCard Hex(string name) => Card(name) with { Icon = "eye", OfferStatus = true, Concentration = true, Statuses = [] };

    private static string OffersUrl(Guid campaignId, Guid characterId, Guid spellId) =>
        $"{CharacterSpellsUrl(campaignId, characterId)}/{spellId}/status-offers";

    private static async Task<List<SpellStatusOffer>> OffersAsync(Person person, Guid campaignId, Guid characterId, Guid spellId) =>
        await (await person.Client.GetAsync(OffersUrl(campaignId, characterId, spellId))).ReadAsync<List<SpellStatusOffer>>(HttpStatusCode.OK);

    private static Task<HttpResponseMessage> AddAsync(Person person, Guid campaignId, Guid characterId, Guid spellId, params string[] keys) =>
        person.Client.PostAsJsonAsync(
            $"{CharacterSpellsUrl(campaignId, characterId)}/{spellId}/statuses", new AddSpellStatusesRequest([.. keys]), Json);

    [Fact]
    public async Task A_spell_offers_its_own_status_and_konzentration_and_one_status_serves_the_campaign()
    {
        var (dm, player, campaignId) = await fixture.App.CreateSpellTableAsync();
        var liriel = await player.CreateCharacterAsync(campaignId, "Liriel");
        var brom = await dm.CreateCharacterAsync(campaignId, "Brom");
        var hex = await player.CreateSpellAsync("Hex", Hex("Ver|hexen"));
        var otherHex = await dm.CreateSpellAsync("Hex", Hex("Fluch") with { Icon = "skull" });

        // Nothing is offered for a spell the character doesn't have.
        Assert.Equal(HttpStatusCode.NotFound, (await player.Client.GetAsync(OffersUrl(campaignId, liriel.Id, hex.SpellId))).StatusCode);

        (await player.SetCharacterSpellAsync(campaignId, liriel.Id, hex.SpellId, hex.Id)).EnsureSuccessStatusCode();
        Assert.Equal(
            [
                new SpellStatusOffer(SpellStatuses.SpellKey, null, "Verhexen", null, "eye"),
                new SpellStatusOffer("concentration", "concentration", "Konzentration", "/statuses/concentration.webp", null),
            ],
            await OffersAsync(player, campaignId, liriel.Id, hex.SpellId));

        // Only who may edit the character sees and takes the offers.
        var otherPlayer = await fixture.App.CreatePersonAsync("Yara");
        await otherPlayer.JoinAsync((await dm.GetCampaignAsync(campaignId)).JoinCode!);
        Assert.Equal(HttpStatusCode.Forbidden, (await otherPlayer.Client.GetAsync(OffersUrl(campaignId, liriel.Id, hex.SpellId))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AddAsync(otherPlayer, campaignId, liriel.Id, hex.SpellId, "concentration")).StatusCode);

        // Taking only the spell's status leaves Konzentration on offer.
        var list = await (await AddAsync(player, campaignId, liriel.Id, hex.SpellId, SpellStatuses.SpellKey)).ReadAsync<StatusListResponse>(HttpStatusCode.OK);
        var made = list.Statuses[^1];
        Assert.Equal([.. ConditionIds, made.Id], list.Statuses.Select(s => s.Id));
        Assert.Equal((null, "Verhexen", null, liriel.Id, hex.SpellId, "eye"), (made.LibraryKey, made.Name, made.IconUrl, made.CharacterId, made.SpellId, made.SpellIcon));
        Assert.Equal(["concentration"], (await OffersAsync(player, campaignId, liriel.Id, hex.SpellId)).Select(o => o.Key));

        // Another character with another variant gets the campaign's status, as it was made.
        (await dm.SetCharacterSpellAsync(campaignId, brom.Id, otherHex.SpellId, otherHex.Id)).EnsureSuccessStatusCode();
        Assert.Equal(
            new SpellStatusOffer(SpellStatuses.SpellKey, null, "Verhexen", null, "eye"),
            (await OffersAsync(dm, campaignId, brom.Id, hex.SpellId))[0]);
        var bromList = await (await AddAsync(dm, campaignId, brom.Id, hex.SpellId, SpellStatuses.SpellKey, "concentration"))
            .ReadAsync<StatusListResponse>(HttpStatusCode.OK);
        Assert.Equal([made.Id, Concentration], bromList.Statuses.TakeLast(2).Select(s => s.Id));
        Assert.Empty(await OffersAsync(dm, campaignId, brom.Id, hex.SpellId));

        var all = await (await player.Client.GetAsync($"/api/campaigns/{campaignId}/statuses")).ReadAsync<List<StatusDefinitionView>>(HttpStatusCode.OK);
        Assert.Single(all, s => s.SpellId == hex.SpellId);

        // Removing the spell keeps its status in the list.
        (await player.Client.DeleteAsync($"{CharacterSpellsUrl(campaignId, liriel.Id)}/{hex.SpellId}")).EnsureSuccessStatusCode();
        Assert.Contains(made.Id, (await player.GetCharacterListAsync(campaignId, liriel.Id)).Statuses.Select(s => s.Id));
    }

    [Fact]
    public async Task A_spell_offers_the_conditions_its_card_names_that_the_list_is_missing()
    {
        var (_, player, campaignId) = await fixture.App.CreateSpellTableAsync();
        var liriel = await player.CreateCharacterAsync(campaignId, "Liriel");
        var entangle = await player.CreateSpellAsync(
            "Entangle", Card("Verstricken") with { Concentration = false, Statuses = ["restrained", "prone"] });
        (await player.SetCharacterSpellAsync(campaignId, liriel.Id, entangle.SpellId, entangle.Id)).EnsureSuccessStatusCode();

        // The list has every condition: nothing to offer.
        Assert.Empty(await OffersAsync(player, campaignId, liriel.Id, entangle.SpellId));

        (await player.SetCharacterListAsync(campaignId, liriel.Id, [.. ConditionIds.Where(id => id != Restrained && id != Prone)])).EnsureSuccessStatusCode();
        Assert.Equal(["prone", "restrained"], (await OffersAsync(player, campaignId, liriel.Id, entangle.SpellId)).Select(o => o.Key));

        // Keys not on offer are skipped.
        var list = await (await AddAsync(player, campaignId, liriel.Id, entangle.SpellId, "restrained", "concentration", SpellStatuses.SpellKey, "nonsense"))
            .ReadAsync<StatusListResponse>(HttpStatusCode.OK);
        Assert.Equal(Restrained, list.Statuses[^1].Id);
        Assert.DoesNotContain(Concentration, list.Statuses.Select(s => s.Id));
        Assert.Equal(["prone"], (await OffersAsync(player, campaignId, liriel.Id, entangle.SpellId)).Select(o => o.Key));
    }
}
