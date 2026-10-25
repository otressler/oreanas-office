using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Accounts;

// For the Playwright tests and local development, which can't sign in to Google to
// become admin: they get registration invites here (scripts/dev-user.ps1 uses it).
// Mapped only in the E2E and Development environments, so production never has it.
public static class TestingEndpoints
{
    public const string Environment = "E2E";

    public static bool IsMappedIn(IHostEnvironment environment) =>
        environment.IsEnvironment(Environment) || environment.IsDevelopment();

    // The invite's creator. Invites need one, and nobody is admin in a fresh E2E
    // database. It has no password and no Google login, so nobody can sign in as it.
    private const string CreatorEmail = "e2e-invites@oreanas-office.test";

    public static IEndpointRouteBuilder MapTestingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/testing/invites", CreateInvite).ExcludeFromDescription();
        return app;
    }

    private static async Task<Ok<CreatedInviteResponse>> CreateInvite(
        Invites invites, UserManager<AppUser> users, AppDbContext db, TimeProvider time, HttpRequest request)
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

            // Parallel test workers may race to create it, and then the other one
            // won: either Identity's duplicate check or the unique index says so.
            // A failed insert stays tracked, so forget it before looking again.
            bool created;
            try
            {
                created = (await users.CreateAsync(creator)).Succeeded;
            }
            catch (DbUpdateException)
            {
                created = false;
            }

            if (!created)
            {
                db.ChangeTracker.Clear();
                creator = await users.FindByEmailAsync(CreatorEmail)
                    ?? throw new InvalidOperationException("The E2E invite creator couldn't be created.");
            }
        }

        return TypedResults.Ok(await invites.CreateAsync(creator.Id, request));
    }
}
