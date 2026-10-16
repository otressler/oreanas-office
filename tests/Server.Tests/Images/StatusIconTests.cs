using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Statuses;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.StatusTestApi;

namespace OreanasOffice.Server.Tests.Images;

// Icons of custom statuses through the token image pipeline (knowledge/features/statuses.md,
// "Custom statuses"): who may generate and pick them, the job with the "Status icon"
// template, the automatic pick, and who loads the picture. The campaign is
// TokenImageTestApi's: Oreana and Yara are `dm` members, Brom plays Thorin, Kira is
// another player.
[Collection("Images")]
public sealed class StatusIconTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private static string IconsUrl(Guid campaignId, Guid statusId) => $"/api/campaigns/{campaignId}/statuses/{statusId}/icons";

    [Fact]
    public async Task A_status_icon_job_paints_the_status_and_picks_its_icon()
    {
        var fake = fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var hexed = await table.Player.CreateStatusOkAsync(table.CampaignId, "Verhext", table.CharacterId, "a purple eye inside a hand");
        await using var watcher = await TokenImageTestClient.WatchAsync(
            fixture.App, table.Player.Id, table.CampaignId, AssetOwnerType.Status, hexed.Id);

        var response = await GenerateAsync(table.Player, table.CampaignId, hexed.Id);
        var queued = await response.ReadAsync<TokenImage>(HttpStatusCode.Accepted);
        var updates = await watcher.UntilAsync(queued.Id, s => s is AssetStatus.Done or AssetStatus.Failed);

        Assert.Equal(IconsUrl(table.CampaignId, hexed.Id), response.Headers.Location?.OriginalString);
        Assert.Equal((AssetOwnerType.Status, hexed.Id, AssetOrigin.Generated), (queued.OwnerType, queued.OwnerId, queued.Origin));
        Assert.Equal([AssetStatus.Running, AssetStatus.Done], updates.Select(u => u.Status));
        var request = Assert.Single(fake.GenerateRequests);
        Assert.Equal((1024, 1024, "high", "transparent", "png"), (request.Width, request.Height, request.Quality, request.Background, request.OutputFormat));
        Assert.Equal(TokenPrompt.StatusIcon("Verhext", "a purple eye inside a hand", new ImageOptions().TokenStyle), request.Prompt);

        var asset = await fixture.App.AssetAsync(queued.Id);
        Assert.Equal(
            (AssetKind.TokenIcon, table.CampaignId, $"tokens/status/{hexed.Id}/{queued.Id}.webp", "image/webp", (Guid?)table.Player.Id),
            (asset.Kind, asset.CampaignId, asset.BlobName, asset.ContentType, asset.CreatedByUserId));
        var list = await ListAsync(table.Player, table.CampaignId, hexed.Id);
        Assert.Equal(queued.Id, list.PickedAssetId);
        Assert.Equal([queued.Id], list.Versions.Select(v => v.Id));

        // The status shows its icon wherever it is listed, and every member loads it.
        var shown = Assert.Single(
            await (await table.OtherPlayer.Client.GetAsync($"/api/campaigns/{table.CampaignId}/statuses")).ReadAsync<List<StatusDefinitionView>>(HttpStatusCode.OK),
            s => s.Id == hexed.Id);
        Assert.Equal($"/api/assets/{queued.Id}", shown.IconUrl);
        Assert.Equal(HttpStatusCode.OK, (await table.OtherPlayer.GetAssetAsync(queued.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await table.Stranger.GetAssetAsync(queued.Id)).StatusCode);
    }

    [Fact]
    public async Task A_status_without_an_icon_description_is_painted_from_its_name()
    {
        var fake = fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var burning = await table.Dm.CreateStatusOkAsync(table.CampaignId, "Brennend");
        await using var watcher = await TokenImageTestClient.WatchAsync(
            fixture.App, table.SecondDm.Id, table.CampaignId, AssetOwnerType.Status, burning.Id);

        var queued = await (await GenerateAsync(table.SecondDm, table.CampaignId, burning.Id)).ReadAsync<TokenImage>(HttpStatusCode.Accepted);
        var done = await watcher.EndedAsync(queued.Id);

        Assert.Equal(AssetStatus.Done, done.Status);
        Assert.StartsWith("Status icon for a tabletop battle map: Brennend.\n", Assert.Single(fake.GenerateRequests).Prompt);
    }

    // Whoever may edit the character the status was made for; any `dm` member for a status
    // of a DM status list. Library statuses and other campaigns' statuses aren't found.
    [Fact]
    public async Task Only_who_may_edit_the_list_generates_and_picks()
    {
        fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var other = await fixture.App.CreateTokenTableAsync();
        var hexed = await table.Player.CreateStatusOkAsync(table.CampaignId, "Verhext", table.CharacterId);
        var burning = await table.Dm.CreateStatusOkAsync(table.CampaignId, "Brennend");
        var foreign = await other.Dm.CreateStatusOkAsync(other.CampaignId, "Fremd");

        foreach (var (person, status) in new[] { (table.OtherPlayer, hexed.Id), (table.Player, burning.Id), (table.Stranger, hexed.Id) })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await person.Client.GetAsync(IconsUrl(table.CampaignId, status))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await GenerateAsync(person, table.CampaignId, status)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await PickAsync(person, table.CampaignId, status, null)).StatusCode);
        }

        foreach (var status in new[] { Prone, foreign.Id, Guid.NewGuid() })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await table.Dm.Client.GetAsync(IconsUrl(table.CampaignId, status))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await GenerateAsync(table.Dm, table.CampaignId, status)).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await PickAsync(table.Dm, table.CampaignId, status, null)).StatusCode);
        }

        // The character's owner and every `dm` member may.
        Assert.Empty((await ListAsync(table.Player, table.CampaignId, hexed.Id)).Versions);
        Assert.Empty((await ListAsync(table.SecondDm, table.CampaignId, hexed.Id)).Versions);
        Assert.Empty((await ListAsync(table.SecondDm, table.CampaignId, burning.Id)).Versions);
    }

    [Fact]
    public async Task Picking_takes_a_finished_version_of_the_status_or_none()
    {
        fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var hexed = await table.Player.CreateStatusOkAsync(table.CampaignId, "Verhext", table.CharacterId);
        var cursed = await table.Player.CreateStatusOkAsync(table.CampaignId, "Verflucht", table.CharacterId);
        var first = await GenerateAndWaitAsync(table.Player, table.CampaignId, hexed.Id);
        var second = await GenerateAndWaitAsync(table.Player, table.CampaignId, hexed.Id);
        var cursedIcon = await GenerateAndWaitAsync(table.Player, table.CampaignId, cursed.Id);

        Assert.Equal(second.Id, (await ListAsync(table.Player, table.CampaignId, hexed.Id)).PickedAssetId);
        Assert.Equal(HttpStatusCode.NoContent, (await PickAsync(table.Dm, table.CampaignId, hexed.Id, first.Id)).StatusCode);
        Assert.Equal(first.Id, (await ListAsync(table.Player, table.CampaignId, hexed.Id)).PickedAssetId);
        await (await PickAsync(table.Player, table.CampaignId, hexed.Id, cursedIcon.Id))
            .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ImageNotFound);
        Assert.Equal(HttpStatusCode.NoContent, (await PickAsync(table.Player, table.CampaignId, hexed.Id, null)).StatusCode);
        var stored = await fixture.App.InDbAsync(db => db.StatusDefinitions.AsNoTracking().SingleAsync(s => s.Id == hexed.Id));
        Assert.Null(stored.IconAssetId);
    }

    [Fact]
    public async Task One_icon_job_per_status_at_a_time()
    {
        var fake = fixture.App.ResetFakeTokens();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fake.Gate = gate;
        var table = await fixture.App.CreateTokenTableAsync();
        var hexed = await table.Player.CreateStatusOkAsync(table.CampaignId, "Verhext", table.CharacterId);
        await using var watcher = await TokenImageTestClient.WatchAsync(
            fixture.App, table.Player.Id, table.CampaignId, AssetOwnerType.Status, hexed.Id);
        try
        {
            var queued = await (await GenerateAsync(table.Player, table.CampaignId, hexed.Id)).ReadAsync<TokenImage>(HttpStatusCode.Accepted);
            await (await GenerateAsync(table.SecondDm, table.CampaignId, hexed.Id))
                .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.GenerationRunning);
            fake.Gate = null;
            gate.SetResult();
            Assert.Equal(AssetStatus.Done, (await watcher.EndedAsync(queued.Id)).Status);
        }
        finally
        {
            gate.TrySetResult();
        }
    }

    // ImageHub.WatchTokenImages for statuses: the same people as the icon endpoints.
    [Fact]
    public async Task Status_icons_are_watched_by_who_may_generate_them()
    {
        var table = await fixture.App.CreateTokenTableAsync();
        var other = await fixture.App.CreateTokenTableAsync();
        var hexed = await table.Player.CreateStatusOkAsync(table.CampaignId, "Verhext", table.CharacterId);
        var burning = await table.Dm.CreateStatusOkAsync(table.CampaignId, "Brennend");
        var foreign = await other.Dm.CreateStatusOkAsync(other.CampaignId, "Fremd");

        Assert.Null(await WatchAsync(table.Player, table.CampaignId, hexed.Id));
        Assert.Null(await WatchAsync(table.SecondDm, table.CampaignId, hexed.Id));
        Assert.Null(await WatchAsync(table.SecondDm, table.CampaignId, burning.Id));
        Assert.Equal(ApiErrorCode.NotADm, await WatchAsync(table.OtherPlayer, table.CampaignId, hexed.Id));
        Assert.Equal(ApiErrorCode.NotADm, await WatchAsync(table.Player, table.CampaignId, burning.Id));
        Assert.Equal(ApiErrorCode.NotADm, await WatchAsync(table.Stranger, table.CampaignId, hexed.Id));
        Assert.Equal(ApiErrorCode.ItemNotFound, await WatchAsync(table.Dm, table.CampaignId, Prone));
        Assert.Equal(ApiErrorCode.ItemNotFound, await WatchAsync(table.Dm, table.CampaignId, foreign.Id));
    }

    private static Task<HttpResponseMessage> GenerateAsync(Person person, Guid campaignId, Guid statusId) =>
        person.Client.PostAsJsonAsync(IconsUrl(campaignId, statusId), new GenerateTokenImageRequest(), Json);

    private static Task<HttpResponseMessage> PickAsync(Person person, Guid campaignId, Guid statusId, Guid? assetId) =>
        person.Client.PutAsJsonAsync($"/api/campaigns/{campaignId}/statuses/{statusId}/icon", new PickTokenImageRequest(assetId), Json);

    private static async Task<TokenImagesResponse> ListAsync(Person person, Guid campaignId, Guid statusId) =>
        await (await person.Client.GetAsync(IconsUrl(campaignId, statusId))).ReadAsync<TokenImagesResponse>(HttpStatusCode.OK);

    private async Task<TokenImage> GenerateAndWaitAsync(Person person, Guid campaignId, Guid statusId)
    {
        await using var watcher = await TokenImageTestClient.WatchAsync(fixture.App, person.Id, campaignId, AssetOwnerType.Status, statusId);
        var queued = await (await GenerateAsync(person, campaignId, statusId)).ReadAsync<TokenImage>(HttpStatusCode.Accepted);
        var done = await watcher.EndedAsync(queued.Id);
        Assert.Equal(AssetStatus.Done, done.Status);
        return done;
    }

    private async Task<ApiErrorCode?> WatchAsync(Person person, Guid campaignId, Guid statusId)
    {
        await using var client = await TokenImageTestClient.ConnectAsync(fixture.App, person.Id);
        return (await client.WatchAsync(campaignId, AssetOwnerType.Status, statusId)).Error;
    }
}
