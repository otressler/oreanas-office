using Microsoft.AspNetCore.Http.HttpResults;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;

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
    private static Task<Ok<List<SessionResponse>>> ListSessions(Guid campaignId) =>
        throw new NotImplementedException();

    private static Task<Results<Created<SessionResponse>, BadRequest<ApiError>>> CreateSession(
        Guid campaignId, CreateSessionRequest request) =>
        throw new NotImplementedException();

    // Planned → active. Conflict when another session of the campaign is active
    // (AnotherSessionActive) or this one has ended (SessionEnded). Already active: unchanged.
    private static Task<Results<Ok<SessionResponse>, Conflict<ApiError>>> ActivateSession(Guid campaignId, Guid sessionId) =>
        throw new NotImplementedException();

    // Planned or active → ended. Already ended: unchanged.
    private static Task<Ok<SessionResponse>> EndSession(Guid campaignId, Guid sessionId) =>
        throw new NotImplementedException();

    // The new DM must be a `dm` member (NotADm). Not allowed once ended (SessionEnded).
    private static Task<Results<Ok<SessionResponse>, BadRequest<ApiError>, Conflict<ApiError>>> ChangeSessionDm(
        Guid campaignId, Guid sessionId, ChangeSessionDmRequest request) =>
        throw new NotImplementedException();
}
