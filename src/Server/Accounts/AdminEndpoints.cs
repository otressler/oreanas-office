using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Accounts;

// Site admin only: registration invites and password-reset links.
public static class AdminEndpoints
{
    public static IEndpointRouteBuilder MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/admin").WithTags("Admin").RequireAuthorization(Policies.Admin);

        admin.MapGet("/invites", ListInvites);
        admin.MapPost("/invites", CreateInvite);
        admin.MapDelete("/invites/{inviteId:guid}", RevokeInvite);
        admin.MapGet("/users", ListUsers);
        admin.MapPost("/users/{userId:guid}/reset-link", CreateResetLink);

        return app;
    }

    // Invites that still work: not expired, not revoked.
    private static async Task<Ok<List<InviteResponse>>> ListInvites(
        AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        var invites = await db.RegistrationInvites
            .Where(i => i.RevokedAt == null && i.ExpiresAt > now)
            .OrderByDescending(i => i.CreatedAt)
            .Select(i => new InviteResponse(i.Id, i.CreatedAt, i.ExpiresAt))
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(invites);
    }

    private static async Task<Ok<CreatedInviteResponse>> CreateInvite(
        ClaimsPrincipal principal, Invites invites, HttpRequest request) =>
        TypedResults.Ok(await invites.CreateAsync(principal.GetUserId(), request));

    private static async Task<Results<NoContent, NotFound>> RevokeInvite(
        Guid inviteId, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        if (await db.RegistrationInvites.FindAsync([inviteId], cancellationToken) is not { } invite)
        {
            return TypedResults.NotFound();
        }

        // Revoking twice keeps the first time.
        invite.RevokedAt ??= time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Ok<List<UserSummaryResponse>>> ListUsers(AppDbContext db, CancellationToken cancellationToken)
    {
        var users = await db.Users
            .OrderBy(u => u.DisplayName)
            .ThenBy(u => u.Email)
            .Select(u => new UserSummaryResponse(
                u.Id,
                u.DisplayName,
                u.Email!,
                u.PasswordHash != null,
                db.UserLogins.Any(l => l.UserId == u.Id && l.LoginProvider == GoogleSignIn.Provider)))
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(users);
    }

    // There is no email service, so the admin sends the link personally. For a
    // Google-only user it sets their first password.
    private static async Task<Results<Ok<ResetLinkResponse>, NotFound>> CreateResetLink(
        Guid userId,
        UserManager<AppUser> users,
        IOptions<DataProtectionTokenProviderOptions> tokenOptions,
        TimeProvider time,
        HttpRequest request)
    {
        if (await users.FindByIdAsync(userId.ToString()) is not { } user)
        {
            return TypedResults.NotFound();
        }

        var token = await users.GeneratePasswordResetTokenAsync(user);
        var url = $"{request.Scheme}://{request.Host}/passwort-zuruecksetzen"
            + $"?benutzer={user.Id}&token={Uri.EscapeDataString(token)}";
        return TypedResults.Ok(new ResetLinkResponse(url, time.GetUtcNow() + tokenOptions.Value.TokenLifespan));
    }
}
