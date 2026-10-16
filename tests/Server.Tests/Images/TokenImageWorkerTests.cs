using System.Net;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OreanasOffice.Server.Images;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests.Images;

// Token icon and portrait jobs against the fake image model: text to image, restyles,
// retries, failures, the automatic pick and the hub events (knowledge/features/token-icons.md).
[Collection("Images")]
public sealed class TokenImageWorkerTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    // FakeImageClient.DefaultUsage at the default rates.
    private const decimal DefaultCost = 0.055373m;

    [Fact]
    public async Task An_icon_job_paints_stores_prices_and_picks_the_icon()
    {
        var fake = fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        await using var watcher = await TokenImageTestClient.WatchAsync(
            fixture.App, table.Dm.Id, table.CampaignId, AssetOwnerType.CreatureType, table.CreatureTypeId);

        var queued = await (await table.Dm.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, table.TypeVersion))
            .ReadAsync<TokenImage>(HttpStatusCode.Accepted);
        var updates = await watcher.UntilAsync(queued.Id, s => s is AssetStatus.Done or AssetStatus.Failed);

        Assert.Equal([AssetStatus.Running, AssetStatus.Done], updates.Select(u => u.Status));
        var done = updates[^1];
        Assert.Equal(($"/api/assets/{queued.Id}", (AssetFailure?)null), (done.Url, done.Failure));
        Assert.NotNull(done.FinishedAt);

        var request = Assert.Single(fake.GenerateRequests);
        Assert.Equal((1024, 1024, "high", "transparent", "png"), (request.Width, request.Height, request.Quality, request.Background, request.OutputFormat));
        Assert.StartsWith("Token icon for a tabletop battle map: Goblin, klein, grüne Haut.\n", request.Prompt);
        Assert.Contains(new ImageOptions().TokenStyle, request.Prompt);
        Assert.Empty(fake.Requests);

        var asset = await fixture.App.AssetAsync(queued.Id);
        Assert.Equal(
            (AssetStatus.Done, 1, $"tokens/creature-type/{table.CreatureTypeId}/{queued.Id}.webp", "image/webp", (decimal?)DefaultCost),
            (asset.Status, asset.Attempts, asset.BlobName, asset.ContentType, asset.CostUsd));
        Assert.Equal(request.Prompt, asset.Prompt);

        var list = await table.Dm.ListIconsAsync(table.CampaignId, table.CreatureTypeId);
        Assert.Equal(queued.Id, list.PickedAssetId);
        Assert.True(list.Budget.SpentUsd >= DefaultCost);

        // Every member of the campaign loads it, as boards show it; nobody else.
        var image = await table.Player.GetAssetAsync(queued.Id);
        Assert.Equal((HttpStatusCode.OK, "image/webp"), (image.StatusCode, image.Content.Headers.ContentType?.MediaType));
        using var bitmap = TestPictures.Decode(await image.Content.ReadAsByteArrayAsync());
        Assert.Equal((512, 512, (byte)0), (bitmap.Width, bitmap.Height, bitmap.GetPixel(3, 3).Alpha));
        Assert.Equal(HttpStatusCode.NotFound, (await table.Stranger.GetAssetAsync(queued.Id)).StatusCode);
    }

    [Fact]
    public async Task A_portrait_job_paints_the_characters_name_and_appearance()
    {
        var fake = fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();

        var done = await fixture.App.PortraitAndWaitAsync(table.Player, table.CampaignId, table.CharacterId);

        Assert.Equal(AssetStatus.Done, done.Status);
        var request = Assert.Single(fake.GenerateRequests);
        Assert.StartsWith("Portrait token for a tabletop battle map: Thorin, Zwerg, roter Bart.\nHead and shoulders", request.Prompt);
        var asset = await fixture.App.AssetAsync(done.Id);
        Assert.Equal($"tokens/character/{table.CharacterId}/{done.Id}.webp", asset.BlobName);
        Assert.Equal(done.Id, (await table.Player.ListPortraitsAsync(table.CampaignId, table.CharacterId)).PickedAssetId);
        Assert.Equal(HttpStatusCode.OK, (await table.OtherPlayer.GetAssetAsync(done.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await table.Stranger.GetAssetAsync(done.Id)).StatusCode);
    }

    [Fact]
    public async Task A_restyle_sends_the_upload_as_a_png_and_keeps_it()
    {
        var fake = fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var upload = await table.Player.UploadOkAsync(table.CampaignId, table.CharacterId);

        var done = await fixture.App.PortraitAndWaitAsync(table.Player, table.CampaignId, table.CharacterId, upload.Id);

        Assert.Equal((AssetStatus.Done, AssetOrigin.Generated, (Guid?)upload.Id), (done.Status, done.Origin, done.SourceAssetId));
        var request = Assert.Single(fake.Requests);
        Assert.Empty(fake.GenerateRequests);
        Assert.Equal(
            (1024, 1024, "high", "png", "transparent", (ImageInput?)null),
            (request.Width, request.Height, request.Quality, request.OutputFormat, request.Background, request.Picture));
        Assert.Equal(SkiaSharp.SKEncodedImageFormat.Png, TokenPicture.Identify(request.GuidePng));
        Assert.StartsWith(
            "Turn the person in this picture into a portrait token in the following style.\nPortrait token for a tabletop battle map: Thorin, Zwerg, roter Bart.\n",
            request.Prompt);
        Assert.Equal(request.Prompt, (await fixture.App.AssetAsync(done.Id)).Prompt);

        var list = await table.Player.ListPortraitsAsync(table.CampaignId, table.CharacterId);
        Assert.Equal(done.Id, list.PickedAssetId);
        Assert.Equal([done.Id, upload.Id], list.Versions.Select(v => v.Id));
    }

    [Fact]
    public async Task The_newest_finished_version_becomes_the_pick()
    {
        fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var first = await fixture.App.IconAndWaitAsync(table.Dm, table.CampaignId, table.CreatureTypeId);
        var second = await fixture.App.IconAndWaitAsync(table.Dm, table.CampaignId, table.CreatureTypeId);
        await table.Dm.PickIconAsync(table.CampaignId, table.CreatureTypeId, first.Id);

        var third = await fixture.App.IconAndWaitAsync(table.Dm, table.CampaignId, table.CreatureTypeId);

        Assert.Equal([AssetStatus.Done, AssetStatus.Done, AssetStatus.Done], new[] { first, second, third }.Select(v => v.Status));
        Assert.Equal(third.Id, (await table.Dm.ListIconsAsync(table.CampaignId, table.CreatureTypeId)).PickedAssetId);
    }

    [Fact]
    public async Task A_rejected_request_fails_at_once_and_keeps_the_pick()
    {
        var fake = fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var upload = await table.Player.UploadOkAsync(table.CampaignId, table.CharacterId);
        fake.EnqueueFailure(new ImageRejectedException("moderation"));

        var failed = await fixture.App.PortraitAndWaitAsync(table.Player, table.CampaignId, table.CharacterId);

        Assert.Equal((AssetStatus.Failed, (AssetFailure?)AssetFailure.Rejected, (string?)null), (failed.Status, failed.Failure, failed.Url));
        var asset = await fixture.App.AssetAsync(failed.Id);
        Assert.Equal((1, (decimal?)null, (string?)null), (asset.Attempts, asset.CostUsd, asset.BlobName));
        Assert.Equal(upload.Id, (await table.Player.ListPortraitsAsync(table.CampaignId, table.CharacterId)).PickedAssetId);
        Assert.Equal(HttpStatusCode.NotFound, (await table.Player.GetAssetAsync(failed.Id)).StatusCode);
    }

    [Fact]
    public async Task A_failed_attempt_is_tried_again()
    {
        var fake = fixture.App.ResetFakeTokens();
        fake.EnqueueFailure(new HttpRequestException("Verbindung abgebrochen"));
        var table = await fixture.App.CreateTokenTableAsync();
        await using var watcher = await TokenImageTestClient.WatchAsync(
            fixture.App, table.Player.Id, table.CampaignId, AssetOwnerType.Character, table.CharacterId);

        var queued = await (await table.Player.GeneratePortraitAsync(table.CampaignId, table.CharacterId)).ReadAsync<TokenImage>(HttpStatusCode.Accepted);
        var updates = await watcher.UntilAsync(queued.Id, s => s is AssetStatus.Done or AssetStatus.Failed);

        Assert.Equal([AssetStatus.Running, AssetStatus.Queued, AssetStatus.Running, AssetStatus.Done], updates.Select(u => u.Status));
        Assert.Equal(2, (await fixture.App.AssetAsync(queued.Id)).Attempts);
    }

    [Fact]
    public async Task A_job_fails_after_the_last_attempt_also_when_the_picture_is_unreadable()
    {
        var fake = fixture.App.ResetFakeTokens();
        fake.EnqueueFailure(new InvalidOperationException("kaputt"));
        for (var i = 0; i < 2; i++)
        {
            fake.Enqueue((_, _) => Task.FromResult(new ImageResult([1, 2, 3], "image/png", FakeImageClient.DefaultUsage, "fake")));
        }

        var table = await fixture.App.CreateTokenTableAsync();

        var failed = await fixture.App.IconAndWaitAsync(table.Dm, table.CampaignId, table.CreatureTypeId);

        Assert.Equal((AssetStatus.Failed, (AssetFailure?)AssetFailure.Error), (failed.Status, failed.Failure));
        Assert.Equal(3, (await fixture.App.AssetAsync(failed.Id)).Attempts);
        Assert.Null((await table.Dm.ListIconsAsync(table.CampaignId, table.CreatureTypeId)).PickedAssetId);

        // A failed job doesn't block the next one.
        Assert.Equal(AssetStatus.Done, (await fixture.App.IconAndWaitAsync(table.Dm, table.CampaignId, table.CreatureTypeId)).Status);
    }

    [Fact]
    public async Task A_busy_model_is_waited_out_without_counting_an_attempt()
    {
        var fake = fixture.App.ResetFakeTokens();
        fake.EnqueueFailure(new ImageRateLimitedException(TimeSpan.FromMilliseconds(50)));
        var table = await fixture.App.CreateTokenTableAsync();

        var done = await fixture.App.IconAndWaitAsync(table.Dm, table.CampaignId, table.CreatureTypeId);

        Assert.Equal((AssetStatus.Done, 1), (done.Status, (await fixture.App.AssetAsync(done.Id)).Attempts));
        Assert.Equal(2, fake.GenerateRequests.Count);
    }

    // The prompt comes from the type as it is when the job runs, and an archived type still
    // gets the icon it was confirmed for.
    [Fact]
    public async Task A_job_paints_the_type_as_it_is_when_it_runs()
    {
        var fake = fixture.App.ResetFakeTokens();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fake.Gate = gate;
        var table = await fixture.App.CreateTokenTableAsync();
        await using var blockerWatcher = await TokenImageTestClient.WatchAsync(
            fixture.App, table.Player.Id, table.CampaignId, AssetOwnerType.Character, table.CharacterId);
        await using var watcher = await TokenImageTestClient.WatchAsync(
            fixture.App, table.Dm.Id, table.CampaignId, AssetOwnerType.CreatureType, table.CreatureTypeId);
        TokenImage waiting;
        try
        {
            var blocker = await (await table.Player.GeneratePortraitAsync(table.CampaignId, table.CharacterId)).ReadAsync<TokenImage>(HttpStatusCode.Accepted);
            await blockerWatcher.RunningAsync(blocker.Id);
            waiting = await (await table.Dm.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, table.TypeVersion)).ReadAsync<TokenImage>(HttpStatusCode.Accepted);
            await table.Dm.PushOneAsync(CreatureType(
                table.CampaignId, table.CreatureTypeId, baseVersion: table.TypeVersion, appearance: "riesig, blaue Haut", archivedAt: DateTimeOffset.UtcNow));
            fake.Gate = null;
            gate.SetResult();
            await blockerWatcher.EndedAsync(blocker.Id);
        }
        finally
        {
            gate.TrySetResult();
        }

        var done = await watcher.EndedAsync(waiting.Id);

        Assert.Equal(AssetStatus.Done, done.Status);
        Assert.StartsWith("Token icon for a tabletop battle map: Goblin, riesig, blaue Haut.\n", (await fixture.App.AssetAsync(waiting.Id)).Prompt);
        Assert.Equal(waiting.Id, (await table.Dm.ListIconsAsync(table.CampaignId, table.CreatureTypeId)).PickedAssetId);
    }

    [Fact]
    public async Task A_job_for_a_character_gone_meanwhile_fails()
    {
        var fake = fixture.App.ResetFakeTokens();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fake.Gate = gate;
        var table = await fixture.App.CreateTokenTableAsync();
        await using var blockerWatcher = await TokenImageTestClient.WatchAsync(
            fixture.App, table.Dm.Id, table.CampaignId, AssetOwnerType.CreatureType, table.CreatureTypeId);
        await using var watcher = await TokenImageTestClient.WatchAsync(
            fixture.App, table.Player.Id, table.CampaignId, AssetOwnerType.Character, table.CharacterId);
        TokenImage waiting;
        try
        {
            var blocker = await (await table.Dm.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, table.TypeVersion)).ReadAsync<TokenImage>(HttpStatusCode.Accepted);
            await blockerWatcher.RunningAsync(blocker.Id);
            waiting = await (await table.Player.GeneratePortraitAsync(table.CampaignId, table.CharacterId)).ReadAsync<TokenImage>(HttpStatusCode.Accepted);
            await fixture.App.InDbAsync(db => db.Characters.Where(c => c.Id == table.CharacterId).ExecuteDeleteAsync());
            fake.Gate = null;
            gate.SetResult();
            await blockerWatcher.EndedAsync(blocker.Id);
        }
        finally
        {
            gate.TrySetResult();
        }

        var failed = await watcher.EndedAsync(waiting.Id);

        Assert.Equal((AssetStatus.Failed, (AssetFailure?)AssetFailure.Error), (failed.Status, failed.Failure));
        Assert.Single(fake.GenerateRequests);
    }

    [Fact]
    public async Task A_token_job_cut_off_by_a_restart_finishes_after_the_next_start()
    {
        fixture.App.ResetFakeTokens();
        Guid assetId;
        TokenTable table;
        await using (var first = fixture.CreateApp(runsImageJobs: true))
        {
            var held = first.Services.GetRequiredService<FakeImageClient>();
            held.Gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            table = await first.CreateTokenTableAsync();
            await using var watcher = await TokenImageTestClient.WatchAsync(
                first, table.Player.Id, table.CampaignId, AssetOwnerType.Character, table.CharacterId);
            assetId = (await (await table.Player.GeneratePortraitAsync(table.CampaignId, table.CharacterId))
                .ReadAsync<TokenImage>(HttpStatusCode.Accepted)).Id;
            await watcher.RunningAsync(assetId);
        }

        Assert.Equal(AssetStatus.Running, (await fixture.App.AssetAsync(assetId)).Status);

        var fake = new FakeImageClient
        {
            Gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously),
            TokenPng = TestPictures.TransparentPng(),
        };
        await using var second = fixture.CreateApp(runsImageJobs: true).WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<FakeImageClient>();
            services.AddSingleton(fake);
        }));
        await using var watcher2 = await TokenImageTestClient.WatchAsync(
            second, table.Player.Id, table.CampaignId, AssetOwnerType.Character, table.CharacterId);
        fake.Gate.SetResult();
        var done = await watcher2.EndedAsync(assetId);

        Assert.Equal(AssetStatus.Done, done.Status);
        Assert.Equal(2, (await fixture.App.AssetAsync(assetId)).Attempts);
    }
}
