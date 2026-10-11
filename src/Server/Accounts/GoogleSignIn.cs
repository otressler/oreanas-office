using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Accounts;

// What Google told us about the person who just signed in there.
public sealed record GoogleAccount(string ProviderKey, string? Email, bool EmailVerified, string? GivenName, string? Name);

// The user to sign in, or why not.
public sealed record GoogleSignInOutcome(AppUser? User, ApiErrorCode? Error)
{
    public static GoogleSignInOutcome Success(AppUser user) => new(user, null);

    public static GoogleSignInOutcome Failure(ApiErrorCode error) => new(null, error);
}

// The decisions after a Google sign-in (knowledge/decisions/auth.md), kept apart
// from the HTTP flow so tests can run them without Google. It changes the
// database but signs nobody in; the endpoint does that.
public sealed class GoogleSignIn(UserManager<AppUser> users, Invites invites, TimeProvider time, IOptions<AdminOptions> admin)
{
    public const string Provider = GoogleDefaults.AuthenticationScheme;

    // Signs in an existing account, or creates one with a usable invite. The admin
    // address needs no invite for its first sign-in, or nobody could make one.
    public async Task<GoogleSignInOutcome> LoginAsync(GoogleAccount account, string? inviteToken)
    {
        if (await users.FindByLoginAsync(Provider, account.ProviderKey) is { } linked)
        {
            await GrantAdminIfOwnerAsync(linked, account);
            return GoogleSignInOutcome.Success(linked);
        }

        if (string.IsNullOrEmpty(account.Email))
        {
            return GoogleSignInOutcome.Failure(ApiErrorCode.GoogleFailed);
        }

        // Accounts are never merged by email address: someone with a local
        // account signs in with it and links Google from the profile.
        if (await users.FindByEmailAsync(account.Email) is not null)
        {
            return GoogleSignInOutcome.Failure(ApiErrorCode.GoogleEmailTaken);
        }

        var isOwner = IsOwner(account);
        if (!isOwner && await invites.FindUsableAsync(inviteToken) is null)
        {
            return GoogleSignInOutcome.Failure(
                string.IsNullOrEmpty(inviteToken) ? ApiErrorCode.GoogleNoInvite : ApiErrorCode.InviteInvalid);
        }

        var user = new AppUser
        {
            DisplayName = DisplayNameFor(account),
            Email = account.Email,
            UserName = account.Email,
            IsAdmin = isOwner,
            CreatedAt = time.GetUtcNow(),
        };

        if (!(await users.CreateAsync(user)).Succeeded)
        {
            return GoogleSignInOutcome.Failure(ApiErrorCode.GoogleFailed);
        }

        // Fails only if a parallel sign-in linked this Google account meanwhile;
        // then the account just created would be one nobody can sign in to.
        if (!(await users.AddLoginAsync(user, LoginInfo(account))).Succeeded)
        {
            await users.DeleteAsync(user);
            return GoogleSignInOutcome.Failure(ApiErrorCode.GoogleFailed);
        }

        return GoogleSignInOutcome.Success(user);
    }

    // Connects Google to the signed-in user's account.
    public async Task<GoogleSignInOutcome> LinkAsync(GoogleAccount account, Guid userId)
    {
        if (await users.FindByIdAsync(userId.ToString()) is not { } user)
        {
            return GoogleSignInOutcome.Failure(ApiErrorCode.GoogleFailed);
        }

        if (await users.FindByLoginAsync(Provider, account.ProviderKey) is { } owner && owner.Id != user.Id)
        {
            return GoogleSignInOutcome.Failure(ApiErrorCode.GoogleAccountInUse);
        }

        if ((await users.GetLoginsAsync(user)).Any(l => l.LoginProvider == Provider))
        {
            return GoogleSignInOutcome.Failure(ApiErrorCode.GoogleAlreadyLinked);
        }

        if (!(await users.AddLoginAsync(user, LoginInfo(account))).Succeeded)
        {
            return GoogleSignInOutcome.Failure(ApiErrorCode.GoogleAccountInUse);
        }

        await GrantAdminIfOwnerAsync(user, account);
        return GoogleSignInOutcome.Success(user);
    }

    // Only Google's verified address counts: anyone can register a local account
    // with any address, and that must never make them admin.
    private bool IsOwner(GoogleAccount account) =>
        account.EmailVerified
        && !string.IsNullOrWhiteSpace(admin.Value.Email)
        && string.Equals(account.Email?.Trim(), admin.Value.Email.Trim(), StringComparison.OrdinalIgnoreCase);

    private async Task GrantAdminIfOwnerAsync(AppUser user, GoogleAccount account)
    {
        if (!user.IsAdmin && IsOwner(account))
        {
            user.IsAdmin = true;
            await users.UpdateAsync(user);
        }
    }

    private static UserLoginInfo LoginInfo(GoogleAccount account) => new(Provider, account.ProviderKey, Provider);

    private static string DisplayNameFor(GoogleAccount account)
    {
        var name = new[] { account.GivenName, account.Name, account.Email?.Split('@')[0] }
            .Select(n => n?.Trim())
            .FirstOrDefault(n => !string.IsNullOrEmpty(n)) ?? Provider;
        return name.Length > AppUser.DisplayNameMaxLength ? name[..AppUser.DisplayNameMaxLength].TrimEnd() : name;
    }
}
