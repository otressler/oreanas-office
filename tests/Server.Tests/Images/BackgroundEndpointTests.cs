using System.Net;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Maps;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests.Images;

// The background endpoints' rules and errors (knowledge/features/ai-map-generation.md,
// knowledge/domain/battle-map.md "Background image", knowledge/decisions/image-budget.md).
[Collection("Images")]
public sealed class BackgroundEndpointTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    [Fact]
    public async Task Generating_queues_a_version_with_the_maps_size_frame_and_layout()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        await using var watcher = await ImageTestClient.WatchAsync(fixture.App, dm.Id, campaignId, mapId);

        var queued = await dm.QueueAsync(campaignId, mapId);

        Assert.Equal(
            (mapId, AssetStatus.Queued, (string?)null, 8, 5, 0, 0, 8, 5, false, false),
            (queued.MapId, queued.Status, queued.Url, queued.GridWidth, queued.GridHeight, queued.X, queued.Y, queued.Width, queued.Height, queued.Outdated, queued.LayoutChanged));
        var asset = await fixture.App.AssetAsync(queued.Id);
        Assert.Equal(
            (AssetKind.MapBackground, AssetOwnerType.BattleMap, mapId, campaignId, AssetOrigin.Generated, "fake-image", "high", dm.Id),
            (asset.Kind, asset.OwnerType, asset.OwnerId, asset.CampaignId, asset.Origin, asset.Model, asset.Quality, asset.CreatedByUserId));
        Assert.Equal(LayoutFingerprint.Of(8, 5, Hall()), asset.LayoutHash);
        await watcher.EndedAsync(queued.Id);

        // The worker builds the prompt from the map when the job runs.
        Assert.Contains("Eine Halle", (await fixture.App.AssetAsync(queued.Id)).Prompt);
    }

    [Fact]
    public async Task A_map_of_another_campaign_is_not_found()
    {
        var (_, _, otherMap) = await fixture.App.DmWithMapAsync("Fremd");
        var (dm, campaignId, _) = await fixture.App.DmWithMapAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await dm.Client.GetAsync(ImageTestApi.BackgroundsUrl(campaignId, otherMap))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await dm.GenerateAsync(campaignId, otherMap, 1)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await dm.PickAsync(campaignId, otherMap, null)).StatusCode);
    }

    [Fact]
    public async Task An_archived_map_is_not_found_for_generating()
    {
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var archived = await dm.PushOneAsync(Map(campaignId, mapId, 1, HallData(archivedAt: DateTimeOffset.UtcNow)));

        var response = await dm.GenerateAsync(campaignId, mapId, archived.Server!.Version);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Players_and_strangers_are_refused_like_other_dm_routes()
    {
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var player = await fixture.App.CreatePersonAsync("Brom");
        await player.JoinAsync((await dm.GetCampaignAsync(campaignId)).JoinCode!);
        var stranger = await fixture.App.CreatePersonAsync("Fremder");

        foreach (var person in new[] { player, stranger })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await person.Client.GetAsync(ImageTestApi.BackgroundsUrl(campaignId, mapId))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await person.GenerateAsync(campaignId, mapId, 1)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await person.PickAsync(campaignId, mapId, null)).StatusCode);
        }

        await using var hub = await ImageTestClient.ConnectAsync(fixture.App, player.Id);
        Assert.Equal(ApiErrorCode.NotADm, (await hub.WatchMapAsync(campaignId, mapId)).Error);
    }

    [Fact]
    public async Task Generating_needs_the_map_version_the_server_has()
    {
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        await dm.PushOneAsync(Map(campaignId, mapId, 1, HallData("Große Halle")));

        var response = await dm.GenerateAsync(campaignId, mapId, 1);

        await response.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.MapChanged);
        Assert.Empty((await dm.ListBackgroundsAsync(campaignId, mapId)).Versions);
    }

    [Fact]
    public async Task Only_one_job_per_map_at_a_time()
    {
        var fake = fixture.App.ResetFakeImages();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fake.Gate = gate;
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        await using var watcher = await ImageTestClient.WatchAsync(fixture.App, dm.Id, campaignId, mapId);
        try
        {
            var first = await dm.QueueAsync(campaignId, mapId);
            var whileQueuedOrRunning = await dm.GenerateAsync(campaignId, mapId, 1);
            await watcher.RunningAsync(first.Id);
            var whileRunning = await dm.GenerateAsync(campaignId, mapId, 1);

            await whileQueuedOrRunning.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.GenerationRunning);
            await whileRunning.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.GenerationRunning);
            gate.SetResult();
            Assert.Equal(AssetStatus.Done, (await watcher.EndedAsync(first.Id)).Status);
        }
        finally
        {
            gate.TrySetResult();
            fake.Reset();
        }

        var again = await dm.GenerateAsync(campaignId, mapId, 1);
        var second = await again.ReadAsync<MapBackground>(HttpStatusCode.Accepted);
        await watcher.EndedAsync(second.Id);
    }

    [Fact]
    public async Task Two_confirms_at_once_queue_one_job()
    {
        var fake = fixture.App.ResetFakeImages();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fake.Gate = gate;
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        await using var watcher = await ImageTestClient.WatchAsync(fixture.App, dm.Id, campaignId, mapId);
        try
        {
            var responses = await Task.WhenAll(Enumerable.Range(0, 4).Select(_ => dm.GenerateAsync(campaignId, mapId, 1)));

            var accepted = Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Accepted);
            Assert.All(responses.Where(r => r != accepted), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
            var queued = await accepted.ReadAsync<MapBackground>(HttpStatusCode.Accepted);
            gate.SetResult();
            await watcher.EndedAsync(queued.Id);
        }
        finally
        {
            gate.TrySetResult();
            fake.Reset();
        }

        Assert.Single((await dm.ListBackgroundsAsync(campaignId, mapId)).Versions);
    }

    [Fact]
    public async Task Generating_is_refused_once_the_months_spending_reaches_the_limit()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var before = (await dm.ListBackgroundsAsync(campaignId, mapId)).Budget;
        var now = DateTimeOffset.UtcNow;
        Assert.Equal((20m, new DateTimeOffset(now.Year, now.Month, 1, 0, 0, 0, TimeSpan.Zero), true), (before.LimitUsd, before.MonthStart, before.Available));

        // The limit is site-wide, so the seeded spending goes again at the end.
        var seeded = new[]
        {
            SeededAsset(campaignId, mapId, before.LimitUsd - before.SpentUsd, now),
            // Last month's and failed jobs don't count.
            SeededAsset(campaignId, mapId, 50m, before.MonthStart.AddDays(-1)),
            SeededAsset(campaignId, mapId, 50m, now),
        };
        seeded[2].Status = AssetStatus.Failed;
        await fixture.App.InDbAsync(async db =>
        {
            db.Assets.AddRange(seeded);
            return await db.SaveChangesAsync();
        });
        try
        {
            var budget = (await dm.ListBackgroundsAsync(campaignId, mapId)).Budget;
            var response = await dm.GenerateAsync(campaignId, mapId, 1);

            Assert.Equal(before.LimitUsd, budget.SpentUsd);
            await response.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ImageBudgetExhausted);
        }
        finally
        {
            var ids = seeded.Select(a => a.Id).ToList();
            await fixture.App.InDbAsync(db => db.Assets.Where(a => ids.Contains(a.Id)).ExecuteDeleteAsync());
        }
    }

    [Fact]
    public async Task Without_an_image_model_generating_is_unavailable()
    {
        await using var app = fixture.CreateApp(configuration: new Dictionary<string, string?> { ["Images:Endpoint"] = "" });
        var (dm, campaignId, mapId) = await app.DmWithMapAsync();

        var response = await dm.GenerateAsync(campaignId, mapId, 1);
        var list = await dm.ListBackgroundsAsync(campaignId, mapId);

        await response.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ImagesUnavailable);
        Assert.False(list.Budget.Available);
    }

    [Fact]
    public async Task Picking_sets_the_background_without_changing_the_maps_version()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var first = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        var second = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        var before = await dm.FetchOneAsync(campaignId, mapId);

        Assert.Equal(first.Id, (await dm.ListBackgroundsAsync(campaignId, mapId)).PickedAssetId);
        Assert.Equal(HttpStatusCode.NoContent, (await dm.PickAsync(campaignId, mapId, second.Id)).StatusCode);
        var list = await dm.ListBackgroundsAsync(campaignId, mapId);
        var after = await dm.FetchOneAsync(campaignId, mapId);

        Assert.Equal(second.Id, list.PickedAssetId);
        Assert.Equal([second.Id, first.Id], list.Versions.Select(v => v.Id));
        Assert.Equal((before.Version, before.UpdatedAt), (after.Version, after.UpdatedAt));
    }

    [Fact]
    public async Task Picking_null_clears_the_background()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);

        Assert.Equal(HttpStatusCode.NoContent, (await dm.PickAsync(campaignId, mapId, null)).StatusCode);

        Assert.Null((await dm.ListBackgroundsAsync(campaignId, mapId)).PickedAssetId);
    }

    [Fact]
    public async Task Only_finished_versions_of_the_map_can_be_picked()
    {
        var fake = fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var (otherDm, otherCampaign, otherMap) = await fixture.App.DmWithMapAsync("Fremd");
        var foreign = await fixture.App.GenerateAndWaitAsync(otherDm, otherCampaign, otherMap);
        fake.EnqueueFailure(new ImageRejectedException("moderation"));
        var failed = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);

        await (await dm.PickAsync(campaignId, mapId, Guid.NewGuid())).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.BackgroundNotFound);
        await (await dm.PickAsync(campaignId, mapId, foreign.Id)).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.BackgroundNotFound);
        await (await dm.PickAsync(campaignId, mapId, failed.Id)).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.BackgroundNotFound);
    }

    [Fact]
    public async Task A_resize_makes_versions_outdated_and_undoing_it_makes_them_usable_again()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var background = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        await dm.PushOneAsync(Map(campaignId, mapId, 1, HallData() with { Width = 10 }));

        var resized = Assert.Single((await dm.ListBackgroundsAsync(campaignId, mapId)).Versions);
        var pick = await dm.PickAsync(campaignId, mapId, background.Id);
        await dm.PushOneAsync(Map(campaignId, mapId, 2, HallData()));
        var restored = Assert.Single((await dm.ListBackgroundsAsync(campaignId, mapId)).Versions);

        Assert.Equal((true, false), (resized.Outdated, resized.LayoutChanged));
        await pick.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.BackgroundOutdated);
        Assert.Equal((false, false), (restored.Outdated, restored.LayoutChanged));
        Assert.Equal(HttpStatusCode.NoContent, (await dm.PickAsync(campaignId, mapId, background.Id)).StatusCode);
    }

    [Fact]
    public async Task A_resize_in_the_database_makes_the_picked_background_outdated()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var background = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        await fixture.App.InDbAsync(db => db.BattleMaps.Where(m => m.Id == mapId).ExecuteUpdateAsync(s => s.SetProperty(m => m.Height, 6)));

        var list = await dm.ListBackgroundsAsync(campaignId, mapId);

        Assert.Equal(background.Id, list.PickedAssetId);
        Assert.True(Assert.Single(list.Versions).Outdated);
        await (await dm.PickAsync(campaignId, mapId, background.Id)).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.BackgroundOutdated);
    }

    [Fact]
    public async Task Other_layout_changes_are_noted_but_keep_the_background()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        var layout = Hall() with
        {
            Cells = [.. Hall().Cells.Select(c => (c.X, c.Y) == (7, 4) ? c with { Terrain = Terrain.Wall } : c)],
        };
        await dm.PushOneAsync(Map(campaignId, mapId, 1, HallData() with { Layout = layout }));

        var version = Assert.Single((await dm.ListBackgroundsAsync(campaignId, mapId)).Versions);

        Assert.Equal((false, true), (version.Outdated, version.LayoutChanged));
    }

    private static Asset SeededAsset(Guid campaignId, Guid mapId, decimal cost, DateTimeOffset finishedAt) => new()
    {
        Id = Guid.NewGuid(),
        Kind = AssetKind.MapBackground,
        OwnerType = AssetOwnerType.BattleMap,
        OwnerId = mapId,
        CampaignId = campaignId,
        Origin = AssetOrigin.Generated,
        Status = AssetStatus.Done,
        GridWidth = 8,
        GridHeight = 5,
        CostUsd = cost,
        CreatedAt = finishedAt,
        FinishedAt = finishedAt,
    };
}
