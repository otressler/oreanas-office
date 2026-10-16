using System.Net;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Images.Guide;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests.Images;

// The job queue against the fake image model (knowledge/implementation-plan.md, stage 7):
// one job at a time, retries, failures, 429 waits and restarts.
[Collection("Images")]
public sealed class ImageJobWorkerTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    // FakeImageClient.DefaultUsage at the default rates: 1536 × $8 + 385 × $5 + 1372 × $30 per million.
    private const decimal DefaultCost = 0.055373m;

    [Fact]
    public async Task A_job_paints_stores_prices_and_picks_the_first_background()
    {
        var fake = fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        await using var watcher = await ImageTestClient.WatchAsync(fixture.App, dm.Id, campaignId, mapId);

        var queued = await dm.QueueAsync(campaignId, mapId);
        var updates = await watcher.UntilAsync(queued.Id, s => s is AssetStatus.Done or AssetStatus.Failed);

        Assert.Equal([AssetStatus.Running, AssetStatus.Done], updates.Select(u => u.Status));
        var done = updates[^1];
        Assert.Equal(($"/api/assets/{queued.Id}", mapId, false, false), (done.Url, done.MapId, done.Outdated, done.LayoutChanged));
        Assert.NotNull(done.FinishedAt);

        var request = Assert.Single(fake.Requests);
        var frame = GuideRenderer.Measure(8, 5);
        Assert.Equal(
            (frame.PixelWidth, frame.PixelHeight, "high", "jpeg", 85),
            (request.Width, request.Height, request.Quality, request.OutputFormat, request.OutputCompression));
        var asset = await fixture.App.AssetAsync(queued.Id);
        Assert.Equal(
            (AssetStatus.Done, 1, $"maps/{mapId}/{queued.Id}.png", "image/png", (decimal?)DefaultCost, (AssetFailure?)null),
            (asset.Status, asset.Attempts, asset.BlobName, asset.ContentType, asset.CostUsd, asset.Failure));
        Assert.Equal(request.Prompt, asset.Prompt);
        Assert.NotNull(asset.StartedAt);

        var list = await dm.ListBackgroundsAsync(campaignId, mapId);
        Assert.Equal(queued.Id, list.PickedAssetId);
        Assert.True(list.Budget.SpentUsd >= DefaultCost);

        var image = await dm.GetAssetAsync(queued.Id);
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal("image/png", image.Content.Headers.ContentType?.MediaType);
        Assert.Equal(ImageEndpoints.CacheControl, image.Headers.NonValidated["Cache-Control"].ToString());
        Assert.NotNull(image.Headers.ETag);
        Assert.Equal(request.GuidePng, await image.Content.ReadAsByteArrayAsync());
    }

    [Fact]
    public async Task A_new_version_doesnt_replace_a_usable_pick()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var first = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);

        var second = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);

        Assert.Equal(AssetStatus.Done, second.Status);
        Assert.Equal(first.Id, (await dm.ListBackgroundsAsync(campaignId, mapId)).PickedAssetId);
    }

    [Fact]
    public async Task A_new_version_replaces_an_outdated_pick()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        await dm.PushOneAsync(Map(campaignId, mapId, 1, HallData() with { Width = 10 }));

        var second = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);

        Assert.Equal((10, 5, false), (second.GridWidth, second.GridHeight, second.Outdated));
        Assert.Equal(second.Id, (await dm.ListBackgroundsAsync(campaignId, mapId)).PickedAssetId);
    }

    [Fact]
    public async Task A_failed_attempt_is_tried_again()
    {
        var fake = fixture.App.ResetFakeImages();
        fake.EnqueueFailure(new HttpRequestException("Verbindung abgebrochen"));
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        await using var watcher = await ImageTestClient.WatchAsync(fixture.App, dm.Id, campaignId, mapId);

        var queued = await dm.QueueAsync(campaignId, mapId);
        var updates = await watcher.UntilAsync(queued.Id, s => s is AssetStatus.Done or AssetStatus.Failed);

        Assert.Equal([AssetStatus.Running, AssetStatus.Queued, AssetStatus.Running, AssetStatus.Done], updates.Select(u => u.Status));
        Assert.Equal(2, (await fixture.App.AssetAsync(queued.Id)).Attempts);
        Assert.Equal(2, fake.Requests.Count);
    }

    [Fact]
    public async Task A_job_fails_after_the_last_attempt()
    {
        var fake = fixture.App.ResetFakeImages();
        for (var i = 0; i < 3; i++)
        {
            fake.EnqueueFailure(new InvalidOperationException("kaputt"));
        }

        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();

        var failed = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);

        Assert.Equal((AssetStatus.Failed, (AssetFailure?)AssetFailure.Error, (string?)null), (failed.Status, failed.Failure, failed.Url));
        var asset = await fixture.App.AssetAsync(failed.Id);
        Assert.Equal((3, (decimal?)null, (string?)null), (asset.Attempts, asset.CostUsd, asset.BlobName));
        Assert.NotNull(asset.FinishedAt);
        Assert.Null((await dm.ListBackgroundsAsync(campaignId, mapId)).PickedAssetId);
        Assert.Equal(HttpStatusCode.NotFound, (await dm.GetAssetAsync(failed.Id)).StatusCode);

        // A failed job doesn't block the next one.
        var next = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        Assert.Equal(AssetStatus.Done, next.Status);
    }

    [Fact]
    public async Task A_rejected_request_fails_at_once()
    {
        var fake = fixture.App.ResetFakeImages();
        fake.EnqueueFailure(new ImageRejectedException("Your request was rejected by the safety system."));
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();

        var failed = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);

        Assert.Equal((AssetStatus.Failed, (AssetFailure?)AssetFailure.Rejected), (failed.Status, failed.Failure));
        Assert.Equal(1, (await fixture.App.AssetAsync(failed.Id)).Attempts);
        Assert.Single(fake.Requests);
    }

    [Fact]
    public async Task A_busy_model_is_waited_out_without_counting_an_attempt()
    {
        var fake = fixture.App.ResetFakeImages();
        fake.EnqueueFailure(new ImageRateLimitedException(TimeSpan.FromMilliseconds(50)));
        fake.EnqueueFailure(new ImageRateLimitedException(TimeSpan.FromMilliseconds(50)));
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();

        var done = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);

        Assert.Equal(AssetStatus.Done, done.Status);
        Assert.Equal(1, (await fixture.App.AssetAsync(done.Id)).Attempts);
        Assert.Equal(3, fake.Requests.Count);
    }

    [Fact]
    public async Task A_job_paints_the_map_as_it_is_when_it_runs()
    {
        var fake = fixture.App.ResetFakeImages();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fake.Gate = gate;
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var otherMap = (await dm.PushOneAsync(Map(campaignId, data: HallData("Keller")))).Id;
        await using var watcher = await ImageTestClient.WatchAsync(fixture.App, dm.Id, campaignId, otherMap);
        await using var watcher2 = await ImageTestClient.WatchAsync(fixture.App, dm.Id, campaignId, mapId);
        MapBackground waiting;
        try
        {
            // The other map's job holds the worker, so this map's job waits in the queue
            // while the map grows.
            var blocker = await dm.QueueAsync(campaignId, otherMap);
            await watcher.RunningAsync(blocker.Id);
            waiting = await dm.QueueAsync(campaignId, mapId);
            await dm.PushOneAsync(Map(campaignId, mapId, 1, HallData() with { Width = 10 }));
            fake.Gate = null;
            gate.SetResult();
            await watcher.EndedAsync(blocker.Id);
        }
        finally
        {
            gate.TrySetResult();
        }

        var done = await watcher2.EndedAsync(waiting.Id);

        var frame = GuideRenderer.Measure(10, 5);
        var request = fake.Requests.Last();
        Assert.Equal((frame.PixelWidth, frame.PixelHeight), (request.Width, request.Height));
        Assert.Equal((AssetStatus.Done, 10, 5, 10, 5, false), (done.Status, done.GridWidth, done.GridHeight, done.Width, done.Height, done.Outdated));
        var asset = await fixture.App.AssetAsync(waiting.Id);
        Assert.Equal(LayoutFingerprint.Of(10, 5, Hall()), asset.LayoutHash);
        Assert.Equal(request.Prompt, asset.Prompt);
    }

    [Fact]
    public async Task A_job_for_a_map_archived_meanwhile_fails()
    {
        var fake = fixture.App.ResetFakeImages();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fake.Gate = gate;
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var otherMap = (await dm.PushOneAsync(Map(campaignId, data: HallData("Keller")))).Id;
        await using var watcher = await ImageTestClient.WatchAsync(fixture.App, dm.Id, campaignId, otherMap);
        await using var watcher2 = await ImageTestClient.WatchAsync(fixture.App, dm.Id, campaignId, mapId);
        MapBackground waiting;
        try
        {
            var blocker = await dm.QueueAsync(campaignId, otherMap);
            await watcher.RunningAsync(blocker.Id);
            waiting = await dm.QueueAsync(campaignId, mapId);
            await dm.PushOneAsync(Map(campaignId, mapId, 1, HallData(archivedAt: DateTimeOffset.UtcNow)));
            fake.Gate = null;
            gate.SetResult();
            await watcher.EndedAsync(blocker.Id);
        }
        finally
        {
            gate.TrySetResult();
        }

        var failed = await watcher2.EndedAsync(waiting.Id);

        Assert.Equal((AssetStatus.Failed, (AssetFailure?)AssetFailure.Error), (failed.Status, failed.Failure));
        Assert.Single(fake.Requests);
    }

    [Fact]
    public async Task A_job_cut_off_by_a_restart_finishes_after_the_next_start()
    {
        fixture.App.ResetFakeImages();
        Guid campaignId, mapId, assetId;
        Person dm;
        await using (var first = fixture.CreateApp(runsImageJobs: true))
        {
            var held = first.Services.GetRequiredService<FakeImageClient>();
            held.Gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            (dm, campaignId, mapId) = await first.DmWithMapAsync();
            await using var watcher = await ImageTestClient.WatchAsync(first, dm.Id, campaignId, mapId);
            assetId = (await dm.QueueAsync(campaignId, mapId)).Id;
            await watcher.RunningAsync(assetId);
        }

        // Shutdown left it Running.
        Assert.Equal(AssetStatus.Running, (await fixture.App.AssetAsync(assetId)).Status);

        var fake = new FakeImageClient { Gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously) };
        await using var second = fixture.CreateApp(runsImageJobs: true).WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<FakeImageClient>();
            services.AddSingleton(fake);
        }));
        await using var watcher2 = await ImageTestClient.WatchAsync(second, dm.Id, campaignId, mapId);
        fake.Gate.SetResult();
        var done = await watcher2.EndedAsync(assetId);

        Assert.Equal(AssetStatus.Done, done.Status);
        Assert.Equal(2, (await fixture.App.AssetAsync(assetId)).Attempts);
        var dmHere = new Person(dm.User, fixture.App.CreateClientFor(dm.User));
        Assert.Equal(assetId, (await dmHere.ListBackgroundsAsync(campaignId, mapId)).PickedAssetId);
    }
}
