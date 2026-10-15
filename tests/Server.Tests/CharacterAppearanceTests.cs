using System.Net;
using System.Net.Http.Json;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Rules;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// A character's appearance feeds its portrait prompt (knowledge/domain/character.md).
[Collection("App")]
public sealed class CharacterAppearanceTests(AppFixture fixture)
{
    [Fact]
    public async Task The_appearance_is_saved_trimmed()
    {
        var (player, campaignId) = await PlayerAsync();

        var created = await (await player.Client.PostAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters", new CharacterRequest("Thorin", CreatureSize.Medium, "  Zwerg, roter Bart \n"), Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.Created);
        var updated = await (await player.Client.PutAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters/{created.Id}", new CharacterRequest("Thorin", CreatureSize.Medium, " Zwerg mit Helm "), Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.OK);
        var cleared = await (await player.Client.PutAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters/{created.Id}", new CharacterRequest("Thorin", CreatureSize.Medium), Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.OK);

        Assert.Equal(("Zwerg, roter Bart", "Zwerg mit Helm", ""), (created.Appearance, updated.Appearance, cleared.Appearance));
    }

    [Fact]
    public async Task An_appearance_over_500_characters_is_refused()
    {
        var (player, campaignId) = await PlayerAsync();
        var character = await player.CreateCharacterAsync(campaignId, "Thorin");

        var create = await player.Client.PostAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters", new CharacterRequest("Aria", CreatureSize.Medium, new string('x', 501)), Json);
        var update = await player.Client.PutAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters/{character.Id}", new CharacterRequest("Thorin", CreatureSize.Medium, new string('x', 501)), Json);
        var atLimit = await player.Client.PutAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters/{character.Id}", new CharacterRequest("Thorin", CreatureSize.Medium, new string('x', 500)), Json);

        await create.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.TextTooLong, "appearance");
        await update.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.TextTooLong, "appearance");
        Assert.Equal(500, (await atLimit.ReadAsync<CharacterResponse>(HttpStatusCode.OK)).Appearance.Length);
    }

    private async Task<(Person Player, Guid CampaignId)> PlayerAsync()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        await player.JoinAsync(campaign.JoinCode!);
        return (player, campaign.Id);
    }
}
