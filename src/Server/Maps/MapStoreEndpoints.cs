using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Sync;

namespace OreanasOffice.Server.Maps;

// The map store (knowledge/domain/battle-map.md, "Store"): maps of other campaigns that
// a `dm` member can copy into theirs. Needs the server, so it is never offline.
public static class MapStoreEndpoints
{
    public static IEndpointRouteBuilder MapMapStoreEndpoints(this IEndpointRouteBuilder app)
    {
        var store = app.MapGroup("/api/campaigns/{campaignId:guid}/map-store")
            .WithTags("Maps")
            .RequireAuthorization(Policies.CampaignDm);

        store.MapGet("/", ListStore);
        store.MapPost("/{mapId:guid}", AddFromStore);
        return app;
    }

    // Every unarchived map of other campaigns, except maps this campaign already has an
    // unarchived copy of, and copies made from this campaign's own maps.
    private static async Task<Ok<List<StoreMapResponse>>> ListStore(
        Guid campaignId, AppDbContext db, CancellationToken cancellationToken)
    {
        var own = await OwnMapsAsync(db, campaignId, cancellationToken);
        var maps = await db.BattleMaps.AsNoTracking()
            .Where(m => m.CampaignId != campaignId && m.ArchivedAt == null)
            .OrderBy(m => m.Campaign.Name)
            .ThenBy(m => m.Name)
            .ThenBy(m => m.Id)
            .Select(m => new StoreMapResponse(m.Id, m.Name, m.Width, m.Height, m.Campaign.Name, m.Layout, false))
            .ToListAsync(cancellationToken);
        var sources = await db.BattleMaps.AsNoTracking()
            .Where(m => m.CampaignId != campaignId && m.ArchivedAt == null && m.CopiedFromMapId != null && own.Ids.Contains(m.CopiedFromMapId.Value))
            .Select(m => m.Id)
            .ToListAsync(cancellationToken);

        return TypedResults.Ok<List<StoreMapResponse>>(
        [
            .. maps
                .Where(m => !sources.Contains(m.Id) && !own.UnarchivedCopiesOf.Contains(m.Id))
                .Select(m => m with { HasArchivedCopy = own.ArchivedCopiesOf.Contains(m.Id) }),
        ]);
    }

    // Copies the map into this campaign, or brings back this campaign's archived copy.
    // MapNotInStore (409) when the map is not offered.
    private static async Task<Results<Ok<SyncServerItem>, Conflict<ApiError>>> AddFromStore(
        Guid campaignId,
        Guid mapId,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var strategy = db.Database.CreateExecutionStrategy();
        var copyId = await strategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);

            // Two adds of the same map at once (a double tap) must not make two copies;
            // there is no unique index to stop them, so they take turns.
            await db.Database.ExecuteSqlAsync(
                $"EXEC sp_getapplock @Resource = {$"map-store:{campaignId}:{mapId}"}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 20000",
                cancellationToken);

            var source = await db.BattleMaps.AsNoTracking().SingleOrDefaultAsync(m => m.Id == mapId, cancellationToken);
            if (source is null || source.CampaignId == campaignId || source.ArchivedAt is not null)
            {
                return (Guid?)null;
            }

            var own = await OwnMapsAsync(db, campaignId, cancellationToken);
            if (own.UnarchivedCopiesOf.Contains(mapId)
                || (source.CopiedFromMapId is { } from && own.Ids.Contains(from)))
            {
                return null;
            }

            var now = time.GetUtcNow();
            var copy = await db.BattleMaps.FirstOrDefaultAsync(
                m => m.CampaignId == campaignId && m.CopiedFromMapId == mapId && m.ArchivedAt != null, cancellationToken);
            if (copy is not null)
            {
                copy.ArchivedAt = null;
                copy.Version += 1;
            }
            else
            {
                // A copy takes name, size, layout, scene, vibe and lighting; encounters and
                // creatures stay behind.
                copy = db.BattleMaps.Add(new BattleMap
                {
                    Id = Guid.NewGuid(),
                    CampaignId = campaignId,
                    Name = source.Name,
                    Width = source.Width,
                    Height = source.Height,
                    Layout = source.Layout,
                    Scene = source.Scene,
                    Vibe = source.Vibe,
                    Lighting = source.Lighting,
                    CreatedAt = now,
                    CopiedFromMapId = mapId,
                }).Entity;
            }

            copy.UpdatedAt = now;
            copy.UpdatedByUserId = userId;
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return copy.Id;
        });

        if (copyId is not { } id)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.MapNotInStore));
        }

        db.ChangeTracker.Clear();
        return TypedResults.Ok((await SyncItems.LoadOneAsync(db, campaignId, id, cancellationToken))!);
    }

    // The campaign's own maps and the copies among them, archived ones included.
    private static async Task<OwnMaps> OwnMapsAsync(AppDbContext db, Guid campaignId, CancellationToken cancellationToken)
    {
        var own = await db.BattleMaps.AsNoTracking()
            .Where(m => m.CampaignId == campaignId)
            .Select(m => new { m.Id, m.CopiedFromMapId, m.ArchivedAt })
            .ToListAsync(cancellationToken);
        return new OwnMaps(
            own.Select(m => m.Id).ToHashSet(),
            own.Where(m => m.CopiedFromMapId != null && m.ArchivedAt == null).Select(m => m.CopiedFromMapId!.Value).ToHashSet(),
            own.Where(m => m.CopiedFromMapId != null && m.ArchivedAt != null).Select(m => m.CopiedFromMapId!.Value).ToHashSet());
    }

    private sealed record OwnMaps(HashSet<Guid> Ids, HashSet<Guid> UnarchivedCopiesOf, HashSet<Guid> ArchivedCopiesOf);
}

// A map another campaign could copy. HasArchivedCopy: adding it brings this campaign's
// archived copy back.
public record StoreMapResponse(
    Guid Id, string Name, int Width, int Height, string CampaignName, MapLayout Layout, bool HasArchivedCopy);
