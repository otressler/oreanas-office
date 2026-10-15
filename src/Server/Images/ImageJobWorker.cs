using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images.Guide;
using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Images;

// Runs background jobs one at a time (knowledge/implementation-plan.md, stage 7): renders
// the guide, sends one request at most every MinRequestInterval, waits out 429s, stores the
// image, records the cost and tells open editors (ImageEvents). Token icons and portraits
// (stage 8) go through the same queue: RunTokenAsync. Woken by ImageJobQueue when
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

    // 429 waits per job before it fails; they don't count as attempts.
    private const int MaxRateLimitedWaits = 10;

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
                    await RunOrRecoverAsync(assetId, stoppingToken);
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

    // A job that breaks anywhere (rendering, saving, storing the image) mustn't stay Running:
    // that would block its map with GenerationRunning and keep the editor's hub connection
    // open. It goes back to the queue, or fails once it has used its attempts, and the
    // worker moves on to the next job.
    private async Task RunOrRecoverAsync(Guid assetId, CancellationToken stoppingToken)
    {
        try
        {
            await RunAsync(assetId, stoppingToken);
        }
        catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
        {
            logger.LogError(ex, "Background job {AssetId} broke", assetId);
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var asset = await db.Assets.SingleOrDefaultAsync(a => a.Id == assetId, CancellationToken.None);
            if (asset is not { Status: AssetStatus.Running })
            {
                return;
            }

            if (asset.Attempts >= _options.MaxAttempts)
            {
                await FailAsync(db, asset, AssetFailure.Error, null, $"no image after {asset.Attempts} attempts");
                return;
            }

            asset.Status = AssetStatus.Queued;
            await db.SaveChangesAsync(CancellationToken.None);
            await NotifyAsync(db, asset, null);
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

        if (asset is { Kind: AssetKind.TokenIcon, OwnerType: AssetOwnerType.CreatureType or AssetOwnerType.Character })
        {
            await RunTokenAsync(db, client, asset, stoppingToken);
            return;
        }

        if (asset.Kind != AssetKind.MapBackground || asset.OwnerType != AssetOwnerType.BattleMap)
        {
            await FailAsync(db, asset, AssetFailure.Error, null, "it is neither a map background nor a token image");
            return;
        }

        asset.Status = AssetStatus.Running;
        asset.StartedAt = time.GetUtcNow();
        asset.Attempts += 1;
        await db.SaveChangesAsync(stoppingToken);
        logger.LogInformation(
            "Background job {AssetId} for map {MapId} started, attempt {Attempt}", asset.Id, asset.OwnerId, asset.Attempts);
        await NotifyAsync(db, asset, null);

        // A refinement sends the version it edits along with the guide.
        ImageInput? picture = null;
        if (asset.RefinedFromAssetId is { } sourceId)
        {
            picture = await LoadPictureAsync(db, sourceId, stoppingToken);
            if (picture is null)
            {
                await FailAsync(db, asset, AssetFailure.Error, null, "the version to refine is gone");
                return;
            }
        }

        var rateLimitedWaits = 0;
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

            if (picture is not null && (map.Width != asset.GridWidth || map.Height != asset.GridHeight))
            {
                // The map was resized while the job waited: the picture no longer fits it.
                await FailAsync(db, asset, AssetFailure.Error, map, "the map's size changed, so the version to refine no longer fits");
                return;
            }

            var guide = GuideRenderer.Render(map.Width, map.Height, map.Layout, _options.GuideTargetPixels);
            var prompt = picture is null
                ? BackgroundPrompt.Build(map.Scene, map.Vibe, map.Lighting, map.Layout, guide)
                : BackgroundPrompt.BuildRefinement(asset.Instruction ?? "", map.Layout, guide);
            RecordWhatIsSent(asset, map, guide, prompt);
            await db.SaveChangesAsync(stoppingToken);

            ImageResult result;
            try
            {
                _lastRequestAt = time.GetUtcNow();
                result = await client.EditAsync(
                    new ImageEditRequest(
                        prompt, guide.Png, guide.Width, guide.Height, _options.Quality, _options.OutputFormat, _options.OutputCompression, picture),
                    stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // Shutting down: the job stays Running and goes back to Queued at the next start.
                throw;
            }
            catch (ImageRateLimitedException ex) when (++rateLimitedWaits > MaxRateLimitedWaits)
            {
                // The deployment's quota is gone, not just busy: give up rather than hold the
                // map and the editor's connection for good.
                await FailAsync(db, asset, AssetFailure.Error, map, $"the image model stayed busy after {MaxRateLimitedWaits} waits: {ex.Message}");
                return;
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

    // A creature type's icon or a character's portrait (knowledge/features/token-icons.md):
    // text to image from the owner's name and appearance as they are when the job runs, or
    // for a restyle the uploaded version sent to the edits endpoint as the reference. Both
    // ask for a transparent PNG; the server keeps a square WebP. Same request spacing,
    // 429 waits, retries and failures as a background.
    private async Task RunTokenAsync(AppDbContext db, IImageClient client, Asset asset, CancellationToken stoppingToken)
    {
        asset.Status = AssetStatus.Running;
        asset.StartedAt = time.GetUtcNow();
        asset.Attempts += 1;
        await db.SaveChangesAsync(stoppingToken);
        logger.LogInformation(
            "Token image job {AssetId} for {OwnerType} {OwnerId} started, attempt {Attempt}",
            asset.Id,
            asset.OwnerType,
            asset.OwnerId,
            asset.Attempts);
        await NotifyAsync(db, asset, null);

        byte[]? reference = null;
        if (asset.SourceAssetId is { } sourceId)
        {
            if (await LoadPictureAsync(db, sourceId, stoppingToken) is not { } source)
            {
                await FailAsync(db, asset, AssetFailure.Error, null, "the uploaded version to restyle is gone");
                return;
            }

            reference = TokenPicture.ToPng(source.Content);
        }

        var pixels = _options.TokenRequestPixels;
        var rateLimitedWaits = 0;
        while (true)
        {
            await WaitForRequestSlotAsync(stoppingToken);

            // The owner as it is now: the name or appearance may have changed while the job
            // waited. An archived creature type still gets its icon.
            var owner = await TokenOwnerAsync(db, asset, stoppingToken);
            if (owner is not { } subject)
            {
                await FailAsync(db, asset, AssetFailure.Error, null, $"the {asset.OwnerType} is gone");
                return;
            }

            var prompt = asset.OwnerType == AssetOwnerType.CreatureType
                ? TokenPrompt.CreatureIcon(subject.Name, subject.Appearance, _options.TokenStyle)
                : reference is null
                    ? TokenPrompt.CharacterPortrait(subject.Name, subject.Appearance, _options.TokenStyle)
                    : TokenPrompt.Restyle(subject.Name, subject.Appearance, _options.TokenStyle);
            asset.Prompt = TokenPrompt.ForStorage(prompt);
            await db.SaveChangesAsync(stoppingToken);

            ImageResult result;
            try
            {
                _lastRequestAt = time.GetUtcNow();
                result = reference is null
                    ? await client.GenerateAsync(
                        new ImageGenerateRequest(prompt, pixels, pixels, _options.TokenQuality, "transparent", "png"), stoppingToken)
                    : await client.EditAsync(
                        new ImageEditRequest(
                            prompt, reference, pixels, pixels, _options.TokenQuality, "png", _options.OutputCompression, Background: "transparent"),
                        stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                throw;
            }
            catch (ImageRateLimitedException ex) when (++rateLimitedWaits > MaxRateLimitedWaits)
            {
                await FailAsync(db, asset, AssetFailure.Error, null, $"the image model stayed busy after {MaxRateLimitedWaits} waits: {ex.Message}");
                return;
            }
            catch (ImageRateLimitedException ex)
            {
                logger.LogWarning("Token image job {AssetId}: the image model is busy, retrying after {RetryAfter}", asset.Id, ex.RetryAfter);
                await Task.Delay(ex.RetryAfter, time, stoppingToken);
                continue;
            }
            catch (ImageRejectedException ex)
            {
                await FailAsync(db, asset, AssetFailure.Rejected, null, $"the model rejected the request: {ex.Message}");
                return;
            }
            catch (Exception ex)
            {
                if (asset.Attempts >= _options.MaxAttempts)
                {
                    logger.LogWarning(ex, "Token image job {AssetId}: attempt {Attempt} failed", asset.Id, asset.Attempts);
                    await FailAsync(db, asset, AssetFailure.Error, null, $"no image after {asset.Attempts} attempts");
                    return;
                }

                logger.LogWarning(ex, "Token image job {AssetId}: attempt {Attempt} failed; trying again", asset.Id, asset.Attempts);
                asset.Status = AssetStatus.Queued;
                await db.SaveChangesAsync(CancellationToken.None);
                await NotifyAsync(db, asset, null);
                return;
            }

            await FinishTokenAsync(db, asset, result);
            return;
        }
    }

    private static async Task<(string Name, string Appearance)?> TokenOwnerAsync(
        AppDbContext db, Asset asset, CancellationToken cancellationToken) =>
        asset.OwnerType == AssetOwnerType.CreatureType
            ? await db.CreatureTypes.AsNoTracking()
                .Where(t => t.Id == asset.OwnerId)
                .Select(t => new { t.Name, t.Appearance })
                .SingleOrDefaultAsync(cancellationToken) is { } type ? (type.Name, type.Appearance) : null
            : await db.Characters.AsNoTracking()
                .Where(c => c.Id == asset.OwnerId)
                .Select(c => new { c.Name, c.Appearance })
                .SingleOrDefaultAsync(cancellationToken) is { } character ? (character.Name, character.Appearance) : null;

    // Stores the square WebP and makes it the owner's pick: the newest finished version
    // becomes the picked one (project owner, 2026-10-15).
    private async Task FinishTokenAsync(AppDbContext db, Asset asset, ImageResult result)
    {
        // Throws for a picture that can't be read, which counts as a failed attempt.
        var webp = TokenPicture.FromModel(result.Image, _options.TokenPixels);

        // A paid image is kept even when shutdown begins now.
        var cancellationToken = CancellationToken.None;
        var blobName = TokenImages.BlobName(asset.OwnerType, asset.OwnerId, asset.Id);
        await store.SaveAsync(blobName, webp, TokenPicture.ContentType, cancellationToken);

        asset.BlobName = blobName;
        asset.ContentType = TokenPicture.ContentType;
        asset.CostUsd = MapBackgrounds.Cost(result.Usage, _options);
        asset.Status = AssetStatus.Done;
        asset.Failure = null;
        asset.FinishedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);

        var picked = await TokenImages.PickAsync(db, asset.OwnerType, asset.OwnerId, asset.Id, cancellationToken);
        logger.LogInformation(
            "Token image job {AssetId} for {OwnerType} {OwnerId} done: {CostUsd} USD, {ImageTokens} + {TextTokens} input and {OutputTokens} output tokens, request {RequestId}{Picked}",
            asset.Id,
            asset.OwnerType,
            asset.OwnerId,
            asset.CostUsd,
            result.Usage.InputImageTokens,
            result.Usage.InputTextTokens,
            result.Usage.OutputTokens,
            result.RequestId,
            picked ? ", picked" : "");
        await NotifyAsync(db, asset, null);
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

    // The finished version a refinement edits, read from the asset store; null when it is gone.
    private async Task<ImageInput?> LoadPictureAsync(AppDbContext db, Guid assetId, CancellationToken cancellationToken)
    {
        var source = await db.Assets.AsNoTracking()
            .Where(a => a.Id == assetId && a.Status == AssetStatus.Done && a.BlobName != null)
            .Select(a => new { a.BlobName, a.ContentType })
            .SingleOrDefaultAsync(cancellationToken);
        if (source is null || await store.OpenReadAsync(source.BlobName!, cancellationToken) is not { } stream)
        {
            return null;
        }

        await using (stream)
        {
            using var buffer = new MemoryStream();
            await stream.CopyToAsync(buffer, cancellationToken);
            return new ImageInput(buffer.ToArray(), source.ContentType ?? "image/jpeg");
        }
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
        if (asset.Kind == AssetKind.TokenIcon)
        {
            logger.LogWarning(
                "Token image job {AssetId} for {OwnerType} {OwnerId} failed ({Failure}): {Reason}", asset.Id, asset.OwnerType, asset.OwnerId, failure, reason);
        }
        else
        {
            logger.LogWarning("Background job {AssetId} for map {MapId} failed ({Failure}): {Reason}", asset.Id, asset.OwnerId, failure, reason);
        }

        asset.Status = AssetStatus.Failed;
        asset.Failure = failure;
        asset.FinishedAt = time.GetUtcNow();
        await db.SaveChangesAsync(CancellationToken.None);
        await NotifyAsync(db, asset, map);
    }

    // Tells the map's open editors, or the open gallery of a creature type's icons or a
    // character's portraits; a failure here never stops the worker.
    private async Task NotifyAsync(AppDbContext db, Asset asset, BattleMap? map)
    {
        try
        {
            if (asset.Kind == AssetKind.TokenIcon)
            {
                await events.TokenImageUpdatedAsync(TokenImages.ToView(asset));
                return;
            }

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
