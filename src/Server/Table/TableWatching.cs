using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Table;

// Who may watch a session, and what a screen learns on the way in
// (knowledge/features/spectator-view.md, shared-table.md). Used by the hub's WatchSession
// and by the spectator endpoints, so both answer the same.
public static class TableWatching
{
    // The mode a screen gets, or the error. Members and session spectators may watch; only a
    // member may open a shared screen, and only while the session is in local mode. Anyone
    // without access, a shared screen of a non-member included, gets TokenNotFound, so the
    // answer doesn't tell whether the session exists.
    public static async Task<(ApiErrorCode? Error, ConnectionMode Mode)> AccessAsync(
        AppDbContext db, Guid userId, WatchSessionRequest request, CancellationToken cancellationToken)
    {
        var mode = request.SharedScreen ? ConnectionMode.SharedScreen : ConnectionMode.Spectator;
        var access = await db.Sessions
            .Where(s => s.Id == request.SessionId)
            .Select(s => new
            {
                IsMember = db.CampaignMembers.Any(m => m.CampaignId == s.CampaignId && m.UserId == userId),
                IsSpectator = db.SessionSpectators.Any(p => p.SessionId == s.Id && p.UserId == userId),
                s.PlayMode,
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (access is null || !(access.IsMember || (access.IsSpectator && !request.SharedScreen)))
        {
            return (ApiErrorCode.TokenNotFound, mode);
        }

        if (request.SharedScreen && access.PlayMode != PlayMode.Local)
        {
            return (ApiErrorCode.NotLocalMode, mode);
        }

        return (null, mode);
    }

    // The waiting-state data of a session: title, date, status, play mode, the running fight
    // and the campaign's characters with portrait and ring colour. Null for an unknown session.
    // The caller has checked access.
    public static async Task<WatchedSession?> LoadAsync(AppDbContext db, Guid sessionId, CancellationToken cancellationToken)
    {
        var session = await db.Sessions.AsNoTracking()
            .Where(s => s.Id == sessionId)
            .Select(s => new
            {
                s.CampaignId,
                s.Title,
                s.Date,
                s.Status,
                s.PlayMode,
                ActiveEncounterId = s.Encounters
                    .Where(e => e.Status == EncounterStatus.Active)
                    .Select(e => (Guid?)e.Id)
                    .FirstOrDefault(),
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (session is null)
        {
            return null;
        }

        var colors = await db.CharacterColorIndexesAsync(session.CampaignId, cancellationToken);
        var characters = (await db.Characters.AsNoTracking()
                .Where(c => c.CampaignId == session.CampaignId)
                .Select(c => new { c.Id, c.Name, c.Color, c.TokenAssetId })
                .ToListAsync(cancellationToken))
            .Select(c => new WatchedCharacter(
                c.Name,
                c.TokenAssetId is { } assetId ? MapBackgrounds.Url(assetId) : null,
                TablePeople.RingColor(colors[c.Id], c.Color),
                colors[c.Id]))
            .OrderBy(c => c.ColorIndex)
            .ToList();
        return new WatchedSession(
            sessionId, session.CampaignId, session.Title, session.Date, session.Status, session.PlayMode, session.ActiveEncounterId, characters);
    }
}
