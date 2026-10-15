using OreanasOffice.Server.Api;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Tests.Images;

// Who may watch a creature type's icons or a character's portraits on the image hub
// (ImageHub.WatchTokenImages).
[Collection("App")]
public sealed class TokenImageHubTests(AppFixture fixture)
{
    [Fact]
    public async Task Creature_type_icons_are_watched_by_dm_members_only()
    {
        var table = await fixture.App.CreateTokenTableAsync();
        var other = await fixture.App.CreateTokenTableAsync();

        Assert.Null(await WatchAsync(table.Dm, table.CampaignId, AssetOwnerType.CreatureType, table.CreatureTypeId));
        Assert.Null(await WatchAsync(table.SecondDm, table.CampaignId, AssetOwnerType.CreatureType, table.CreatureTypeId));
        Assert.Equal(ApiErrorCode.NotADm, await WatchAsync(table.Player, table.CampaignId, AssetOwnerType.CreatureType, table.CreatureTypeId));
        Assert.Equal(ApiErrorCode.NotADm, await WatchAsync(table.Stranger, table.CampaignId, AssetOwnerType.CreatureType, table.CreatureTypeId));
        Assert.Equal(ApiErrorCode.ItemNotFound, await WatchAsync(table.Dm, table.CampaignId, AssetOwnerType.CreatureType, other.CreatureTypeId));
    }

    [Fact]
    public async Task Portraits_are_watched_by_the_owner_and_dm_members()
    {
        var table = await fixture.App.CreateTokenTableAsync();
        var other = await fixture.App.CreateTokenTableAsync();

        Assert.Null(await WatchAsync(table.Player, table.CampaignId, AssetOwnerType.Character, table.CharacterId));
        Assert.Null(await WatchAsync(table.SecondDm, table.CampaignId, AssetOwnerType.Character, table.CharacterId));
        Assert.Equal(ApiErrorCode.NotADm, await WatchAsync(table.OtherPlayer, table.CampaignId, AssetOwnerType.Character, table.CharacterId));
        Assert.Equal(ApiErrorCode.NotADm, await WatchAsync(table.Stranger, table.CampaignId, AssetOwnerType.Character, table.CharacterId));
        Assert.Equal(ApiErrorCode.ItemNotFound, await WatchAsync(table.Dm, table.CampaignId, AssetOwnerType.Character, other.CharacterId));
        Assert.Equal(ApiErrorCode.ItemNotFound, await WatchAsync(table.Dm, table.CampaignId, AssetOwnerType.Character, Guid.NewGuid()));
    }

    [Fact]
    public async Task Maps_are_not_watched_as_token_images()
    {
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();

        Assert.Equal(ApiErrorCode.ItemNotFound, await WatchAsync(dm, campaignId, AssetOwnerType.BattleMap, mapId));
    }

    private async Task<ApiErrorCode?> WatchAsync(CampaignTestApi.Person person, Guid campaignId, AssetOwnerType ownerType, Guid ownerId)
    {
        await using var client = await TokenImageTestClient.ConnectAsync(fixture.App, person.Id);
        return (await client.WatchAsync(campaignId, ownerType, ownerId)).Error;
    }
}
