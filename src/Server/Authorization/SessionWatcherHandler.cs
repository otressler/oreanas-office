using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Authorization;

// Access to one session's spectator data (knowledge/features/spectator-view.md): a member of
// the session's campaign, or someone who joined the session as a spectator. Nothing else in
// the campaign opens up for a session spectator; the campaign policies still ask for
// membership.
public sealed record SessionWatcherRequirement : IAuthorizationRequirement;

public sealed class SessionWatcherHandler(AppDbContext db) : AuthorizationHandler<SessionWatcherRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context, SessionWatcherRequirement requirement)
    {
        if (context.Resource is not HttpContext http
            || context.User.GetUserIdOrNull() is not { } userId
            || !http.Request.RouteValues.TryGetValue("sessionId", out var raw)
            || !Guid.TryParse(raw?.ToString(), out var sessionId))
        {
            return;
        }

        var allowed = await db.Sessions.AnyAsync(
            s => s.Id == sessionId
                && (db.CampaignMembers.Any(m => m.CampaignId == s.CampaignId && m.UserId == userId)
                    || db.SessionSpectators.Any(p => p.SessionId == s.Id && p.UserId == userId)),
            http.RequestAborted);
        if (allowed)
        {
            context.Succeed(requirement);
        }
    }
}
