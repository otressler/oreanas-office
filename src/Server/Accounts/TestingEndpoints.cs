using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;

namespace OreanasOffice.Server.Accounts;

// Only for the Playwright tests, which can't sign in to Google to become admin:
// they get registration invites here. Mapped only in the E2E environment, so it
// doesn't exist anywhere else.
public static class TestingEndpoints
{
    public const string Environment = "E2E";

    // The invite's creator. Invites need one, and nobody is admin in a fresh E2E
    // database. It has no password and no Google login, so nobody can sign in as it.
    private const string CreatorEmail = "e2e-invites@oreanas-office.test";

    public static IEndpointRouteBuilder MapTestingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/testing/invites", CreateInvite).ExcludeFromDescription();
        return app;
    }

    private static async Task<Ok<CreatedInviteResponse>> CreateInvite(
        Invites invites, UserManager<AppUser> users, TimeProvider time, HttpRequest request)
    {
        var creator = await users.FindByEmailAsync(CreatorEmail);
        if (creator is null)
        {
            creator = new AppUser
            {
                DisplayName = "E2E",
                Email = CreatorEmail,
                UserName = CreatorEmail,
                CreatedAt = time.GetUtcNow(),
            };

            // Parallel test workers may race to create it; then the other one won.
            if (!(await users.CreateAsync(creator)).Succeeded)
            {
                creator = await users.FindByEmailAsync(CreatorEmail)
                    ?? throw new InvalidOperationException("The E2E invite creator couldn't be created.");
            }
        }

        return TypedResults.Ok(await invites.CreateAsync(creator.Id, request));
    }
}
