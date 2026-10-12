using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Sessions;

// knowledge/domain/session.md: any `dm` member creates sessions; the session DM or
// the campaign's default DM makes one active, hands it over and ends it. At most
// one session per campaign is active.
public static class SessionEndpoints
{
    public static IEndpointRouteBuilder MapSessionEndpoints(this IEndpointRouteBuilder app)
    {
        var sessions = app.MapGroup("/api/campaigns/{campaignId:guid}/sessions").WithTags("Sessions");

        sessions.MapGet("/", ListSessions).RequireAuthorization(Policies.CampaignMember);
        sessions.MapPost("/", CreateSession).RequireAuthorization(Policies.CampaignDm);

        var session = sessions.MapGroup("/{sessionId:guid}").RequireAuthorization(Policies.SessionManager);
        session.MapPost("/activate", ActivateSession);
        session.MapPost("/end", EndSession);
        session.MapPut("/dm", ChangeSessionDm);

        return app;
    }

    // Newest date first.
    private static async Task<Ok<List<SessionResponse>>> ListSessions(
        Guid campaignId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var sessions = await Responses(
                db.Sessions
                    .Where(s => s.CampaignId == campaignId)
                    .OrderByDescending(s => s.Date)
                    .ThenByDescending(s => s.CreatedAt),
                user.GetUserId())
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(sessions);
    }

    private static async Task<Results<Created<SessionResponse>, BadRequest<ApiError>>> CreateSession(
        Guid campaignId,
        CreateSessionRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var title = request.Title?.Trim();
        if (string.IsNullOrEmpty(title) || title.Length > GameSession.TitleMaxLength)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.NameInvalid, "title"));
        }

        // A request without a date binds to 0001-01-01.
        if (request.Date == default)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.DateInvalid, "date"));
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

        var response = await LoadAsync(db, session.Id, userId, cancellationToken);
        return TypedResults.Created($"/api/campaigns/{campaignId}/sessions/{session.Id}", response);
    }

    // Planned → active. Conflict when another session of the campaign is active
    // (AnotherSessionActive) or this one has ended (SessionEnded). Already active: unchanged.
    //
    // Status changes are conditional updates (WHERE on the old status), not a read
    // and a save: otherwise an "end" landing between the read and the save of an
    // "activate" would be overwritten, and an ended session would run again.
    private static async Task<Results<Ok<SessionResponse>, Conflict<ApiError>>> ActivateSession(
        Guid campaignId, Guid sessionId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var status = await StatusAsync(db, campaignId, sessionId, cancellationToken);
        if (status == SessionStatus.Planned)
        {
            var anotherActive = await db.Sessions.AnyAsync(
                s => s.CampaignId == campaignId && s.Id != sessionId && s.Status == SessionStatus.Active, cancellationToken);
            if (anotherActive)
            {
                return TypedResults.Conflict(new ApiError(ApiErrorCode.AnotherSessionActive));
            }

            try
            {
                var updated = await db.Sessions
                    .Where(s => s.Id == sessionId && s.Status == SessionStatus.Planned)
                    .ExecuteUpdateAsync(set => set.SetProperty(s => s.Status, SessionStatus.Active), cancellationToken);
                if (updated == 0)
                {
                    // Someone else started or ended it in the meantime.
                    status = await StatusAsync(db, campaignId, sessionId, cancellationToken);
                }
            }
            catch (Exception ex) when (UniqueIndex.IsViolation(ex))
            {
                // Another session became active between the check and the update; the
                // filtered unique index IX_Sessions_CampaignId_Active let only one win.
                return TypedResults.Conflict(new ApiError(ApiErrorCode.AnotherSessionActive));
            }
        }

        if (status == SessionStatus.Ended)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.SessionEnded));
        }

        return TypedResults.Ok(await LoadAsync(db, sessionId, user.GetUserId(), cancellationToken));
    }

    // Planned or active → ended. Already ended: unchanged. The session's active
    // encounter ends with it, in the same transaction.
    private static async Task<Ok<SessionResponse>> EndSession(
        Guid campaignId,
        Guid sessionId,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            await db.Sessions
                .Where(s => s.Id == sessionId && s.CampaignId == campaignId && s.Status != SessionStatus.Ended)
                .ExecuteUpdateAsync(set => set.SetProperty(s => s.Status, SessionStatus.Ended), cancellationToken);
            await EncounterEndpoints.EndActiveAsync(
                db.Encounters.Where(e => e.SessionId == sessionId), time.GetUtcNow(), cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        });

        return TypedResults.Ok(await LoadAsync(db, sessionId, user.GetUserId(), cancellationToken));
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

        return TypedResults.Ok(await LoadAsync(db, sessionId, user.GetUserId(), cancellationToken));
    }

    // The SessionManager policy has checked that the session belongs to the campaign.
    private static Task<SessionStatus> StatusAsync(
        AppDbContext db, Guid campaignId, Guid sessionId, CancellationToken cancellationToken) =>
        db.Sessions
            .Where(s => s.Id == sessionId && s.CampaignId == campaignId)
            .Select(s => s.Status)
            .SingleAsync(cancellationToken);


    private static Task<SessionResponse> LoadAsync(
        AppDbContext db, Guid sessionId, Guid userId, CancellationToken cancellationToken) =>
        Responses(db.Sessions.Where(s => s.Id == sessionId), userId).SingleAsync(cancellationToken);

    private static IQueryable<SessionResponse> Responses(IQueryable<GameSession> sessions, Guid userId) =>
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
                .FirstOrDefault()));
}
