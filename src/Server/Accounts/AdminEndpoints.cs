using Microsoft.AspNetCore.Http.HttpResults;
using OreanasOffice.Server.Authorization;

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
    private static Task<Ok<List<InviteResponse>>> ListInvites() =>
        throw new NotImplementedException();

    private static Task<Ok<CreatedInviteResponse>> CreateInvite() =>
        throw new NotImplementedException();

    private static Task<Results<NoContent, NotFound>> RevokeInvite(Guid inviteId) =>
        throw new NotImplementedException();

    private static Task<Ok<List<UserSummaryResponse>>> ListUsers() =>
        throw new NotImplementedException();

    private static Task<Results<Ok<ResetLinkResponse>, NotFound>> CreateResetLink(Guid userId) =>
        throw new NotImplementedException();
}
