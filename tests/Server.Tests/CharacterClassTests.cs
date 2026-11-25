using System.Net;
using System.Net.Http.Json;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Rules;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// knowledge/rules/handbook-classes.md and knowledge/domain/character.md: the Handbook's
// classes in the database, and a character's classes with levels and subclasses.
public sealed class CharacterClassTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    [Fact]
    public async Task Every_signed_in_user_reads_the_handbooks_classes_in_german_and_english()
    {
        var player = await fixture.App.CreatePersonAsync("Brom");

        var classes = await (await player.Client.GetAsync("/api/rules/classes")).ReadAsync<List<ClassView>>(HttpStatusCode.OK);

        Assert.Equal(12, classes.Count);
        var fighter = classes.Single(c => c.Id == "fighter");
        Assert.Equal(("Fighter", "Kämpfer", (SpellcastingKind?)null), (fighter.NameEn, fighter.NameDe, fighter.Caster));
        Assert.Equal(["battle-master", "champion", "eldritch-knight", "psi-warrior"], fighter.Subclasses.Select(s => s.Id));
        Assert.Equal(
            new SubclassView("eldritch-knight", "Eldritch Knight", "Mystischer Ritter", "wizard"),
            fighter.Subclasses.Single(s => s.Id == "eldritch-knight"));

        using var anonymous = fixture.App.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/rules/classes")).StatusCode);
    }

    [Fact]
    public async Task A_character_keeps_its_classes_in_order_and_changes_them_in_place()
    {
        var (player, campaignId) = await PlayerAsync();

        var created = await (await player.Client.PostAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters",
                new CharacterRequest("Ireena", CreatureSize.Medium, Classes: [new("wizard", 5, "evoker"), new("fighter", 2)]),
                Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.Created);
        Assert.Equal([new CharacterClassView("wizard", 5, "evoker"), new CharacterClassView("fighter", 2, null)], created.Classes);

        // Fighter levels up and gets a subclass and moves to the front; Wizard goes; Rogue comes.
        var changed = await (await player.Client.PutAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters/{created.Id}",
                new CharacterRequest("Ireena", CreatureSize.Medium, Classes: [new("fighter", 3, "eldritch-knight"), new("rogue", 1)]),
                Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.OK);
        Assert.Equal([new CharacterClassView("fighter", 3, "eldritch-knight"), new CharacterClassView("rogue", 1, null)], changed.Classes);
        var listed = Assert.Single(await ListAsync(player, campaignId));
        Assert.Equal(changed.Classes, listed.Classes);

        var cleared = await (await player.Client.PutAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters/{created.Id}", new CharacterRequest("Ireena", CreatureSize.Medium), Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.OK);
        Assert.Empty(cleared.Classes);
    }

    [Fact]
    public async Task A_subclass_before_level_3_is_refused()
    {
        var (player, campaignId) = await PlayerAsync();

        var response = await player.Client.PostAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters",
            new CharacterRequest("Ireena", CreatureSize.Medium, Classes: [new("cleric", 2, "life-domain")]),
            Json);

        await response.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.CharacterClassInvalid, "classes");
    }

    private static async Task<List<CharacterResponse>> ListAsync(Person person, Guid campaignId) =>
        await (await person.Client.GetAsync($"/api/campaigns/{campaignId}/characters"))
            .ReadAsync<List<CharacterResponse>>(HttpStatusCode.OK);

    private async Task<(Person Player, Guid CampaignId)> PlayerAsync()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        await player.JoinAsync(campaign.JoinCode!);
        return (player, campaign.Id);
    }
}
