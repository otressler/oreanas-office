using System.Net;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Sync;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests.Images;

// Where a finished background shows up: the image itself for members of a campaign that
// uses it (knowledge/decisions/persistence.md), the board (knowledge/domain/encounter.md)
// and copies from the store (knowledge/domain/battle-map.md, "What a copy takes").
[Collection("Images")]
public sealed class BackgroundUseTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    [Fact]
    public async Task Members_of_the_campaign_load_the_image_and_others_dont()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var player = await fixture.App.CreatePersonAsync("Brom");
        await player.JoinAsync((await dm.GetCampaignAsync(campaignId)).JoinCode!);
        var stranger = await fixture.App.CreatePersonAsync("Fremder");
        var background = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);

        Assert.Equal(HttpStatusCode.OK, (await player.GetAssetAsync(background.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAssetAsync(background.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await dm.GetAssetAsync(Guid.NewGuid())).StatusCode);
        using var anonymous = fixture.App.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(background.Url)).StatusCode);
    }

    [Fact]
    public async Task An_image_whose_blob_is_missing_is_not_found()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var background = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        await fixture.App.InDbAsync(db => db.Assets.Where(a => a.Id == background.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.BlobName, $"maps/{mapId}/{Guid.NewGuid()}.png")));

        Assert.Equal(HttpStatusCode.NotFound, (await dm.GetAssetAsync(background.Id)).StatusCode);
    }

    [Fact]
    public async Task A_store_copy_takes_the_picked_background_and_its_members_load_it()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var background = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        var (otherDm, otherCampaign, _) = await fixture.App.DmWithMapAsync("Der Wald");
        var otherPlayer = await fixture.App.CreatePersonAsync("Lhorbarth");
        await otherPlayer.JoinAsync((await otherDm.GetCampaignAsync(otherCampaign)).JoinCode!);

        var copy = await AddFromStoreAsync(otherDm, otherCampaign, mapId);
        var list = await otherDm.ListBackgroundsAsync(otherCampaign, copy.Id);

        Assert.Equal(background.Id, list.PickedAssetId);
        var listed = Assert.Single(list.Versions);
        Assert.Equal((background.Id, mapId, AssetStatus.Done, false), (listed.Id, listed.MapId, listed.Status, listed.Outdated));
        Assert.Equal(HttpStatusCode.OK, (await otherPlayer.GetAssetAsync(background.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await otherDm.PickAsync(otherCampaign, copy.Id, background.Id)).StatusCode);
    }

    [Fact]
    public async Task A_store_copy_leaves_an_outdated_background_behind()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        await dm.PushOneAsync(Map(campaignId, mapId, 1, HallData() with { Width = 10 }));
        var (otherDm, otherCampaign, _) = await fixture.App.DmWithMapAsync("Der Wald");

        var copy = await AddFromStoreAsync(otherDm, otherCampaign, mapId);

        var list = await otherDm.ListBackgroundsAsync(otherCampaign, copy.Id);
        Assert.Null(list.PickedAssetId);
        Assert.Empty(list.Versions);
    }

    [Fact]
    public async Task A_revived_store_copy_keeps_its_own_background()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var first = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        var (otherDm, otherCampaign, _) = await fixture.App.DmWithMapAsync("Der Wald");
        var copy = await AddFromStoreAsync(otherDm, otherCampaign, mapId);
        await otherDm.PushOneAsync(Map(otherCampaign, copy.Id, copy.Version, copy.Map! with { ArchivedAt = DateTimeOffset.UtcNow }));
        var second = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        Assert.Equal(HttpStatusCode.NoContent, (await dm.PickAsync(campaignId, mapId, second.Id)).StatusCode);

        var revived = await AddFromStoreAsync(otherDm, otherCampaign, mapId);

        Assert.Equal(copy.Id, revived.Id);
        Assert.Equal(first.Id, (await otherDm.ListBackgroundsAsync(otherCampaign, copy.Id)).PickedAssetId);
    }

    [Fact]
    public async Task The_board_shows_the_maps_background_until_the_fight_starts_and_then_the_one_it_saved()
    {
        fixture.App.ResetFakeImages();
        var table = await fixture.App.CreateEncounterTableAsync();
        var (dm, campaignId, mapId) = (table.Dm, table.CampaignId, table.Encounter.BattleMapId);
        var draft = (await dm.PushOneAsync(Encounter(campaignId, table.Session.Id, mapId, name: "Später"))).Id;
        Assert.Null((await BoardAsync(dm, campaignId, table.Encounter.Id)).Background);

        var first = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        var ready = (await BoardAsync(dm, campaignId, table.Encounter.Id)).Background;
        Assert.Equal(new BoardBackground(first.Id, $"/api/assets/{first.Id}", 0, 0, 8, 5, 0), ready);

        Assert.Equal(HttpStatusCode.OK, (await dm.StartEncounterAsync(campaignId, table.Session.Id, table.Encounter.Id)).StatusCode);
        var second = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        Assert.Equal(HttpStatusCode.NoContent, (await dm.PickAsync(campaignId, mapId, second.Id)).StatusCode);

        Assert.Equal(first.Id, (await BoardAsync(table.Player, campaignId, table.Encounter.Id)).Background?.AssetId);
        Assert.Equal(second.Id, (await BoardAsync(dm, campaignId, draft)).Background?.AssetId);
        Assert.Equal(first.Id, await fixture.App.InDbAsync(db => db.Encounters.Where(e => e.Id == table.Encounter.Id).Select(e => e.BackgroundAssetId).SingleAsync()));

        // A resize hides the map's background on draft boards, not on the started fight.
        var map = await dm.FetchOneAsync(campaignId, mapId);
        await dm.PushOneAsync(Map(campaignId, mapId, map.Version, map.Map! with { Width = 9 }));
        Assert.Null((await BoardAsync(dm, campaignId, draft)).Background);
        Assert.Equal(first.Id, (await BoardAsync(dm, campaignId, table.Encounter.Id)).Background?.AssetId);

        Assert.Equal(HttpStatusCode.OK, (await dm.EndEncounterAsync(campaignId, table.Session.Id, table.Encounter.Id)).StatusCode);
        Assert.Equal(first.Id, (await BoardAsync(dm, campaignId, table.Encounter.Id)).Background?.AssetId);
    }

    [Fact]
    public async Task A_fight_started_without_a_usable_background_keeps_none()
    {
        fixture.App.ResetFakeImages();
        var table = await fixture.App.CreateEncounterTableAsync();

        Assert.Equal(HttpStatusCode.OK, (await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id)).StatusCode);
        await fixture.App.GenerateAndWaitAsync(table.Dm, table.CampaignId, table.Encounter.BattleMapId);

        Assert.Null((await BoardAsync(table.Dm, table.CampaignId, table.Encounter.Id)).Background);
    }

    [Fact]
    public async Task Members_of_a_campaign_whose_fight_saved_the_image_still_load_it()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var source = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        var (otherDm, otherCampaign, _) = await fixture.App.DmWithMapAsync("Der Wald");
        var otherPlayer = await fixture.App.CreatePersonAsync("Lhorbarth");
        await otherPlayer.JoinAsync((await otherDm.GetCampaignAsync(otherCampaign)).JoinCode!);
        var copy = await AddFromStoreAsync(otherDm, otherCampaign, copyOf: mapId);
        var session = await otherDm.CreateSessionAsync(otherCampaign);
        var encounter = (await otherDm.PushOneAsync(Encounter(otherCampaign, session.Id, copy.Id, status: EncounterStatus.Ready))).Id;
        await otherDm.ActivateSessionAsync(otherCampaign, session.Id);
        Assert.Equal(HttpStatusCode.OK, (await otherDm.StartEncounterAsync(otherCampaign, session.Id, encounter)).StatusCode);

        // The copy gets its own background; only the fight still points to the source's.
        var own = await fixture.App.GenerateAndWaitAsync(otherDm, otherCampaign, copy.Id);
        Assert.Equal(HttpStatusCode.NoContent, (await otherDm.PickAsync(otherCampaign, copy.Id, own.Id)).StatusCode);

        Assert.Equal(source.Id, (await BoardAsync(otherPlayer, otherCampaign, encounter)).Background?.AssetId);
        Assert.Equal(HttpStatusCode.OK, (await otherPlayer.GetAssetAsync(source.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await otherPlayer.GetAssetAsync(own.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await dm.GetAssetAsync(own.Id)).StatusCode);
    }

    private static async Task<SyncServerItem> AddFromStoreAsync(Person dm, Guid campaignId, Guid copyOf) =>
        await (await dm.Client.PostAsync($"/api/campaigns/{campaignId}/map-store/{copyOf}", null)).ReadAsync<SyncServerItem>(HttpStatusCode.OK);

    private static async Task<BoardMap> BoardAsync(Person person, Guid campaignId, Guid encounterId) =>
        (await (await person.GetBoardAsync(campaignId, encounterId)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK)).Map;
}
