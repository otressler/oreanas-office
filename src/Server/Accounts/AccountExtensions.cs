using Microsoft.AspNetCore.Identity;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Accounts;

public static class AccountExtensions
{
    public const string GoogleCallbackPath = "/api/auth/google/callback";
    public static readonly TimeSpan SignInLifetime = TimeSpan.FromDays(180);

    // knowledge/decisions/auth.md: local accounts and Google through ASP.NET Core
    // Identity, cookie sessions that last 180 days and renew while the app is used.
    public static WebApplicationBuilder AddAccounts(this WebApplicationBuilder builder)
    {
        builder.Services.Configure<AdminOptions>(builder.Configuration.GetSection(AdminOptions.Section));

        var authentication = builder.Services.AddAuthentication(IdentityConstants.ApplicationScheme);
        authentication.AddIdentityCookies();

        // Google is optional, so tests, the build-time OpenAPI run and a fresh clone
        // work without a client. /api/auth/options tells the frontend whether it's on.
        var google = builder.Configuration.GetSection(GoogleSettings.Section).Get<GoogleSettings>();
        var googleEnabled = google is { ClientId.Length: > 0, ClientSecret.Length: > 0 };
        builder.Services.AddSingleton(new AccountFeatures(googleEnabled));
        if (googleEnabled)
        {
            authentication.AddGoogle(options =>
            {
                options.ClientId = google!.ClientId!;
                options.ClientSecret = google.ClientSecret!;
                options.CallbackPath = GoogleCallbackPath;
                options.SignInScheme = IdentityConstants.ExternalScheme;
            });
        }

        builder.Services.AddIdentityCore<AppUser>(options =>
            {
                options.User.RequireUniqueEmail = true;
                // UserName is the email address; Identity's character list would
                // reject some valid addresses.
                options.User.AllowedUserNameCharacters = "";
                options.Password.RequiredLength = 8;
                options.Password.RequiredUniqueChars = 1;
                options.Password.RequireDigit = false;
                options.Password.RequireLowercase = false;
                options.Password.RequireUppercase = false;
                options.Password.RequireNonAlphanumeric = false;
                options.SignIn.RequireConfirmedAccount = false;
            })
            .AddEntityFrameworkStores<AppDbContext>()
            .AddSignInManager()
            .AddDefaultTokenProviders()
            .AddClaimsPrincipalFactory<AppUserClaimsPrincipalFactory>();

        builder.Services.ConfigureApplicationCookie(options =>
        {
            options.Cookie.Name = "oreana.auth";
            options.Cookie.HttpOnly = true;
            options.Cookie.SameSite = SameSiteMode.Lax;
            options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
            options.ExpireTimeSpan = SignInLifetime;
            options.SlidingExpiration = true;

            // The API answers with status codes; the frontend decides where to go.
            options.Events.OnRedirectToLogin = context =>
            {
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return Task.CompletedTask;
            };
            options.Events.OnRedirectToAccessDenied = context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return Task.CompletedTask;
            };
        });

        return builder;
    }

}

// Which sign-in methods this deployment offers.
public sealed record AccountFeatures(bool GoogleEnabled);

public sealed class AdminOptions
{
    public const string Section = "Admin";

    // The project owner's Google address. Kept in configuration (user secrets,
    // .env, a Container Apps setting), never in the repository.
    public string? Email { get; set; }
}

public sealed class GoogleSettings
{
    public const string Section = "Authentication:Google";

    public string? ClientId { get; set; }

    public string? ClientSecret { get; set; }
}
