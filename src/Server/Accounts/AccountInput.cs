using System.Net.Mail;
using System.Text.Json;
using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Accounts;

// Checks and cleans what people type into account forms, and the return paths
// the Google flow redirects to.
public static class AccountInput
{
    // knowledge/decisions/auth.md: at least 8 characters, nothing else.
    public const int PasswordMinLength = 8;

    // Identity's column for email addresses and user names.
    private const int EmailMaxLength = 256;

    // Trimmed, or null when it's empty or too long.
    public static string? DisplayName(string? input)
    {
        var name = input?.Trim();
        return name is { Length: > 0 and <= AppUser.DisplayNameMaxLength } ? name : null;
    }

    // Trimmed, or null when it isn't a plain address. MailAddress also accepts
    // forms like "Name <a@b.de>", which aren't something to sign in with.
    public static string? Email(string? input)
    {
        var email = input?.Trim();
        return email is { Length: > 0 and <= EmailMaxLength }
            && MailAddress.TryCreate(email, out var parsed)
            && parsed.Address == email
                ? email
                : null;
    }

    public static bool IsPasswordLongEnough(string? password) => password?.Length >= PasswordMinLength;

    // Only paths on this site, so a crafted link can't send someone elsewhere after
    // signing in. "//host" and "/\host" are treated by browsers as other sites, and
    // browsers drop tabs and line breaks from URLs, which could turn "/\t/host" into
    // "//host".
    public static string LocalPathOr(string? url, string fallback) =>
        url is { Length: > 0 }
        && url[0] == '/'
        && (url.Length == 1 || (url[1] != '/' && url[1] != '\\'))
        && !url.Any(char.IsControl)
            ? url
            : fallback;

    // How error codes appear in `?fehler=`: camelCase, like in JSON bodies.
    public static string QueryValue(ApiErrorCode code) => JsonNamingPolicy.CamelCase.ConvertName(code.ToString());
}
