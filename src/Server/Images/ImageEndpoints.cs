using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Net.Http.Headers;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images.Guide;

namespace OreanasOffice.Server.Images;

// Map backgrounds (knowledge/features/ai-map-generation.md) and serving images
// (knowledge/decisions/persistence.md, "How images reach the browser").
public static class ImageEndpoints
{
    // Images never change once written (IAssetStore), so browsers and the service worker
    // keep them for good.
    public const string CacheControl = "private, max-age=31536000, immutable";

    public static IEndpointRouteBuilder MapImageEndpoints(this IEndpointRouteBuilder app)
    {
        var backgrounds = app.MapGroup("/api/campaigns/{campaignId:guid}/maps/{mapId:guid}")
            .WithTags("Images")
            .RequireAuthorization(Policies.CampaignDm);
        backgrounds.MapGet("/backgrounds", ListBackgrounds);
        backgrounds.MapPost("/backgrounds", GenerateBackground);
        backgrounds.MapPut("/background", PickBackground);

        app.MapGet("/api/assets/{assetId:guid}", GetAsset)
            .WithTags("Images")
            .RequireAuthorization();
        return app;
    }

    // The map's versions, newest first: its own assets, plus the picked one when it belongs
    // to the store map this one was copied from. 404 for a map of another campaign.
    private static async Task<Results<Ok<MapBackgroundsResponse>, NotFound>> ListBackgrounds(
        Guid campaignId,
        Guid mapId,
        AppDbContext db,
        IOptions<ImageOptions> options,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var map = await db.BattleMaps.AsNoTracking()
            .SingleOrDefaultAsync(m => m.Id == mapId && m.CampaignId == campaignId, cancellationToken);
        if (map is null)
        {
            return TypedResults.NotFound();
        }

        var assets = await db.Assets.AsNoTracking()
            .Where(a => a.Kind == AssetKind.MapBackground
                && ((a.OwnerType == AssetOwnerType.BattleMap && a.OwnerId == mapId) || a.Id == map.BackgroundAssetId))
            .OrderByDescending(a => a.CreatedAt)
            .ThenBy(a => a.Id)
            .ToListAsync(cancellationToken);

        var fingerprint = LayoutFingerprint.Of(map.Width, map.Height, map.Layout);
        var budget = await BudgetAsync(db, options.Value, time, cancellationToken);
        return TypedResults.Ok(new MapBackgroundsResponse(
            map.BackgroundAssetId,
            [.. assets.Select(a => MapBackgrounds.ToView(a, map.Width, map.Height, fingerprint))],
            budget));
    }

    // Queues a job after the DM confirmed it: checks the map version, that no job of the map
    // is queued or running, the monthly limit and that a model is configured; then saves a
    // Queued asset with the map's size, frame and layout hash and wakes the worker. 202 with
    // the new version. 404 for a map of another campaign or an archived map.
    // Errors (409): MapChanged, GenerationRunning, ImageBudgetExhausted, ImagesUnavailable.
    private static async Task<Results<Accepted<MapBackground>, NotFound, Conflict<ApiError>>> GenerateBackground(
        Guid campaignId,
        Guid mapId,
        GenerateBackgroundRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        IOptions<ImageOptions> options,
        ImageJobQueue queue,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var userId = user.GetUserId();
        var strategy = db.Database.CreateExecutionStrategy();
        var outcome = await strategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

            // Two confirms at once (a double tap, two DMs) must not queue two jobs; there is
            // no unique index to stop them, so they take turns.
            await db.Database.ExecuteSqlAsync(
                $"EXEC sp_getapplock @Resource = {$"map-background:{mapId}"}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 20000",
                cancellationToken);

            var map = await db.BattleMaps.AsNoTracking()
                .SingleOrDefaultAsync(m => m.Id == mapId && m.CampaignId == campaignId, cancellationToken);
            if (map is null || map.ArchivedAt is not null)
            {
                return new Outcome(null, null);
            }

            if (!settings.Configured)
            {
                return new Outcome(null, ApiErrorCode.ImagesUnavailable);
            }

            if (map.Version != request.MapVersion)
            {
                return new Outcome(null, ApiErrorCode.MapChanged);
            }

            if (await db.Assets.AnyAsync(
                    a => a.OwnerType == AssetOwnerType.BattleMap
                        && a.OwnerId == mapId
                        && (a.Status == AssetStatus.Queued || a.Status == AssetStatus.Running),
                    cancellationToken))
            {
                return new Outcome(null, ApiErrorCode.GenerationRunning);
            }

            var now = time.GetUtcNow();
            if (await MapBackgrounds.SpentSinceAsync(db, MapBackgrounds.MonthStart(now), cancellationToken) >= settings.MonthlyLimitUsd)
            {
                return new Outcome(null, ApiErrorCode.ImageBudgetExhausted);
            }

            // The worker renders the guide again from the map as it is then; this one gives
            // the prompt its legend and the version its frame.
            var guide = GuideRenderer.Render(map.Width, map.Height, map.Layout, settings.GuideTargetPixels);
            var asset = new Asset
            {
                Id = Guid.NewGuid(),
                Kind = AssetKind.MapBackground,
                OwnerType = AssetOwnerType.BattleMap,
                OwnerId = mapId,
                CampaignId = map.CampaignId,
                Origin = AssetOrigin.Generated,
                Status = AssetStatus.Queued,
                Prompt = Truncate(BackgroundPrompt.Build(map.Scene, map.Vibe, map.Lighting, map.Layout, guide)),
                Model = settings.Deployment,
                Quality = settings.Quality,
                GridWidth = map.Width,
                GridHeight = map.Height,
                FrameX = guide.FrameX,
                FrameY = guide.FrameY,
                FrameWidth = guide.FrameWidth,
                FrameHeight = guide.FrameHeight,
                LayoutHash = LayoutFingerprint.Of(map.Width, map.Height, map.Layout),
                CreatedAt = now,
                CreatedByUserId = userId,
            };
            db.Assets.Add(asset);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new Outcome(MapBackgrounds.ToView(asset, map.Width, map.Height, asset.LayoutHash), null);
        });

        if (outcome.Error is { } error)
        {
            return TypedResults.Conflict(new ApiError(error));
        }

        if (outcome.Background is not { } background)
        {
            return TypedResults.NotFound();
        }

        queue.Notify();
        return TypedResults.Accepted($"/api/campaigns/{campaignId}/maps/{mapId}/backgrounds", background);
    }

    // Sets the map's BackgroundAssetId: a Done version listed for the map (its own, or the
    // one it was copied with) that fits the map's size, or null. Doesn't raise the map's
    // sync version. Errors (409): BackgroundNotFound, BackgroundOutdated.
    private static async Task<Results<NoContent, NotFound, Conflict<ApiError>>> PickBackground(
        Guid campaignId,
        Guid mapId,
        PickBackgroundRequest request,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var map = await db.BattleMaps.AsNoTracking()
            .Where(m => m.Id == mapId && m.CampaignId == campaignId)
            .Select(m => new { m.Width, m.Height, m.BackgroundAssetId })
            .SingleOrDefaultAsync(cancellationToken);
        if (map is null)
        {
            return TypedResults.NotFound();
        }

        if (request.AssetId is { } assetId)
        {
            var asset = await db.Assets.AsNoTracking()
                .SingleOrDefaultAsync(
                    a => a.Id == assetId
                        && a.Kind == AssetKind.MapBackground
                        && a.Status == AssetStatus.Done
                        && ((a.OwnerType == AssetOwnerType.BattleMap && a.OwnerId == mapId) || a.Id == map.BackgroundAssetId),
                    cancellationToken);
            if (asset is null)
            {
                return TypedResults.Conflict(new ApiError(ApiErrorCode.BackgroundNotFound));
            }

            if (!MapBackgrounds.Fits(asset, map.Width, map.Height))
            {
                return TypedResults.Conflict(new ApiError(ApiErrorCode.BackgroundOutdated));
            }
        }

        // Not part of the sync item: Version and UpdatedAt stay as they are.
        await db.BattleMaps
            .Where(m => m.Id == mapId)
            .ExecuteUpdateAsync(set => set.SetProperty(m => m.BackgroundAssetId, request.AssetId), cancellationToken);
        return TypedResults.NoContent();
    }

    // The image, for a signed-in member of a campaign that uses it: the asset's own campaign,
    // or one whose map or encounter points to it. Images never change, so the answer may be
    // cached for good (Cache-Control: private, max-age=31536000, immutable). 404 otherwise,
    // and for an asset that isn't Done.
    private static async Task<Results<FileStreamHttpResult, NotFound>> GetAsset(
        Guid assetId, ClaimsPrincipal user, AppDbContext db, IAssetStore store, HttpContext http, CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var campaigns = db.CampaignMembers.Where(m => m.UserId == userId).Select(m => m.CampaignId);
        var asset = await db.Assets.AsNoTracking()
            .Where(a => a.Id == assetId && a.Status == AssetStatus.Done && a.BlobName != null)
            .Where(a => campaigns.Contains(a.CampaignId)
                || db.BattleMaps.Any(m => m.BackgroundAssetId == a.Id && campaigns.Contains(m.CampaignId))
                || db.Encounters.Any(e => e.BackgroundAssetId == a.Id && campaigns.Contains(e.CampaignId)))
            .Select(a => new { a.BlobName, a.ContentType })
            .SingleOrDefaultAsync(cancellationToken);
        if (asset is null || await store.OpenReadAsync(asset.BlobName!, cancellationToken) is not { } content)
        {
            return TypedResults.NotFound();
        }

        http.Response.Headers.CacheControl = CacheControl;
        return TypedResults.Stream(
            content,
            asset.ContentType ?? "application/octet-stream",
            entityTag: new EntityTagHeaderValue($"\"{assetId:N}\""));
    }

    private static async Task<ImageBudgetResponse> BudgetAsync(
        AppDbContext db, ImageOptions options, TimeProvider time, CancellationToken cancellationToken)
    {
        var monthStart = MapBackgrounds.MonthStart(time.GetUtcNow());
        var spent = await MapBackgrounds.SpentSinceAsync(db, monthStart, cancellationToken);
        return new ImageBudgetResponse(spent, options.MonthlyLimitUsd, monthStart, options.Configured);
    }

    private static string Truncate(string prompt) =>
        prompt.Length <= Asset.PromptMaxLength ? prompt : prompt[..Asset.PromptMaxLength];

    private sealed record Outcome(MapBackground? Background, ApiErrorCode? Error);
}
