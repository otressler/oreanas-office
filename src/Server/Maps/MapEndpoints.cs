using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Maps;

// Deleting an archived map (knowledge/domain/battle-map.md, "Deleting"). Needs the server,
// like the store: devices drop their copy afterwards, and the next pull drops it on the DM's
// other devices.
public static class MapEndpoints
{
    // SQL Server 547: a foreign key stopped the delete.
    private const int ForeignKeyViolation = 547;

    public static IEndpointRouteBuilder MapMapEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/campaigns/{campaignId:guid}/maps/{mapId:guid}", DeleteMap)
            .WithTags("Maps")
            .RequireAuthorization(Policies.CampaignDm);
        return app;
    }

    // Deletes the archived map with its encounters that never started. Its own background
    // images go too, unless another map or an encounter shows them or a job refines them;
    // their rows stay, since they hold what the images cost for the monthly limit
    // (knowledge/decisions/image-budget.md). 404 for a map that isn't in the campaign (or
    // is gone already). MapNotArchived, MapPlayed (a running or ended encounter uses it) and
    // GenerationRunning (a background job is queued or running) are 409.
    private static async Task<Results<NoContent, NotFound, Conflict<ApiError>>> DeleteMap(
        Guid campaignId,
        Guid mapId,
        AppDbContext db,
        IAssetStore store,
        ILoggerFactory loggers,
        CancellationToken cancellationToken)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        var outcome = await strategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

            // A background job confirmed at the same moment takes the same lock (ImageEndpoints).
            await db.Database.ExecuteSqlAsync(
                $"EXEC sp_getapplock @Resource = {$"map-background:{mapId}"}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 20000",
                cancellationToken);

            var map = await db.BattleMaps.AsNoTracking()
                .Where(m => m.Id == mapId && m.CampaignId == campaignId)
                .Select(m => new { m.ArchivedAt })
                .SingleOrDefaultAsync(cancellationToken);
            if (map is null)
            {
                return new Deleted(null, false, []);
            }

            if (map.ArchivedAt is null)
            {
                return new Deleted(ApiErrorCode.MapNotArchived, true, []);
            }

            if (await db.Encounters.AnyAsync(
                    e => e.BattleMapId == mapId && (e.Status == EncounterStatus.Active || e.Status == EncounterStatus.Ended),
                    cancellationToken))
            {
                return new Deleted(ApiErrorCode.MapPlayed, true, []);
            }

            if (await db.Assets.AnyAsync(
                    a => a.OwnerType == AssetOwnerType.BattleMap && a.OwnerId == mapId
                        && (a.Status == AssetStatus.Queued || a.Status == AssetStatus.Running),
                    cancellationToken))
            {
                return new Deleted(ApiErrorCode.GenerationRunning, true, []);
            }

            // Their tokens go with them (cascade). Unplayed encounters have no moves, undo
            // entries or saved background.
            await db.Encounters
                .Where(e => e.BattleMapId == mapId && (e.Status == EncounterStatus.Draft || e.Status == EncounterStatus.Ready))
                .ExecuteDeleteAsync(cancellationToken);

            var images = await db.Assets
                .Where(a => a.OwnerType == AssetOwnerType.BattleMap && a.OwnerId == mapId && a.BlobName != null)
                .Where(a => !db.BattleMaps.Any(m => m.Id != mapId && m.BackgroundAssetId == a.Id)
                    && !db.Encounters.Any(e => e.BackgroundAssetId == a.Id)
                    && !db.Assets.Any(r => r.RefinedFromAssetId == a.Id
                        && (r.Status == AssetStatus.Queued || r.Status == AssetStatus.Running)))
                .ToListAsync(cancellationToken);
            var blobs = images.Select(a => a.BlobName!).ToList();
            foreach (var image in images)
            {
                image.BlobName = null;
            }

            await db.SaveChangesAsync(cancellationToken);

            try
            {
                // Unarchived meanwhile by a sync push: nothing is deleted.
                if (await db.BattleMaps.Where(m => m.Id == mapId && m.ArchivedAt != null).ExecuteDeleteAsync(cancellationToken) == 0)
                {
                    return new Deleted(ApiErrorCode.MapNotArchived, true, []);
                }
            }
            catch (SqlException ex) when (ex.Number == ForeignKeyViolation)
            {
                // An encounter started, or one was pushed for the map, since the checks above.
                return new Deleted(ApiErrorCode.MapPlayed, true, []);
            }

            await transaction.CommitAsync(cancellationToken);
            return new Deleted(null, true, blobs);
        });

        if (!outcome.Found)
        {
            return TypedResults.NotFound();
        }

        if (outcome.Error is { } error)
        {
            return TypedResults.Conflict(new ApiError(error));
        }

        // After the commit, so a failure here leaves only an unused file behind.
        foreach (var blob in outcome.Blobs)
        {
            try
            {
                await store.DeleteAsync(blob, CancellationToken.None);
            }
            catch (Exception ex)
            {
                loggers.CreateLogger(typeof(MapEndpoints).FullName!)
                    .LogWarning(ex, "Couldn't delete image {BlobName} of deleted map {MapId}", blob, mapId);
            }
        }

        return TypedResults.NoContent();
    }

    private sealed record Deleted(ApiErrorCode? Error, bool Found, List<string> Blobs);
}
