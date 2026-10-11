using Microsoft.AspNetCore.Http.HttpResults;
using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Accounts;

// Sign-in, registration and the own profile (knowledge/decisions/auth.md).
//
// Google flow: the frontend navigates (a full page load, not fetch) to
// /api/auth/google/login or /api/auth/google/link. The challenge goes to Google,
// which returns to GoogleCallbackPath; the Google handler then redirects to
// /api/auth/google/complete, which signs in, registers or links, and finally
// redirects to a frontend page, with `?fehler=<ApiErrorCode>` on failure.
public static class AuthEndpoints
{
    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var auth = app.MapGroup("/api/auth").WithTags("Auth");

        auth.MapGet("/options", GetOptions);
        auth.MapGet("/me", GetMe);
        auth.MapPut("/me", UpdateProfile).RequireAuthorization();
        auth.MapGet("/invites/{token}", GetInviteStatus);
        auth.MapPost("/register", Register);
        auth.MapPost("/login", Login);
        auth.MapPost("/logout", Logout);
        auth.MapPost("/password-reset", ResetPassword);

        auth.MapGet("/google/login", GoogleLogin);
        auth.MapGet("/google/link", GoogleLink).RequireAuthorization();
        auth.MapGet("/google/complete", GoogleComplete).ExcludeFromDescription();

        return app;
    }

    private static Ok<AuthOptionsResponse> GetOptions(AccountFeatures features) =>
        TypedResults.Ok(new AuthOptionsResponse(features.GoogleEnabled));

    // 401 when nobody is signed in; the frontend then shows the sign-in page.
    private static Task<Results<Ok<MeResponse>, UnauthorizedHttpResult>> GetMe() =>
        throw new NotImplementedException();

    private static Task<Results<Ok<MeResponse>, BadRequest<ApiError>>> UpdateProfile(UpdateProfileRequest request) =>
        throw new NotImplementedException();

    private static Task<Ok<InviteStatusResponse>> GetInviteStatus(string token) =>
        throw new NotImplementedException();

    // Creates a local account with a valid invite and signs it in.
    private static Task<Results<Ok<MeResponse>, BadRequest<ApiError>>> Register(RegisterRequest request) =>
        throw new NotImplementedException();

    private static Task<Results<Ok<MeResponse>, BadRequest<ApiError>>> Login(LoginRequest request) =>
        throw new NotImplementedException();

    private static Task<NoContent> Logout() =>
        throw new NotImplementedException();

    // Redeems an admin-created reset link; the link stops working once used.
    private static Task<Results<NoContent, BadRequest<ApiError>>> ResetPassword(ResetPasswordRequest request) =>
        throw new NotImplementedException();

    // `invite` is the registration token, needed only if this Google account has
    // no user yet. `returnUrl` must be a local path.
    private static Task<Results<ChallengeHttpResult, RedirectHttpResult>> GoogleLogin(string? returnUrl, string? invite) =>
        throw new NotImplementedException();

    private static Task<Results<ChallengeHttpResult, RedirectHttpResult>> GoogleLink(string? returnUrl) =>
        throw new NotImplementedException();

    private static Task<RedirectHttpResult> GoogleComplete() =>
        throw new NotImplementedException();
}
