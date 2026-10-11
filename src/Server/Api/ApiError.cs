namespace OreanasOffice.Server.Api;

// Errors the frontend shows to people. The API returns only the code; the German
// text for each code lives in src/web/src/text/de.ts, so the server sends no
// interface text. `Field` names the request field the error belongs to, if any.
public record ApiError(ApiErrorCode Code, string? Field = null);

public enum ApiErrorCode
{
    // Registration and sign-in
    InviteInvalid,
    EmailInvalid,
    EmailTaken,
    PasswordTooShort,
    DisplayNameInvalid,
    InvalidCredentials,
    LockedOut,
    ResetLinkInvalid,

    // Google sign-in and linking. These reach the frontend as `?fehler=<code>`
    // after a redirect, not in a response body.
    GoogleFailed,
    GoogleNoInvite,
    GoogleEmailTaken,
    GoogleAccountInUse,
    GoogleAlreadyLinked,

    // Campaigns, characters and sessions
    NameInvalid,
    JoinCodeInvalid,
    SpeedInvalid,
    NotADm,
    AnotherSessionActive,
    SessionEnded,
}
