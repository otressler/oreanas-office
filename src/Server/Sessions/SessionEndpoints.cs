using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Sessions;

// knowledge/domain/session.md: any `dm` member creates sessions; the session DM or
// the campaign's default DM makes one active, hands it over, ends it and continues it.
// At most one session per campaign is active. The session DM edits title and date.
public static class SessionEndpoints
{
    public static IEndpointRouteBuilder MapSessionEndpoints(this IEndpointRouteBuilder app)
    {
        var sessions = app.MapGroup("/api/campaigns/{campaignId:guid}/sessions").WithTags("Sessions");

        sessions.MapGet("/", ListSessions).RequireAuthorization(Policies.CampaignMember);
        sessions.MapPost("/", CreateSession).RequireAuthorization(Policies.CampaignDm);

        var session = sessions.MapGroup("/{sessionId:guid}");
        session.MapGet("/", GetSession).RequireAuthorization(Policies.CampaignMember);
        session.MapPut("/", UpdateSession).RequireAuthorization(Policies.SessionDm);
        session.MapPost("/activate", ActivateSession).RequireAuthorization(Policies.SessionManager);
        session.MapPost("/end", EndSession).RequireAuthorization(Policies.SessionManager);
        session.MapPut("/dm", ChangeSessionDm).RequireAuthorization(Policies.SessionManager);
        session.MapPut("/play-mode", SetPlayMode).RequireAuthorization(Policies.SessionDm);

        return app.MapSessionSpectatorEndpoints();
    }

    // Newest date first.
    private static async Task<Ok<List<SessionResponse>>> ListSessions(
        Guid campaignId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var sessions = await Responses(
                db.Sessions
                    .Where(s => s.CampaignId == campaignId)
                    .OrderByDescending(s => s.Date)
                    .ThenByDescending(s => s.CreatedAt),
                userId,
                await db.IsCampaignDmAsync(campaignId, userId, cancellationToken))
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(sessions);
    }

    private static async Task<Results<Ok<SessionResponse>, NotFound>> GetSession(
        Guid campaignId, Guid sessionId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var session = await Responses(
                db.Sessions.Where(s => s.Id == sessionId && s.CampaignId == campaignId),
                userId,
                await db.IsCampaignDmAsync(campaignId, userId, cancellationToken))
            .SingleOrDefaultAsync(cancellationToken);
        return session is null ? TypedResults.NotFound() : TypedResults.Ok(session);
    }

    // Title and date, also once the session has ended. The SessionDm policy has checked that
    // the session belongs to the campaign.
    private static async Task<Results<Ok<SessionResponse>, BadRequest<ApiError>>> UpdateSession(
        Guid campaignId,
        Guid sessionId,
        UpdateSessionRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        if (CheckTitleAndDate(request.Title, request.Date, out var title) is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        await db.Sessions
            .Where(s => s.Id == sessionId && s.CampaignId == campaignId)
            .ExecuteUpdateAsync(set => set.SetProperty(s => s.Title, title).SetProperty(s => s.Date, request.Date), cancellationToken);
        return TypedResults.Ok(await LoadAsync(db, campaignId, sessionId, user.GetUserId(), cancellationToken));
    }

    private static ApiError? CheckTitleAndDate(string? requestTitle, DateOnly date, out string title)
    {
        title = requestTitle?.Trim() ?? "";
        if (title.Length is 0 or > GameSession.TitleMaxLength)
        {
            return new ApiError(ApiErrorCode.NameInvalid, "title");
        }

        // A request without a date binds to 0001-01-01.
        return date == default ? new ApiError(ApiErrorCode.DateInvalid, "date") : null;
    }

    private static async Task<Results<Created<SessionResponse>, BadRequest<ApiError>>> CreateSession(
        Guid campaignId,
        CreateSessionRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        if (CheckTitleAndDate(request.Title, request.Date, out var title) is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        Guid dmUserId;
        if (request.DmUserId is { } requestedDm)
        {
            if (!await db.IsCampaignDmAsync(campaignId, requestedDm, cancellationToken))
            {
                return TypedResults.BadRequest(new ApiError(ApiErrorCode.NotADm, "dmUserId"));
            }

            dmUserId = requestedDm;
        }
        else
        {
            dmUserId = await db.Campaigns.Where(c => c.Id == campaignId).Select(c => c.DefaultDmUserId).SingleAsync(cancellationToken);
        }

        var userId = user.GetUserId();
        var session = new GameSession
        {
            CampaignId = campaignId,
            Title = title,
            Date = request.Date,
            DmUserId = dmUserId,
            CreatedByUserId = userId,
            Status = SessionStatus.Planned,
            CreatedAt = time.GetUtcNow(),
        };
        db.Sessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);

        var response = await LoadAsync(db, campaignId, session.Id, userId, cancellationToken);
        return TypedResults.Created($"/api/campaigns/{campaignId}/sessions/{session.Id}", response);
    }

    // Planned or ended → active. Conflict when another session of the campaign is active
    // (AnotherSessionActive). Already active: unchanged. Continuing an ended session brings
    // back the fight that ending it interrupted, in the same transaction, with its tokens
    // where they stood (knowledge/domain/session.md, "Continuing").
    //
    // Status changes are conditional updates (WHERE on the old status), not a read
    // and a save: otherwise an "end" landing between the read and the save of an
    // "activate" would be overwritten. When the status changed in between, the request
    // answers with the session as it is now instead of trying again.
    private static async Task<Results<Ok<SessionResponse>, Conflict<ApiError>>> ActivateSession(
        Guid campaignId,
        Guid sessionId,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var status = await StatusAsync(db, campaignId, sessionId, cancellationToken);
        if (status != SessionStatus.Active)
        {
            var anotherActive = await db.Sessions.AnyAsync(
                s => s.CampaignId == campaignId && s.Id != sessionId && s.Status == SessionStatus.Active, cancellationToken);
            if (anotherActive)
            {
                return TypedResults.Conflict(new ApiError(ApiErrorCode.AnotherSessionActive));
            }

            try
            {
                await SwitchToActiveAsync(db, sessionId, status, time.GetUtcNow(), cancellationToken);
            }
            catch (Exception ex) when (UniqueIndex.IsViolation(ex))
            {
                // Another session became active between the check and the update; the
                // filtered unique index IX_Sessions_CampaignId_Active let only one win.
                return TypedResults.Conflict(new ApiError(ApiErrorCode.AnotherSessionActive));
            }
        }

        return TypedResults.Ok(await LoadAsync(db, campaignId, sessionId, user.GetUserId(), cancellationToken));
    }

    // From `from` to active, with the interrupted fight back as running. False when the
    // session no longer has the status `from`; nothing is changed then.
    private static Task<bool> SwitchToActiveAsync(
        AppDbContext db, Guid sessionId, SessionStatus from, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        return strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            await db.Encounters
                .Where(e => e.SessionId == sessionId
                    && e.Status == EncounterStatus.Ended
                    && db.Sessions.Any(s => s.Id == sessionId && s.Status == SessionStatus.Ended && s.InterruptedEncounterId == e.Id))
                .ExecuteUpdateAsync(
                    set => set
                        .SetProperty(e => e.Status, EncounterStatus.Active)
                        .SetProperty(e => e.EndedAt, (DateTimeOffset?)null)
                        .SetProperty(e => e.Version, e => e.Version + 1)
                        .SetProperty(e => e.UpdatedAt, now),
                    cancellationToken);
            var updated = await db.Sessions
                .Where(s => s.Id == sessionId && s.Status == from)
                .ExecuteUpdateAsync(
                    set => set
                        .SetProperty(s => s.Status, SessionStatus.Active)
                        .SetProperty(s => s.InterruptedEncounterId, (Guid?)null),
                    cancellationToken);
            if (updated == 0)
            {
                // Disposing the transaction rolls the fight back too.
                return false;
            }

            await transaction.CommitAsync(cancellationToken);
            return true;
        });
    }

    // Planned or active → ended. Already ended: unchanged. The session's active
    // encounter ends with it, in the same transaction, is remembered as the interrupted
    // one, and its table hears EncounterEnded after the commit.
    private static async Task<Ok<SessionResponse>> EndSession(
        Guid campaignId,
        Guid sessionId,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        [FromServices] TableBroadcaster table,
        CancellationToken cancellationToken)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        var ended = await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            var endedSession = await db.Sessions
                .Where(s => s.Id == sessionId && s.CampaignId == campaignId && s.Status != SessionStatus.Ended)
                .ExecuteUpdateAsync(set => set.SetProperty(s => s.Status, SessionStatus.Ended), cancellationToken);
            var now = time.GetUtcNow();
            List<Guid> endedNow = [];
            if (await EncounterEndpoints.EndActiveAsync(db.Encounters.Where(e => e.SessionId == sessionId), now, cancellationToken) > 0)
            {
                // The encounters this call ended carry its timestamp.
                endedNow = await db.Encounters
                    .Where(e => e.SessionId == sessionId && e.Status == EncounterStatus.Ended && e.EndedAt == now)
                    .Select(e => e.Id)
                    .ToListAsync(cancellationToken);
            }

            if (endedSession > 0 && endedNow.Count > 0)
            {
                // At most one: the unique index allows one active encounter per session.
                var interrupted = endedNow[0];
                await db.Sessions
                    .Where(s => s.Id == sessionId)
                    .ExecuteUpdateAsync(set => set.SetProperty(s => s.InterruptedEncounterId, interrupted), cancellationToken);
            }

            await transaction.CommitAsync(cancellationToken);
            return endedNow;
        });

        foreach (var encounterId in ended)
        {
            await table.EncounterEndedAsync(sessionId, encounterId);
        }

        await table.SessionEndedAsync(sessionId);

        return TypedResults.Ok(await LoadAsync(db, campaignId, sessionId, user.GetUserId(), cancellationToken));
    }

    // The session DM switches between "Eigene Geräte" and "Gemeinsamer Bildschirm", also while
    // a fight runs (knowledge/features/shared-table.md). Every screen of the session hears
    // PlayModeChanged; nothing reloads. SessionEnded for an ended session.
    private static async Task<Results<Ok<SessionResponse>, Conflict<ApiError>>> SetPlayMode(
        Guid campaignId,
        Guid sessionId,
        SetPlayModeRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        [FromServices] TableBroadcaster table,
        CancellationToken cancellationToken)
    {
        if (await StatusAsync(db, campaignId, sessionId, cancellationToken) == SessionStatus.Ended)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.SessionEnded));
        }

        await db.Sessions
            .Where(s => s.Id == sessionId)
            .ExecuteUpdateAsync(set => set.SetProperty(s => s.PlayMode, request.PlayMode), cancellationToken);
        await table.PlayModeChangedAsync(sessionId, request.PlayMode);
        return TypedResults.Ok(await LoadAsync(db, campaignId, sessionId, user.GetUserId(), cancellationToken));
    }

    // The new DM must be a `dm` member (NotADm). Not allowed once ended (SessionEnded).
    private static async Task<Results<Ok<SessionResponse>, BadRequest<ApiError>, Conflict<ApiError>>> ChangeSessionDm(
        Guid campaignId,
        Guid sessionId,
        ChangeSessionDmRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        if (await StatusAsync(db, campaignId, sessionId, cancellationToken) == SessionStatus.Ended)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.SessionEnded));
        }

        if (!await db.IsCampaignDmAsync(campaignId, request.UserId, cancellationToken))
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.NotADm, "userId"));
        }

        var updated = await db.Sessions
            .Where(s => s.Id == sessionId && s.CampaignId == campaignId && s.Status != SessionStatus.Ended)
            .ExecuteUpdateAsync(set => set.SetProperty(s => s.DmUserId, request.UserId), cancellationToken);
        if (updated == 0)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.SessionEnded));
        }

        return TypedResults.Ok(await LoadAsync(db, campaignId, sessionId, user.GetUserId(), cancellationToken));
    }

    // The SessionManager policy has checked that the session belongs to the campaign.
    private static Task<SessionStatus> StatusAsync(
        AppDbContext db, Guid campaignId, Guid sessionId, CancellationToken cancellationToken) =>
        db.Sessions
            .Where(s => s.Id == sessionId && s.CampaignId == campaignId)
            .Select(s => s.Status)
            .SingleAsync(cancellationToken);

    private static async Task<SessionResponse> LoadAsync(
        AppDbContext db, Guid campaignId, Guid sessionId, Guid userId, CancellationToken cancellationToken) =>
        await Responses(
                db.Sessions.Where(s => s.Id == sessionId),
                userId,
                await db.IsCampaignDmAsync(campaignId, userId, cancellationToken))
            .SingleAsync(cancellationToken);

    // isDm: the user is a `dm` member of the campaign and sees the planned fights.
    private static IQueryable<SessionResponse> Responses(IQueryable<GameSession> sessions, Guid userId, bool isDm) =>
        sessions.Select(s => new SessionResponse(
            s.Id,
            s.Title,
            s.Date,
            s.Status,
            s.DmUserId,
            s.Dm.DisplayName,
            s.CreatedByUserId,
            s.DmUserId == userId || s.Campaign.DefaultDmUserId == userId,
            s.DmUserId == userId,
            s.Encounters
                .Where(e => e.Status == EncounterStatus.Active)
                .Select(e => new ActiveEncounterSummary(e.Id, e.Name))
                .FirstOrDefault(),
            s.Encounters
                .Where(e => e.Id == s.InterruptedEncounterId)
                .Select(e => new ActiveEncounterSummary(e.Id, e.Name))
                .FirstOrDefault(),
            s.Encounters
                .AsQueryable()
                .Where(e => isDm)
                .OrderBy(e => e.CreatedAt)
                .ThenBy(e => e.Id)
                .Select(EncounterEndpoints.SummaryOf)
                .ToList(),
            s.PlayMode));
}
