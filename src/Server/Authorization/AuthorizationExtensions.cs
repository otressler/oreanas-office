using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using OreanasOffice.Server.Accounts;

namespace OreanasOffice.Server.Authorization;

public static class AuthorizationExtensions
{
    public static WebApplicationBuilder AddAppAuthorization(this WebApplicationBuilder builder)
    {
        builder.Services.AddScoped<IAuthorizationHandler, CampaignAuthorizationHandler>();
        builder.Services.AddAuthorizationBuilder()
            .AddPolicy(Policies.Admin, policy => policy.RequireAuthenticatedUser().RequireClaim(AppClaims.Admin, "true"))
            .AddPolicy(Policies.CampaignMember, policy => Campaign(policy, CampaignAccess.Member))
            .AddPolicy(Policies.CampaignDm, policy => Campaign(policy, CampaignAccess.Dm))
            .AddPolicy(Policies.SessionManager, policy => Campaign(policy, CampaignAccess.SessionManager))
            .AddPolicy(Policies.SessionDm, policy => Campaign(policy, CampaignAccess.SessionDm));
        return builder;
    }

    private static void Campaign(AuthorizationPolicyBuilder policy, CampaignAccess access) =>
        policy.RequireAuthenticatedUser().AddRequirements(new CampaignRequirement(access));

    public static Guid? GetUserIdOrNull(this ClaimsPrincipal user) =>
        Guid.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    // For endpoints behind RequireAuthorization, where a user id is always present.
    public static Guid GetUserId(this ClaimsPrincipal user) =>
        user.GetUserIdOrNull() ?? throw new InvalidOperationException("The request has no signed-in user.");
}
