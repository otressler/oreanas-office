using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Images;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests.Images;

// Campaign covers (knowledge/domain/campaign.md): generated from the name and description or
// uploaded, picked, shown on the home page's card; `dm` members only.
[Collection("Images")]
public sealed class CampaignCoverTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    [Fact]
    public async Task Only_dm_members_see_and_change_the_covers()
    {
        fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var id = table.CampaignId;

        foreach (var person in new[] { table.Player, table.Stranger })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await person.Client.GetAsync(CoversUrl(id))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await person.GenerateCoverAsync(id)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await person.UploadCoverAsync(id, TestPictures.SplitJpeg(60, 40))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await person.PickCoverAsync(id, null)).StatusCode);
        }

        var upload = await table.SecondDm.UploadCoverOkAsync(id);
        var list = await table.Dm.ListCoversAsync(id);
        Assert.Equal((upload.Id, AssetOwnerType.Campaign, id), (list.PickedAssetId, upload.OwnerType, upload.OwnerId));
    }

    [Fact]
    public async Task An_upload_becomes_the_picked_cover_everyone_in_the_campaign_sees()
    {
        var table = await fixture.App.CreateTokenTableAsync();

        var upload = await table.Dm.UploadCoverOkAsync(table.CampaignId, TestPictures.SplitJpeg(400, 400));

        var asset = await fixture.App.AssetAsync(upload.Id);
        Assert.Equal(
            (AssetKind.CampaignCover, AssetOrigin.Uploaded, AssetStatus.Done, $"covers/campaign/{table.CampaignId}/{upload.Id}.webp"),
            (asset.Kind, asset.Origin, asset.Status, asset.BlobName));
        var url = $"/api/assets/{upload.Id}";
        Assert.Equal(url, (await table.Player.GetCampaignAsync(table.CampaignId)).CoverUrl);
        Assert.Equal(url, (await table.Player.CampaignSummaryAsync(table.CampaignId)).CoverUrl);

        // A 3:2 picture, cut from the middle of the square upload.
        var image = await table.Player.GetAssetAsync(upload.Id);
        using var bitmap = TestPictures.Decode(await image.Content.ReadAsByteArrayAsync());
        Assert.Equal((1200, 800), (bitmap.Width, bitmap.Height));
        Assert.Equal(HttpStatusCode.NotFound, (await table.Stranger.GetAssetAsync(upload.Id)).StatusCode);

        Assert.Equal(HttpStatusCode.NoContent, (await table.Dm.PickCoverAsync(table.CampaignId, null)).StatusCode);
        Assert.Null((await table.Player.CampaignSummaryAsync(table.CampaignId)).CoverUrl);
    }

    [Fact]
    public async Task Generating_needs_a_description()
    {
        var table = await fixture.App.CreateTokenTableAsync();

        var response = await table.Dm.GenerateCoverAsync(table.CampaignId);

        await response.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.DescriptionMissing);
    }

    [Fact]
    public async Task A_cover_is_painted_wide_and_opaque_from_the_name_and_description()
    {
        var fake = fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        await table.Dm.UpdateCampaignAsync(table.CampaignId, "Die Gruft", "Ein Fluch liegt über dem Tal.");

        await using var watcher = await TokenImageTestClient.WatchAsync(
            fixture.App, table.Dm.Id, table.CampaignId, AssetOwnerType.Campaign, table.CampaignId);
        var queued = await (await table.Dm.GenerateCoverAsync(table.CampaignId)).ReadAsync<TokenImage>(HttpStatusCode.Accepted);
        var done = await watcher.EndedAsync(queued.Id);

        Assert.Equal(AssetStatus.Done, done.Status);
        var request = Assert.Single(fake.GenerateRequests);
        Assert.Equal((1536, 1024, "opaque", "jpeg"), (request.Width, request.Height, request.Background, request.OutputFormat));
        Assert.StartsWith("Cover illustration for a tabletop role-playing campaign: Die Gruft, Ein Fluch liegt über dem Tal.", request.Prompt);
        Assert.Equal(done.Id, (await table.Dm.ListCoversAsync(table.CampaignId)).PickedAssetId);
        using var bitmap = TestPictures.Decode(await (await table.Dm.GetAssetAsync(done.Id)).Content.ReadAsByteArrayAsync());
        Assert.Equal((1200, 800), (bitmap.Width, bitmap.Height));
    }

    [Fact]
    public async Task Players_cannot_watch_a_campaigns_covers()
    {
        var table = await fixture.App.CreateTokenTableAsync();
        await using var player = await TokenImageTestClient.ConnectAsync(fixture.App, table.Player.Id);
        await using var dm = await TokenImageTestClient.ConnectAsync(fixture.App, table.Dm.Id);
        var other = await fixture.App.CreateTokenTableAsync();

        Assert.Equal(ApiErrorCode.NotADm, (await player.WatchAsync(table.CampaignId, AssetOwnerType.Campaign, table.CampaignId)).Error);
        Assert.Equal(ApiErrorCode.ItemNotFound, (await dm.WatchAsync(table.CampaignId, AssetOwnerType.Campaign, other.CampaignId)).Error);
    }

    private static string CoversUrl(Guid campaignId) => $"/api/campaigns/{campaignId}/covers";
}

public static class CampaignCoverTestApi
{
    public static Task<HttpResponseMessage> GenerateCoverAsync(this Person person, Guid campaignId) =>
        person.Client.PostAsJsonAsync($"/api/campaigns/{campaignId}/covers", new GenerateTokenImageRequest(), Json);

    public static Task<HttpResponseMessage> PickCoverAsync(this Person person, Guid campaignId, Guid? assetId) =>
        person.Client.PutAsJsonAsync($"/api/campaigns/{campaignId}/cover", new PickTokenImageRequest(assetId), Json);

    public static Task<HttpResponseMessage> UploadCoverAsync(this Person person, Guid campaignId, byte[] picture)
    {
        var content = new ByteArrayContent(picture);
        content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
        return person.Client.PostAsync($"/api/campaigns/{campaignId}/covers/upload", content);
    }

    public static async Task<TokenImage> UploadCoverOkAsync(this Person person, Guid campaignId, byte[]? picture = null) =>
        await (await person.UploadCoverAsync(campaignId, picture ?? TestPictures.SplitJpeg(300, 200)))
            .ReadAsync<TokenImage>(HttpStatusCode.Created);

    public static async Task<TokenImagesResponse> ListCoversAsync(this Person person, Guid campaignId) =>
        await (await person.Client.GetAsync($"/api/campaigns/{campaignId}/covers")).ReadAsync<TokenImagesResponse>(HttpStatusCode.OK);
}
