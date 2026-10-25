using System.Net;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Sync;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests.Images;

// What deleting a map does to its backgrounds (knowledge/domain/battle-map.md, "Deleting"):
// the files go unless something else shows them, and the rows stay for the monthly limit
// (knowledge/decisions/image-budget.md).
[Collection("Images")]
public sealed class BackgroundDeleteTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private IAssetStore Store => fixture.App.Services.GetRequiredService<IAssetStore>();

    [Fact]
    public async Task Deleting_a_map_deletes_its_images_but_keeps_what_they_cost()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var background = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        var before = await fixture.App.AssetAsync(background.Id);
        await dm.ArchiveMapAsync(campaignId, mapId);

        Assert.Equal(HttpStatusCode.NoContent, (await dm.DeleteMapAsync(campaignId, mapId)).StatusCode);

        var after = await fixture.App.AssetAsync(background.Id);
        Assert.Equal((AssetStatus.Done, (string?)null, before.CostUsd, before.FinishedAt), (after.Status, after.BlobName, after.CostUsd, after.FinishedAt));
        Assert.NotNull(before.CostUsd);
        Assert.Null(await Store.OpenReadAsync(before.BlobName!, CancellationToken.None));
        Assert.Equal(HttpStatusCode.NotFound, (await dm.GetAssetAsync(background.Id)).StatusCode);
    }

    [Fact]
    public async Task An_image_a_store_copy_shows_stays()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var background = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        var (otherDm, otherCampaign, _) = await fixture.App.DmWithMapAsync("Der Wald");
        await (await otherDm.Client.PostAsync($"/api/campaigns/{otherCampaign}/map-store/{mapId}", null))
            .ReadAsync<SyncServerItem>(HttpStatusCode.OK);
        await dm.ArchiveMapAsync(campaignId, mapId);

        Assert.Equal(HttpStatusCode.NoContent, (await dm.DeleteMapAsync(campaignId, mapId)).StatusCode);

        Assert.NotNull((await fixture.App.AssetAsync(background.Id)).BlobName);
        Assert.Equal(HttpStatusCode.OK, (await otherDm.GetAssetAsync(background.Id)).StatusCode);
    }

    [Fact]
    public async Task A_map_waits_for_its_running_job_before_it_can_be_deleted()
    {
        var fake = fixture.App.ResetFakeImages();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fake.Gate = gate;
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        await using var watcher = await ImageTestClient.WatchAsync(fixture.App, dm.Id, campaignId, mapId);
        MapBackground done;
        try
        {
            var job = await dm.QueueAsync(campaignId, mapId);
            await watcher.RunningAsync(job.Id);
            await dm.ArchiveMapAsync(campaignId, mapId);

            var whileRunning = await dm.DeleteMapAsync(campaignId, mapId);

            await whileRunning.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.GenerationRunning);
            gate.SetResult();
            done = await watcher.EndedAsync(job.Id);
        }
        finally
        {
            gate.TrySetResult();
            fake.Reset();
        }

        Assert.Equal(AssetStatus.Done, done.Status);
        Assert.Equal(HttpStatusCode.NoContent, (await dm.DeleteMapAsync(campaignId, mapId)).StatusCode);
        Assert.Null((await fixture.App.AssetAsync(done.Id)).BlobName);
    }
}
