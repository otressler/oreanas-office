using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Accounts;

namespace OreanasOffice.Server.Tests;

// Stands in for Google's callback: GET /test/google-answer sets the external
// cookie the Google handler would set after a successful sign-in, with the
// properties /api/auth/google/login or /link put into the challenge. A test then
// calls /api/auth/google/complete with the same client.
public static class FakeGoogle
{
    public const string AnswerPath = "/test/google-answer";

    public static void AddFakeGoogleAnswers(this IServiceCollection services) =>
        services.AddTransient<IStartupFilter, StartupFilter>();

    public static string AnswerUrl(
        GoogleAccount account, string mode, string? returnUrl = null, string? invite = null, Guid? userId = null)
    {
        var query = new Dictionary<string, string?>
        {
            ["key"] = account.ProviderKey,
            ["email"] = account.Email,
            ["verified"] = account.EmailVerified ? "true" : null,
            ["givenName"] = account.GivenName,
            ["mode"] = mode,
            ["returnUrl"] = returnUrl,
            ["invite"] = invite,
            ["userId"] = userId?.ToString(),
        };
        return QueryHelpers.AddQueryString(AnswerPath, query.Where(p => p.Value is not null));
    }

    private sealed class StartupFilter : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next) => app =>
        {
            // Not app.Map: that would set PathBase and so the cookie's path.
            app.Use((context, nextMiddleware) =>
                context.Request.Path == AnswerPath ? SignInAsync(context) : nextMiddleware(context));
            next(app);
        };

        private static async Task SignInAsync(HttpContext context)
        {
            var query = context.Request.Query;
            var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, query["key"].ToString()) };
            AddIfPresent(claims, ClaimTypes.Email, query["email"]);
            AddIfPresent(claims, GoogleClaims.EmailVerified, query["verified"]);
            AddIfPresent(claims, ClaimTypes.GivenName, query["givenName"]);

            var properties = new AuthenticationProperties { Items = { ["LoginProvider"] = GoogleSignIn.Provider } };
            foreach (var key in new[] { "mode", "returnUrl", "invite", "userId" })
            {
                if (!string.IsNullOrEmpty(query[key]))
                {
                    properties.Items[$"oreana:{key}"] = query[key];
                }
            }

            await context.SignInAsync(
                IdentityConstants.ExternalScheme,
                new ClaimsPrincipal(new ClaimsIdentity(claims, GoogleSignIn.Provider)),
                properties);
            context.Response.StatusCode = StatusCodes.Status204NoContent;
        }

        private static void AddIfPresent(List<Claim> claims, string type, string? value)
        {
            if (!string.IsNullOrEmpty(value))
            {
                claims.Add(new Claim(type, value));
            }
        }
    }
}
