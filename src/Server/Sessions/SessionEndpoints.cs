using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;

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

        Guid dmUserId;
        if (request.DmUserId is { } requestedDm)
        {
            if (!await IsDmMemberAsync(db, campaignId, requestedDm, cancellationToken))
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
    private static async Task<Results<Ok<SessionResponse>, Conflict<ApiError>>> ActivateSession(
        Guid campaignId, Guid sessionId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var session = await FindAsync(db, campaignId, sessionId, cancellationToken);
        if (session.Status == SessionStatus.Ended)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.SessionEnded));
        }

        if (session.Status == SessionStatus.Planned)
        {
            var anotherActive = await db.Sessions.AnyAsync(
                s => s.CampaignId == campaignId && s.Id != sessionId && s.Status == SessionStatus.Active, cancellationToken);
            if (anotherActive)
            {
                return TypedResults.Conflict(new ApiError(ApiErrorCode.AnotherSessionActive));
            }

            session.Status = SessionStatus.Active;
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException ex) when (UniqueIndex.IsViolation(ex))
            {
                // Another session became active between the check and the save; the
                // filtered unique index IX_Sessions_CampaignId_Active let only one win.
                return TypedResults.Conflict(new ApiError(ApiErrorCode.AnotherSessionActive));
            }
        }

        return TypedResults.Ok(await LoadAsync(db, sessionId, user.GetUserId(), cancellationToken));
    }

    // Planned or active → ended. Already ended: unchanged.
    private static async Task<Ok<SessionResponse>> EndSession(
        Guid campaignId, Guid sessionId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var session = await FindAsync(db, campaignId, sessionId, cancellationToken);
        if (session.Status != SessionStatus.Ended)
        {
            session.Status = SessionStatus.Ended;
            await db.SaveChangesAsync(cancellationToken);
        }

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
        var session = await FindAsync(db, campaignId, sessionId, cancellationToken);
        if (session.Status == SessionStatus.Ended)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.SessionEnded));
        }

        if (!await IsDmMemberAsync(db, campaignId, request.UserId, cancellationToken))
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.NotADm, "userId"));
        }

        session.DmUserId = request.UserId;
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(await LoadAsync(db, sessionId, user.GetUserId(), cancellationToken));
    }

    // The SessionManager policy has checked that the session belongs to the campaign.
    private static Task<GameSession> FindAsync(
        AppDbContext db, Guid campaignId, Guid sessionId, CancellationToken cancellationToken) =>
        db.Sessions.SingleAsync(s => s.Id == sessionId && s.CampaignId == campaignId, cancellationToken);

    private static Task<bool> IsDmMemberAsync(AppDbContext db, Guid campaignId, Guid userId, CancellationToken cancellationToken) =>
        db.CampaignMembers.AnyAsync(
            m => m.CampaignId == campaignId && m.UserId == userId && m.Role == CampaignRole.Dm, cancellationToken);

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
            s.DmUserId == userId || s.Campaign.DefaultDmUserId == userId));
}
