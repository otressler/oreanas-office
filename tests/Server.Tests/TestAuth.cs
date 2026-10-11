using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Accounts;

namespace OreanasOffice.Server.Tests;

// Lets a test act as a user without going through sign-in: requests with an
// X-Test-User header are authenticated as that user, with the same claims a real
// sign-in cookie carries. Requests without the header use the real cookie, so
// sign-in tests run against the same app.
public static class TestAuth
{
    public const string Scheme = "Test";
    public const string Header = "X-Test-User";
    private const string Selector = "TestOrCookie";

    public static void AddTestAuth(this IServiceCollection services)
    {
        services.AddAuthentication(options =>
            {
                options.DefaultScheme = Selector;
                options.DefaultAuthenticateScheme = Selector;
                options.DefaultChallengeScheme = Selector;
                options.DefaultForbidScheme = Selector;
            })
            .AddPolicyScheme(Selector, null, options => options.ForwardDefaultSelector = context =>
                context.Request.Headers.ContainsKey(Header) ? Scheme : IdentityConstants.ApplicationScheme)
            .AddScheme<AuthenticationSchemeOptions, Handler>(Scheme, null);
    }

    private sealed class Handler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        UserManager<AppUser> users,
        IUserClaimsPrincipalFactory<AppUser> claims)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue(Header, out var value) || await users.FindByIdAsync(value.ToString()) is not { } user)
            {
                return AuthenticateResult.Fail("Unknown test user");
            }

            var principal = await claims.CreateAsync(user);
            var identity = new ClaimsIdentity(principal.Claims, TestAuth.Scheme);
            return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), TestAuth.Scheme));
        }
    }
}
