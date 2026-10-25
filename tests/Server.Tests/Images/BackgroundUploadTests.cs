using System.Net;
using System.Net.Http.Headers;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Sync;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests.Images;

// The DM's own backgrounds and placing the picked one (knowledge/features/ai-map-generation.md,
// "Uploads"; knowledge/domain/battle-map.md, "Background image").
public sealed class BackgroundUploadTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    [Fact]
    public async Task An_upload_is_stored_as_webp_listed_and_picked()
    {
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();

        var created = await (await UploadAsync(dm, campaignId, mapId, TestPictures.OpaquePng(400, 200), "image/png"))
            .ReadAsync<MapBackground>(HttpStatusCode.Created);

        Assert.Equal(AssetOrigin.Uploaded, created.Origin);
        Assert.Equal(AssetStatus.Done, created.Status);
        // An 8×5 map: the 2:1 picture fits 8 cells wide, centred.
        Assert.Equal((0d, 0.5d, 8d, 4d), (created.X, created.Y, created.Width, created.Height));
        Assert.False(created.LayoutChanged);
        var list = await dm.ListBackgroundsAsync(campaignId, mapId);
        Assert.Equal(created.Id, list.PickedAssetId);
        var asset = await dm.GetAssetAsync(created.Id);
        Assert.Equal(HttpStatusCode.OK, asset.StatusCode);
        Assert.Equal("image/webp", asset.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Anything_but_a_png_webp_or_jpeg_is_refused()
    {
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();

        var gif = await UploadAsync(dm, campaignId, mapId, "GIF89a"u8.ToArray(), "image/gif");
        var disguised = await UploadAsync(dm, campaignId, mapId, TestPictures.OpaquePng(10, 10), "image/webp");

        await gif.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.UploadInvalid);
        await disguised.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.UploadInvalid);
        Assert.Empty((await dm.ListBackgroundsAsync(campaignId, mapId)).Versions);
    }

    [Fact]
    public async Task An_upload_cant_be_refined()
    {
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var upload = await (await UploadAsync(dm, campaignId, mapId, TestPictures.OpaquePng(80, 50), "image/png"))
            .ReadAsync<MapBackground>(HttpStatusCode.Created);
        var version = (await dm.FetchOneAsync(campaignId, mapId)).Version;

        var response = await dm.RefineAsync(campaignId, mapId, version, upload.Id, "breiter");

        await response.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.BackgroundNotFound);
    }

    [Fact]
    public async Task Players_cant_upload()
    {
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var player = await fixture.App.CreatePersonAsync("Brom");
        await player.JoinAsync((await dm.GetCampaignAsync(campaignId)).JoinCode!);

        var response = await UploadAsync(player, campaignId, mapId, TestPictures.OpaquePng(10, 10), "image/png");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task An_upload_survives_a_resize_and_the_board_draws_it_where_the_dm_placed_it()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var (dm, campaignId, mapId) = (table.Dm, table.CampaignId, table.Encounter.BattleMapId);
        var upload = await (await UploadAsync(dm, campaignId, mapId, TestPictures.Webp(300, 300), "image/webp"))
            .ReadAsync<MapBackground>(HttpStatusCode.Created);

        var map = await dm.FetchOneAsync(campaignId, mapId);
        var placement = new BackgroundPlacement(upload.Id, -1.5, 0.25, 12.5, 12.5, 2.5);
        var saved = await dm.PushOneAsync(Map(
            campaignId, mapId, map.Version, map.Map! with { Width = map.Map.Width + 1, BackgroundPlacement = placement, GridStyle = MapGridStyle.Faint }));
        Assert.Equal(SyncOutcome.Saved, saved.Outcome);

        var board = await BoardAsync(dm, campaignId, table.Encounter.Id);
        Assert.Equal(new BoardBackground(upload.Id, upload.Url!, -1.5, 0.25, 12.5, 12.5, 2.5), board.Background);
        Assert.Equal(MapGridStyle.Faint, board.Grid);
        Assert.False((await dm.ListBackgroundsAsync(campaignId, mapId)).Versions.Single().Outdated);
    }

    [Fact]
    public async Task A_placement_made_for_another_version_is_ignored()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var (dm, campaignId, mapId) = (table.Dm, table.CampaignId, table.Encounter.BattleMapId);
        var upload = await (await UploadAsync(dm, campaignId, mapId, TestPictures.Webp(300, 300), "image/webp"))
            .ReadAsync<MapBackground>(HttpStatusCode.Created);
        var map = await dm.FetchOneAsync(campaignId, mapId);
        await dm.PushOneAsync(Map(
            campaignId, mapId, map.Version, map.Map! with { BackgroundPlacement = new BackgroundPlacement(Guid.NewGuid(), 3, 3, 1, 1, 45) }));

        var board = await BoardAsync(dm, campaignId, table.Encounter.Id);

        Assert.Equal(new BoardBackground(upload.Id, upload.Url!, upload.X, upload.Y, upload.Width, upload.Height, 0), board.Background);
    }

    [Fact]
    public async Task A_placement_outside_the_limits_is_rejected()
    {
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var map = await dm.FetchOneAsync(campaignId, mapId);

        var result = await dm.PushOneAsync(Map(
            campaignId, mapId, map.Version, map.Map! with { BackgroundPlacement = new BackgroundPlacement(Guid.NewGuid(), 0, 0, 0, 5, 0) }));

        Assert.Equal(SyncOutcome.Rejected, result.Outcome);
        Assert.Equal(ApiErrorCode.LayoutInvalid, result.Error?.Code);
    }

    [Fact]
    public async Task A_started_fight_keeps_the_placement_and_grid_style_it_started_with()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var (dm, campaignId, mapId) = (table.Dm, table.CampaignId, table.Encounter.BattleMapId);
        var upload = await (await UploadAsync(dm, campaignId, mapId, TestPictures.Webp(300, 300), "image/webp"))
            .ReadAsync<MapBackground>(HttpStatusCode.Created);
        var map = await dm.FetchOneAsync(campaignId, mapId);
        var placement = new BackgroundPlacement(upload.Id, 1, 1, 4, 4, 90);
        await dm.PushOneAsync(Map(campaignId, mapId, map.Version, map.Map! with { BackgroundPlacement = placement, GridStyle = MapGridStyle.Hidden }));
        Assert.Equal(HttpStatusCode.OK, (await dm.StartEncounterAsync(campaignId, table.Session.Id, table.Encounter.Id)).StatusCode);

        map = await dm.FetchOneAsync(campaignId, mapId);
        await dm.PushOneAsync(Map(campaignId, mapId, map.Version, map.Map! with { BackgroundPlacement = null, GridStyle = MapGridStyle.Normal }));
        var board = await BoardAsync(table.Player, campaignId, table.Encounter.Id);

        Assert.Equal(new BoardBackground(upload.Id, upload.Url!, 1, 1, 4, 4, 90), board.Background);
        Assert.Equal(MapGridStyle.Hidden, board.Grid);
    }

    private static Task<HttpResponseMessage> UploadAsync(Person person, Guid campaignId, Guid mapId, byte[] picture, string contentType)
    {
        var content = new ByteArrayContent(picture);
        content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return person.Client.PostAsync($"{ImageTestApi.BackgroundsUrl(campaignId, mapId)}/upload", content);
    }

    private static async Task<BoardMap> BoardAsync(Person person, Guid campaignId, Guid encounterId) =>
        (await (await person.GetBoardAsync(campaignId, encounterId)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK)).Map;
}
