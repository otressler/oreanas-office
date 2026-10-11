using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace OreanasOffice.Server.Accounts;

// Adds the site admin flag to the sign-in cookie. Identity re-creates the
// principal when it revalidates the security stamp (every 30 minutes), so a
// changed flag reaches existing cookies without signing out.
public sealed class AppUserClaimsPrincipalFactory(UserManager<AppUser> users, IOptions<IdentityOptions> options)
    : UserClaimsPrincipalFactory<AppUser>(users, options)
{
    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(AppUser user)
    {
        var identity = await base.GenerateClaimsAsync(user);
        if (user.IsAdmin)
        {
            identity.AddClaim(new Claim(AppClaims.Admin, "true"));
        }

        return identity;
    }
}

public static class AppClaims
{
    public const string Admin = "oreana:admin";
}
