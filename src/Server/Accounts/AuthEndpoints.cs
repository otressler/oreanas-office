using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;

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
    // Kept in the authentication properties, which travel to Google and back
    // encrypted in the state parameter and then in the external cookie.
    private const string ModeKey = "oreana:mode";
    private const string ReturnUrlKey = "oreana:returnUrl";
    private const string InviteKey = "oreana:invite";
    private const string UserIdKey = "oreana:userId";
    private const string LoginMode = "login";
    private const string LinkMode = "link";

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
    private static async Task<Results<Ok<MeResponse>, UnauthorizedHttpResult>> GetMe(
        ClaimsPrincipal principal, UserManager<AppUser> users)
    {
        if (await users.GetUserAsync(principal) is not { } user)
        {
            return TypedResults.Unauthorized();
        }

        return TypedResults.Ok(await MeAsync(users, user));
    }

    private static async Task<Results<Ok<MeResponse>, BadRequest<ApiError>>> UpdateProfile(
        UpdateProfileRequest request, ClaimsPrincipal principal, UserManager<AppUser> users)
    {
        if (AccountInput.DisplayName(request.DisplayName) is not { } displayName)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.DisplayNameInvalid, "displayName"));
        }

        var user = await users.GetUserAsync(principal)
            ?? throw new InvalidOperationException("The signed-in user doesn't exist.");
        user.DisplayName = displayName;
        var result = await users.UpdateAsync(user);
        if (!result.Succeeded)
        {
            throw new InvalidOperationException(
                $"Updating the profile failed: {string.Join(", ", result.Errors.Select(e => e.Code))}");
        }

        return TypedResults.Ok(await MeAsync(users, user));
    }

    private static async Task<Ok<InviteStatusResponse>> GetInviteStatus(
        string token, Invites invites, CancellationToken cancellationToken)
    {
        var invite = await invites.FindUsableAsync(token, cancellationToken);
        return TypedResults.Ok(new InviteStatusResponse(invite is not null, invite?.ExpiresAt));
    }

    // Creates a local account with a valid invite and signs it in.
    private static async Task<Results<Ok<MeResponse>, BadRequest<ApiError>>> Register(
        RegisterRequest request,
        Invites invites,
        UserManager<AppUser> users,
        SignInManager<AppUser> signIn,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        if (await invites.FindUsableAsync(request.InviteToken, cancellationToken) is null)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.InviteInvalid));
        }

        if (AccountInput.DisplayName(request.DisplayName) is not { } displayName)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.DisplayNameInvalid, "displayName"));
        }

        if (AccountInput.Email(request.Email) is not { } email)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.EmailInvalid, "email"));
        }

        if (await users.FindByEmailAsync(email) is not null)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.EmailTaken, "email"));
        }

        if (!AccountInput.IsPasswordLongEnough(request.Password))
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.PasswordTooShort, "password"));
        }

        // Never admin, even with the configured admin address: only Google's
        // verified address grants that (GoogleSignIn).
        var user = new AppUser
        {
            DisplayName = displayName,
            Email = email,
            UserName = email,
            CreatedAt = time.GetUtcNow(),
        };

        var result = await users.CreateAsync(user, request.Password);
        if (!result.Succeeded)
        {
            // The checks above cover these, except for a parallel registration
            // with the same address.
            var codes = result.Errors.Select(e => e.Code).ToList();
            return TypedResults.BadRequest(
                codes.Contains(nameof(IdentityErrorDescriber.DuplicateEmail))
                || codes.Contains(nameof(IdentityErrorDescriber.DuplicateUserName))
                    ? new ApiError(ApiErrorCode.EmailTaken, "email")
                    : codes.Contains(nameof(IdentityErrorDescriber.PasswordTooShort))
                        ? new ApiError(ApiErrorCode.PasswordTooShort, "password")
                        : new ApiError(ApiErrorCode.EmailInvalid, "email"));
        }

        await signIn.SignInAsync(user, isPersistent: true);
        return TypedResults.Ok(await MeAsync(users, user));
    }

    private static async Task<Results<Ok<MeResponse>, BadRequest<ApiError>>> Login(
        LoginRequest request, UserManager<AppUser> users, SignInManager<AppUser> signIn)
    {
        // A Google-only account has no password to check, and a failed attempt
        // against it shouldn't count towards a lockout.
        if (AccountInput.Email(request.Email) is not { } email
            || await users.FindByEmailAsync(email) is not { } user
            || !await users.HasPasswordAsync(user))
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.InvalidCredentials));
        }

        var result = await signIn.PasswordSignInAsync(user, request.Password, isPersistent: true, lockoutOnFailure: true);
        if (result.IsLockedOut)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.LockedOut));
        }

        if (!result.Succeeded)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.InvalidCredentials));
        }

        return TypedResults.Ok(await MeAsync(users, user));
    }

    private static async Task<NoContent> Logout(SignInManager<AppUser> signIn)
    {
        await signIn.SignOutAsync();
        return TypedResults.NoContent();
    }

    // Redeems an admin-created reset link; the link stops working once used.
    private static async Task<Results<NoContent, BadRequest<ApiError>>> ResetPassword(
        ResetPasswordRequest request, UserManager<AppUser> users)
    {
        // The token is checked before the password, so nobody fixes their
        // password only to learn the link was dead all along.
        if (await users.FindByIdAsync(request.UserId.ToString()) is not { } user
            || string.IsNullOrEmpty(request.Token)
            || !await users.VerifyUserTokenAsync(
                user,
                users.Options.Tokens.PasswordResetTokenProvider,
                UserManager<AppUser>.ResetPasswordTokenPurpose,
                request.Token))
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.ResetLinkInvalid));
        }

        if (!AccountInput.IsPasswordLongEnough(request.NewPassword))
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.PasswordTooShort, "newPassword"));
        }

        // Also sets the first password of a Google-only account. It changes the
        // security stamp, which makes this token (and any older one) invalid.
        var result = await users.ResetPasswordAsync(user, request.Token, request.NewPassword);
        if (!result.Succeeded)
        {
            return TypedResults.BadRequest(
                result.Errors.Any(e => e.Code == nameof(IdentityErrorDescriber.PasswordTooShort))
                    ? new ApiError(ApiErrorCode.PasswordTooShort, "newPassword")
                    : new ApiError(ApiErrorCode.ResetLinkInvalid));
        }

        // Someone locked out by guessing at their forgotten password can sign in
        // with the new one at once.
        await users.SetLockoutEndDateAsync(user, null);
        await users.ResetAccessFailedCountAsync(user);
        return TypedResults.NoContent();
    }

    // `invite` is the registration token, needed only if this Google account has
    // no user yet. `returnUrl` must be a local path.
    private static Results<ChallengeHttpResult, RedirectHttpResult> GoogleLogin(
        string? returnUrl, string? invite, AccountFeatures features, SignInManager<AppUser> signIn)
    {
        if (!features.GoogleEnabled)
        {
            return GoogleUnavailable();
        }

        var properties = signIn.ConfigureExternalAuthenticationProperties(GoogleSignIn.Provider, AccountExtensions.GoogleCompletePath);
        properties.Items[ModeKey] = LoginMode;
        properties.Items[ReturnUrlKey] = AccountInput.LocalPathOr(returnUrl, "/");
        if (!string.IsNullOrEmpty(invite))
        {
            properties.Items[InviteKey] = invite;
        }

        return TypedResults.Challenge(properties, [GoogleSignIn.Provider]);
    }

    private static Results<ChallengeHttpResult, RedirectHttpResult> GoogleLink(
        string? returnUrl, ClaimsPrincipal principal, AccountFeatures features, SignInManager<AppUser> signIn)
    {
        if (!features.GoogleEnabled)
        {
            return GoogleUnavailable();
        }

        // The user id comes back with Google's answer, so the link is added only
        // to the account that started it, not to whoever is signed in by then.
        var userId = principal.GetUserId().ToString();
        var properties = signIn.ConfigureExternalAuthenticationProperties(
            GoogleSignIn.Provider, AccountExtensions.GoogleCompletePath, userId);
        properties.Items[ModeKey] = LinkMode;
        properties.Items[ReturnUrlKey] = AccountInput.LocalPathOr(returnUrl, "/profil");
        properties.Items[UserIdKey] = userId;

        return TypedResults.Challenge(properties, [GoogleSignIn.Provider]);
    }

    private static async Task<RedirectHttpResult> GoogleComplete(
        HttpContext http, SignInManager<AppUser> signIn, GoogleSignIn google)
    {
        try
        {
            var info = await signIn.GetExternalLoginInfoAsync();
            if (info?.LoginProvider != GoogleSignIn.Provider || info.AuthenticationProperties is null)
            {
                return ErrorRedirect("/anmelden", ApiErrorCode.GoogleFailed);
            }

            var properties = info.AuthenticationProperties;
            var account = new GoogleAccount(
                info.ProviderKey,
                info.Principal.FindFirstValue(ClaimTypes.Email),
                info.Principal.HasClaim(GoogleClaims.EmailVerified, "true"),
                info.Principal.FindFirstValue(ClaimTypes.GivenName),
                info.Principal.FindFirstValue(ClaimTypes.Name));
            var returnUrl = properties.GetString(ReturnUrlKey);

            return properties.GetString(ModeKey) == LinkMode
                ? await CompleteLinkAsync(http, signIn, google, account, properties.GetString(UserIdKey), returnUrl)
                : await CompleteLoginAsync(signIn, google, info, account, properties.GetString(InviteKey), returnUrl);
        }
        finally
        {
            // The external cookie only carries Google's answer to this endpoint.
            await http.SignOutAsync(IdentityConstants.ExternalScheme);
        }
    }

    private static async Task<RedirectHttpResult> CompleteLoginAsync(
        SignInManager<AppUser> signIn,
        GoogleSignIn google,
        ExternalLoginInfo info,
        GoogleAccount account,
        string? invite,
        string? returnUrl)
    {
        var outcome = await google.LoginAsync(account, invite);
        if (outcome.Error is { } error)
        {
            // A dead invite goes back to its page, which asks for a new link.
            return error == ApiErrorCode.InviteInvalid && !string.IsNullOrEmpty(invite)
                ? ErrorRedirect($"/einladung/{Uri.EscapeDataString(invite)}", error)
                : ErrorRedirect("/anmelden", error);
        }

        // Also refuses a user locked out by failed password attempts.
        var result = await signIn.ExternalLoginSignInAsync(
            info.LoginProvider, info.ProviderKey, isPersistent: true, bypassTwoFactor: true);
        if (!result.Succeeded)
        {
            return ErrorRedirect("/anmelden", result.IsLockedOut ? ApiErrorCode.LockedOut : ApiErrorCode.GoogleFailed);
        }

        return TypedResults.Redirect(AccountInput.LocalPathOr(returnUrl, "/"));
    }

    private static async Task<RedirectHttpResult> CompleteLinkAsync(
        HttpContext http,
        SignInManager<AppUser> signIn,
        GoogleSignIn google,
        GoogleAccount account,
        string? startedByUserId,
        string? returnUrl)
    {
        if (http.User.GetUserIdOrNull() is not { } userId || startedByUserId != userId.ToString())
        {
            return ErrorRedirect("/profil", ApiErrorCode.GoogleFailed);
        }

        var outcome = await google.LinkAsync(account, userId);
        if (outcome.Error is { } error)
        {
            return ErrorRedirect("/profil", error);
        }

        // A fresh cookie, so a newly granted admin flag applies at once.
        await signIn.RefreshSignInAsync(outcome.User!);
        return TypedResults.Redirect(AccountInput.LocalPathOr(returnUrl, "/profil"));
    }

    private static RedirectHttpResult GoogleUnavailable() => ErrorRedirect("/anmelden", ApiErrorCode.GoogleFailed);

    private static RedirectHttpResult ErrorRedirect(string path, ApiErrorCode error) =>
        TypedResults.Redirect($"{path}?fehler={AccountInput.QueryValue(error)}");

    private static async Task<MeResponse> MeAsync(UserManager<AppUser> users, AppUser user)
    {
        var logins = await users.GetLoginsAsync(user);
        return new MeResponse(
            user.Id,
            user.DisplayName,
            user.Email!,
            user.IsAdmin,
            user.PasswordHash is not null,
            logins.Any(l => l.LoginProvider == GoogleSignIn.Provider));
    }
}
