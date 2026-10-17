using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Sessions;

// Session spectators and the join page (knowledge/features/spectator-view.md, "Joining a
// session", "The join page"). Someone who isn't a member joins one session with the
// campaign's join code and may then read that session's spectator data and nothing else.

// What the join page learns from a join code, without joining: names, dates and statuses
// only. Sessions: the planned and running ones, the running one first.
public record JoinLookupResponse(Guid CampaignId, string CampaignName, bool IsMember, List<JoinableSession> Sessions);

public record JoinableSession(Guid Id, string Title, DateOnly Date, SessionStatus Status);

public record SpectateSessionRequest(Guid SessionId);

public record SpectateSessionResponse(Guid CampaignId, Guid SessionId, bool IsMember);

public static class SessionSpectatorEndpoints
{
    public static IEndpointRouteBuilder MapSessionSpectatorEndpoints(this IEndpointRouteBuilder app)
    {
        var join = app.MapGroup("/api/join").WithTags("Spectators").RequireAuthorization();
        join.MapGet("/{joinCode}", LookUpJoinCode);
        join.MapPost("/{joinCode}/spectate", JoinAsSpectator);

        var watch = app.MapGroup("/api/sessions/{sessionId:guid}/spectate").WithTags("Spectators")
            .RequireAuthorization(Policies.SessionWatcher);
        watch.MapGet("/", GetWatchedSession);
        watch.MapGet("/board", GetWatchedBoard);

        return app;
    }

    // 400 JoinCodeInvalid for a code that doesn't exist. Members see IsMember and get the same
    // list: the join page never turns anyone away.
    private static async Task<Results<Ok<JoinLookupResponse>, BadRequest<ApiError>>> LookUpJoinCode(
        string joinCode, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var code = JoinCodes.Normalize(joinCode);
        var campaign = code is null
            ? null
            : await db.Campaigns.AsNoTracking()
                .Where(c => c.JoinCode == code)
                .Select(c => new
                {
                    c.Id,
                    c.Name,
                    IsMember = c.Members.Any(m => m.UserId == userId),
                    Sessions = c.Sessions
                        .Where(s => s.Status != SessionStatus.Ended)
                        .OrderBy(s => s.Status == SessionStatus.Active ? 0 : 1)
                        .ThenBy(s => s.Date)
                        .ThenBy(s => s.CreatedAt)
                        .Select(s => new JoinableSession(s.Id, s.Title, s.Date, s.Status))
                        .ToList(),
                })
                .SingleOrDefaultAsync(cancellationToken);
        return campaign is null
            ? TypedResults.BadRequest(new ApiError(ApiErrorCode.JoinCodeInvalid, "code"))
            : TypedResults.Ok(new JoinLookupResponse(campaign.Id, campaign.Name, campaign.IsMember, campaign.Sessions));
    }

    // "Nur zuschauen": a session spectator entry for a planned or running session of the
    // campaign, idempotent. Members need none and just get the answer. Errors: JoinCodeInvalid,
    // SessionInvalid (not a session of this campaign), SessionEnded (not for a non-member).
    private static async Task<Results<Ok<SpectateSessionResponse>, BadRequest<ApiError>, Conflict<ApiError>>> JoinAsSpectator(
        string joinCode,
        SpectateSessionRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var code = JoinCodes.Normalize(joinCode);
        var campaignId = code is null
            ? (Guid?)null
            : await db.Campaigns.Where(c => c.JoinCode == code).Select(c => (Guid?)c.Id).SingleOrDefaultAsync(cancellationToken);
        if (campaignId is not { } id)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.JoinCodeInvalid, "code"));
        }

        var status = await db.Sessions
            .Where(s => s.Id == request.SessionId && s.CampaignId == id)
            .Select(s => (SessionStatus?)s.Status)
            .SingleOrDefaultAsync(cancellationToken);
        if (status is not { } sessionStatus)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.SessionInvalid, "sessionId"));
        }

        if (await db.CampaignMembers.AnyAsync(m => m.CampaignId == id && m.UserId == userId, cancellationToken))
        {
            return TypedResults.Ok(new SpectateSessionResponse(id, request.SessionId, true));
        }

        // An entry made earlier keeps working, also after the session ended and was continued.
        if (!await db.SessionSpectators.AnyAsync(p => p.SessionId == request.SessionId && p.UserId == userId, cancellationToken))
        {
            if (sessionStatus == SessionStatus.Ended)
            {
                return TypedResults.Conflict(new ApiError(ApiErrorCode.SessionEnded));
            }

            db.SessionSpectators.Add(new SessionSpectator { SessionId = request.SessionId, UserId = userId, JoinedAt = time.GetUtcNow() });
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException ex) when (UniqueIndex.IsViolation(ex))
            {
                // The same person joined twice at once; the other request added the entry.
                db.ChangeTracker.Clear();
            }
        }

        return TypedResults.Ok(new SpectateSessionResponse(id, request.SessionId, false));
    }

    // What a spectator screen shows before and between fights (the hub's WatchSession state).
    private static async Task<Results<Ok<WatchedSession>, NotFound>> GetWatchedSession(
        Guid sessionId, AppDbContext db, CancellationToken cancellationToken) =>
        await TableWatching.LoadAsync(db, sessionId, cancellationToken) is { } session
            ? TypedResults.Ok(session)
            : TypedResults.NotFound();

    // The players' board of the session's running fight, whoever asks: the one a spectator
    // screen draws (TableVisibility.ForPlayers). 404 without a running fight.
    private static async Task<Results<Ok<BoardStateResponse>, NotFound>> GetWatchedBoard(
        Guid sessionId, ClaimsPrincipal user, AppDbContext db, TablePresence presence, CancellationToken cancellationToken)
    {
        var encounter = await db.Encounters.AsNoTracking()
            .Where(e => e.SessionId == sessionId && e.Status == EncounterStatus.Active)
            .Select(e => new { e.Id, e.CampaignId })
            .FirstOrDefaultAsync(cancellationToken);
        if (encounter is null)
        {
            return TypedResults.NotFound();
        }

        var board = await EncounterEndpoints.LoadBoardAsync(
            db, presence, encounter.CampaignId, encounter.Id, user.GetUserId(), asPlayer: true, () => Task.FromResult(false), cancellationToken);
        return board is null ? TypedResults.NotFound() : TypedResults.Ok(board);
    }
}
