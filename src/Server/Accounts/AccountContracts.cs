namespace OreanasOffice.Server.Accounts;

// Request and response types for /api/auth and /api/admin. The frontend's types
// are generated from these (npm run gen:api).

public record AuthOptionsResponse(bool GoogleEnabled);

public record MeResponse(Guid Id, string DisplayName, string Email, bool IsAdmin, bool HasPassword, bool HasGoogle);

public record InviteStatusResponse(bool Valid, DateTimeOffset? ExpiresAt);

public record RegisterRequest(string InviteToken, string DisplayName, string Email, string Password);

public record LoginRequest(string Email, string Password);

public record UpdateProfileRequest(string DisplayName);

public record ResetPasswordRequest(Guid UserId, string Token, string NewPassword);

public record InviteResponse(Guid Id, DateTimeOffset CreatedAt, DateTimeOffset ExpiresAt);

// The only time the link (and so the token) is shown; only its hash is stored.
public record CreatedInviteResponse(Guid Id, string Url, DateTimeOffset ExpiresAt);

public record UserSummaryResponse(Guid Id, string DisplayName, string Email, bool HasPassword, bool HasGoogle);

public record ResetLinkResponse(string Url, DateTimeOffset ExpiresAt);
