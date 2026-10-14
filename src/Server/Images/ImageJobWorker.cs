using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images.Guide;
using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Images;

// Runs background jobs one at a time (knowledge/implementation-plan.md, stage 7): renders
// the guide, sends one request at most every MinRequestInterval, waits out 429s, stores the
// image, records the cost and tells open editors (ImageEvents). Woken by ImageJobQueue when
// a job is added and once at startup, where Running jobs cut off by a restart go back to
// Queued; it never polls the database (knowledge/decisions/hosting.md). A job cut off by
// shutdown stays Running, so the next start finds it.
public sealed class ImageJobWorker(
    IServiceScopeFactory scopes,
    ImageJobQueue queue,
    ImageEvents events,
    IAssetStore store,
    DatabaseState database,
    IOptions<ImageOptions> options,
    TimeProvider time,
    ILogger<ImageJobWorker> logger) : BackgroundService
{
    // The migration runs in the background after start; checked in memory only.
    private static readonly TimeSpan MigrationCheckInterval = TimeSpan.FromMilliseconds(200);

    private readonly ImageOptions _options = options.Value;

    // When the last request to the model started, in memory: a restart may send the next
    // one sooner, which a 429 then catches.
    private DateTimeOffset? _lastRequestAt;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Don't hold up the app's start.
        await Task.Yield();

        if (!_options.Configured)
        {
            logger.LogInformation("No image model configured; background jobs won't run");
            return;
        }

        while (database.Status == MigrationStatus.Migrating)
        {
            await Task.Delay(MigrationCheckInterval, time, stoppingToken);
        }

        if (database.Status != MigrationStatus.Migrated)
        {
            logger.LogWarning("The database isn't available; background jobs won't run");
            return;
        }

        try
        {
            await RequeueCutOffJobsAsync(stoppingToken);
        }
        catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
        {
            logger.LogError(ex, "Couldn't put background jobs cut off by a restart back in the queue");
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            Guid? next;
            try
            {
                next = await NextJobAsync(stoppingToken);
                if (next is { } assetId)
                {
                    await RunAsync(assetId, stoppingToken);
                    continue;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                // The database is unreachable or something unexpected broke; wait for the
                // next job rather than retry in a loop.
                logger.LogError(ex, "The background job worker hit an error; waiting for the next job");
            }

            try
            {
                await queue.WaitAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    private async Task RequeueCutOffJobsAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var requeued = await db.Assets
            .Where(a => a.Status == AssetStatus.Running)
            .ExecuteUpdateAsync(set => set.SetProperty(a => a.Status, AssetStatus.Queued), cancellationToken);
        if (requeued > 0)
        {
            logger.LogInformation("Put {Count} background jobs cut off by a restart back in the queue", requeued);
        }
    }

    private async Task<Guid?> NextJobAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Assets
            .Where(a => a.Status == AssetStatus.Queued)
            .OrderBy(a => a.CreatedAt)
            .ThenBy(a => a.Id)
            .Select(a => (Guid?)a.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task RunAsync(Guid assetId, CancellationToken stoppingToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var client = scope.ServiceProvider.GetRequiredService<IImageClient>();

        var asset = await db.Assets.SingleAsync(a => a.Id == assetId, stoppingToken);
        if (asset.Status != AssetStatus.Queued)
        {
            return;
        }

        if (asset.Kind != AssetKind.MapBackground || asset.OwnerType != AssetOwnerType.BattleMap)
        {
            // Stage 8 brings token icons; until then nothing else is queued.
            await FailAsync(db, asset, AssetFailure.Error, null, "it isn't a map background");
            return;
        }

        asset.Status = AssetStatus.Running;
        asset.StartedAt = time.GetUtcNow();
        asset.Attempts += 1;
        await db.SaveChangesAsync(stoppingToken);
        logger.LogInformation(
            "Background job {AssetId} for map {MapId} started, attempt {Attempt}", asset.Id, asset.OwnerId, asset.Attempts);
        await NotifyAsync(db, asset, null);

        while (true)
        {
            await WaitForRequestSlotAsync(stoppingToken);

            // The map as it is now: the DM may have edited it while the job waited.
            var map = await db.BattleMaps.AsNoTracking().SingleOrDefaultAsync(m => m.Id == asset.OwnerId, stoppingToken);
            if (map is null || map.ArchivedAt is not null)
            {
                await FailAsync(db, asset, AssetFailure.Error, map, "the map is gone or archived");
                return;
            }

            var guide = GuideRenderer.Render(map.Width, map.Height, map.Layout, _options.GuideTargetPixels);
            var prompt = BackgroundPrompt.Build(map.Scene, map.Vibe, map.Lighting, map.Layout, guide);
            RecordWhatIsSent(asset, map, guide, prompt);
            await db.SaveChangesAsync(stoppingToken);

            ImageResult result;
            try
            {
                _lastRequestAt = time.GetUtcNow();
                result = await client.EditAsync(
                    new ImageEditRequest(
                        prompt, guide.Png, guide.Width, guide.Height, _options.Quality, _options.OutputFormat, _options.OutputCompression),
                    stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Shutting down: the job stays Running and goes back to Queued at the next start.
                throw;
            }
            catch (ImageRateLimitedException ex)
            {
                // Not counted as an attempt.
                logger.LogWarning("Background job {AssetId}: the image model is busy, retrying after {RetryAfter}", asset.Id, ex.RetryAfter);
                await Task.Delay(ex.RetryAfter, time, stoppingToken);
                continue;
            }
            catch (ImageRejectedException ex)
            {
                await FailAsync(db, asset, AssetFailure.Rejected, map, $"the model rejected the request: {ex.Message}");
                return;
            }
            catch (Exception ex)
            {
                if (asset.Attempts >= _options.MaxAttempts)
                {
                    logger.LogWarning(ex, "Background job {AssetId}: attempt {Attempt} failed", asset.Id, asset.Attempts);
                    await FailAsync(db, asset, AssetFailure.Error, map, $"no image after {asset.Attempts} attempts");
                    return;
                }

                logger.LogWarning(ex, "Background job {AssetId}: attempt {Attempt} failed; trying again", asset.Id, asset.Attempts);
                asset.Status = AssetStatus.Queued;
                await db.SaveChangesAsync(CancellationToken.None);
                await NotifyAsync(db, asset, map);
                return;
            }

            await FinishAsync(db, asset, result);
            return;
        }
    }

    // The map may have changed since the job was queued: the version describes what is
    // actually sent, so its size, frame and layout hash match the picture.
    private static void RecordWhatIsSent(Asset asset, BattleMap map, MapGuide guide, string prompt)
    {
        asset.GridWidth = map.Width;
        asset.GridHeight = map.Height;
        asset.FrameX = guide.FrameX;
        asset.FrameY = guide.FrameY;
        asset.FrameWidth = guide.FrameWidth;
        asset.FrameHeight = guide.FrameHeight;
        asset.LayoutHash = LayoutFingerprint.Of(map.Width, map.Height, map.Layout);
        asset.Prompt = prompt.Length <= Asset.PromptMaxLength ? prompt : prompt[..Asset.PromptMaxLength];
    }

    private async Task WaitForRequestSlotAsync(CancellationToken cancellationToken)
    {
        if (_lastRequestAt is not { } last)
        {
            return;
        }

        var wait = last + _options.MinRequestInterval - time.GetUtcNow();
        if (wait > TimeSpan.Zero)
        {
            await Task.Delay(wait, time, cancellationToken);
        }
    }

    private async Task FinishAsync(AppDbContext db, Asset asset, ImageResult result)
    {
        // A paid image is kept even when shutdown begins now.
        var cancellationToken = CancellationToken.None;
        var blobName = $"maps/{asset.OwnerId}/{asset.Id}.{Extension(result.ContentType)}";
        await store.SaveAsync(blobName, result.Image, result.ContentType, cancellationToken);

        asset.BlobName = blobName;
        asset.ContentType = result.ContentType;
        asset.CostUsd = MapBackgrounds.Cost(result.Usage, _options);
        asset.Status = AssetStatus.Done;
        asset.Failure = null;
        asset.FinishedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);

        var picked = await PickIfNoneUsableAsync(db, asset, cancellationToken);
        logger.LogInformation(
            "Background job {AssetId} for map {MapId} done: {CostUsd} USD, {ImageTokens} + {TextTokens} input and {OutputTokens} output tokens, request {RequestId}{Picked}",
            asset.Id,
            asset.OwnerId,
            asset.CostUsd,
            result.Usage.InputImageTokens,
            result.Usage.InputTextTokens,
            result.Usage.OutputTokens,
            result.RequestId,
            picked ? ", picked" : "");
        await NotifyAsync(db, asset, null);
    }

    // The new image becomes the map's background when the map has none it can show: none
    // picked, or the picked one outdated or not finished. Conditional, so a pick the DM
    // makes meanwhile wins; the map's sync version stays as it is.
    private static async Task<bool> PickIfNoneUsableAsync(AppDbContext db, Asset asset, CancellationToken cancellationToken)
    {
        var map = await db.BattleMaps.AsNoTracking()
            .Where(m => m.Id == asset.OwnerId)
            .Select(m => new { m.Width, m.Height, m.BackgroundAssetId })
            .SingleOrDefaultAsync(cancellationToken);
        if (map is null || !MapBackgrounds.Fits(asset, map.Width, map.Height)
            || await MapBackgrounds.UsableAsync(db, map.BackgroundAssetId, (map.Width, map.Height), cancellationToken) is not null)
        {
            return false;
        }

        var picked = map.BackgroundAssetId;
        var updated = await db.BattleMaps
            .Where(m => m.Id == asset.OwnerId
                && m.BackgroundAssetId == picked
                && m.Width == asset.GridWidth
                && m.Height == asset.GridHeight)
            .ExecuteUpdateAsync(set => set.SetProperty(m => m.BackgroundAssetId, asset.Id), cancellationToken);
        return updated > 0;
    }

    private async Task FailAsync(AppDbContext db, Asset asset, AssetFailure failure, BattleMap? map, string reason)
    {
        logger.LogWarning("Background job {AssetId} for map {MapId} failed ({Failure}): {Reason}", asset.Id, asset.OwnerId, failure, reason);
        asset.Status = AssetStatus.Failed;
        asset.Failure = failure;
        asset.FinishedAt = time.GetUtcNow();
        await db.SaveChangesAsync(CancellationToken.None);
        await NotifyAsync(db, asset, map);
    }

    // Tells the map's open editors; a failure here never stops the worker.
    private async Task NotifyAsync(AppDbContext db, Asset asset, BattleMap? map)
    {
        try
        {
            var current = map ?? await db.BattleMaps.AsNoTracking().SingleOrDefaultAsync(m => m.Id == asset.OwnerId, CancellationToken.None);
            var (width, height, fingerprint) = current is null
                ? (asset.GridWidth ?? 0, asset.GridHeight ?? 0, asset.LayoutHash ?? "")
                : (current.Width, current.Height, LayoutFingerprint.Of(current.Width, current.Height, current.Layout));
            await events.BackgroundUpdatedAsync(MapBackgrounds.ToView(asset, width, height, fingerprint));
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Couldn't tell open editors about background job {AssetId}", asset.Id);
        }
    }

    private static string Extension(string contentType) => contentType switch
    {
        "image/webp" => "webp",
        "image/png" => "png",
        "image/jpeg" => "jpg",
        _ => "bin",
    };
}

// The worker's doorbell: the generate endpoint rings it after saving a Queued job.
public sealed class ImageJobQueue
{
    private readonly SemaphoreSlim _signal = new(0);

    public void Notify()
    {
        if (_signal.CurrentCount == 0)
        {
            _signal.Release();
        }
    }

    public Task WaitAsync(CancellationToken cancellationToken) => _signal.WaitAsync(cancellationToken);
}
