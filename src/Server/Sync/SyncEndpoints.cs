using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Sync;

// knowledge/decisions/offline-prep-pwa.md, "Sync protocol". The rules of a push are in
// SyncPusher; the pull is these two reads.
internal static class SyncEndpoints
{
    // Rights are checked per item, at this moment, against the signed-in user.
    public static async Task<Ok<SyncPushResponse>> Push(
        SyncPushRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        TypedResults.Ok(await new SyncPusher(db, user.GetUserId(), time).RunAsync(request?.Items ?? [], cancellationToken));

    // Every item of the campaign, archived ones included, and its sessions.
    public static async Task<Ok<SyncVersionList>> Versions(Guid campaignId, AppDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(new SyncVersionList(
            await db.CreatureTypes.Where(t => t.CampaignId == campaignId).Select(t => new SyncItemVersion(t.Id, t.Version)).ToListAsync(cancellationToken),
            await db.BattleMaps.Where(m => m.CampaignId == campaignId).Select(m => new SyncItemVersion(m.Id, m.Version)).ToListAsync(cancellationToken),
            await db.Encounters.Where(e => e.CampaignId == campaignId).Select(e => new SyncItemVersion(e.Id, e.Version)).ToListAsync(cancellationToken),
            await db.Sessions
                .Where(s => s.CampaignId == campaignId)
                .Select(s => new SyncSession(s.Id, s.Title, s.Date, s.Status, s.DmUserId, s.Dm.DisplayName))
                .ToListAsync(cancellationToken)));

    // Ids beyond SyncProtocol.MaxFetchIds are ignored; unknown ids and ids of other
    // campaigns are left out.
    public static async Task<Ok<List<SyncServerItem>>> Fetch(
        Guid campaignId, SyncFetchRequest request, AppDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(await SyncItems.LoadAsync(
            db, campaignId, [.. (request?.Ids ?? []).Distinct().Take(SyncProtocol.MaxFetchIds)], cancellationToken));
}
