using Microsoft.AspNetCore.Identity;

namespace OreanasOffice.Server.Accounts;

// knowledge/domain/user.md. Password hash, Google login and lockout come from
// ASP.NET Core Identity. UserName is the email address.
public class AppUser : IdentityUser<Guid>
{
    public const int DisplayNameMaxLength = 40;

    public required string DisplayName { get; set; }

    // Site admin: granted only when the configured Admin:Email signs in through
    // Google (knowledge/decisions/auth.md). Never set by a local registration.
    public bool IsAdmin { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
