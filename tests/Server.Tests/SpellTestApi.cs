using System.Net;
using System.Net.Http.Json;
using OreanasOffice.Server.Spells;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// Shortcuts for the spell tests (knowledge/features/spell-cards.md). Spells are site-wide and
// test classes share one database, so every test makes spells of its own English names.
public static class SpellTestApi
{
    public static string UniqueName(string name) => $"{name} {Guid.NewGuid():N}";

    public static SpellCard Card(string name = "Mondstrahl") => new()
    {
        Name = name,
        CastingTime = "1 Aktion",
        Range = "36 m",
        Components = "V, G, M",
        Duration = "bis 1 Minute",
        Concentration = true,
        Description = "Ein silbriger Strahl. **Konstitutionsrettungswurf**: 2W10 gleißender Schaden.",
        Effects =
        [
            new SpellEffect
            {
                Icon = "moon",
                Title = "Zylinder 1,5 m",
                Text = "RW Konstitution",
                Chip = new SpellChip { Big = "2W10", Small = "Gleißend", Kind = SpellChipKind.Radiant },
            },
        ],
        Icon = "moon",
        Pips = ["moon"],
        HigherLevels = "+1W10 je Grad über 2",
        Material = "ein Mondsamenblatt",
        WriteIns = [SpellWriteIn.SaveDc],
    };

    public static Task<HttpResponseMessage> CreateVariantAsync(this Person person, CreateVariantRequest request) =>
        person.Client.PostAsJsonAsync("/api/spells/variants", request, Json);

    public static async Task<SpellVariantView> CreateSpellAsync(
        this Person person, string? nameEn = null, SpellCard? card = null, int level = 2, SpellSchool school = SpellSchool.Evocation) =>
        await (await person.CreateVariantAsync(new CreateVariantRequest(nameEn ?? UniqueName("Moonbeam"), level, school, card ?? Card())))
            .ReadAsync<SpellVariantView>(HttpStatusCode.Created);

    public static async Task<SpellDetail> GetSpellAsync(this Person person, Guid spellId) =>
        await (await person.Client.GetAsync($"/api/spells/{spellId}")).ReadAsync<SpellDetail>(HttpStatusCode.OK);

    public static Task<HttpResponseMessage> UpdateVariantAsync(this Person person, Guid variantId, SpellCard card) =>
        person.Client.PutAsJsonAsync($"/api/spells/variants/{variantId}", new UpdateVariantRequest(card), Json);

    public static string CharacterSpellsUrl(Guid campaignId, Guid characterId) =>
        $"/api/campaigns/{campaignId}/characters/{characterId}/spells";

    public static Task<HttpResponseMessage> SetCharacterSpellAsync(
        this Person person, Guid campaignId, Guid characterId, Guid spellId, Guid variantId, bool? prepared = null) =>
        person.Client.PutAsJsonAsync(
            $"{CharacterSpellsUrl(campaignId, characterId)}/{spellId}", new SetCharacterSpellRequest(variantId, prepared), Json);

    public static async Task<List<CharacterSpellView>> ListCharacterSpellsAsync(this Person person, Guid campaignId, Guid characterId) =>
        await (await person.Client.GetAsync(CharacterSpellsUrl(campaignId, characterId)))
            .ReadAsync<List<CharacterSpellView>>(HttpStatusCode.OK);

    // A campaign with a DM and a player who joined it.
    public static async Task<(Person Dm, Person Player, Guid CampaignId)> CreateSpellTableAsync(this AppFactory app)
    {
        var dm = await app.CreatePersonAsync("Oreana");
        var player = await app.CreatePersonAsync("Mira");
        var campaign = await dm.CreateCampaignAsync("Die Mondklamm");
        await player.JoinAsync(campaign.JoinCode!);
        return (dm, player, campaign.Id);
    }
}
