using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Authorization;

public enum CampaignAccess
{
    Member,
    Dm,
    SessionManager,
    SessionDm,
}

public sealed record CampaignRequirement(CampaignAccess Access) : IAuthorizationRequirement;

// Checks campaign and session roles against the database on every request, so a
// promotion or a new session DM applies at once, without signing in again.
public sealed class CampaignAuthorizationHandler(AppDbContext db) : AuthorizationHandler<CampaignRequirement>
{
    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context, CampaignRequirement requirement)
    {
        if (context.Resource is not HttpContext http
            || context.User.GetUserIdOrNull() is not { } userId
            || !TryGetRouteGuid(http, "campaignId", out var campaignId))
        {
            return;
        }

        var cancellationToken = http.RequestAborted;
        var role = await db.CampaignMembers
            .Where(m => m.CampaignId == campaignId && m.UserId == userId)
            .Select(m => (CampaignRole?)m.Role)
            .SingleOrDefaultAsync(cancellationToken);

        var allowed = requirement.Access switch
        {
            CampaignAccess.Member => role is not null,
            CampaignAccess.Dm => role == CampaignRole.Dm,
            CampaignAccess.SessionManager or CampaignAccess.SessionDm when role is not null =>
                await IsSessionAllowedAsync(http, campaignId, userId, requirement.Access, cancellationToken),
            _ => false,
        };

        if (allowed)
        {
            context.Succeed(requirement);
        }
    }

    private async Task<bool> IsSessionAllowedAsync(
        HttpContext http, Guid campaignId, Guid userId, CampaignAccess access, CancellationToken cancellationToken)
    {
        if (!TryGetRouteGuid(http, "sessionId", out var sessionId))
        {
            return false;
        }

        var session = await db.Sessions
            .Where(s => s.Id == sessionId && s.CampaignId == campaignId)
            .Select(s => new { s.DmUserId, s.Campaign.DefaultDmUserId })
            .SingleOrDefaultAsync(cancellationToken);

        return session is not null
            && (session.DmUserId == userId
                || (access == CampaignAccess.SessionManager && session.DefaultDmUserId == userId));
    }

    private static bool TryGetRouteGuid(HttpContext http, string name, out Guid value)
    {
        value = default;
        return http.Request.RouteValues.TryGetValue(name, out var raw) && Guid.TryParse(raw?.ToString(), out value);
    }
}
