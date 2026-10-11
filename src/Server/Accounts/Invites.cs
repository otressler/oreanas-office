using System.Buffers.Text;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Accounts;

// Creates registration invites and checks the tokens people bring back
// (knowledge/domain/registration-invite.md).
public sealed class Invites(AppDbContext db, TimeProvider time)
{
    public async Task<CreatedInviteResponse> CreateAsync(Guid createdByUserId, HttpRequest request)
    {
        // 32 random bytes are unguessable; only the hash is stored, so a leaked
        // database doesn't hand out working links.
        var token = Base64Url.EncodeToString(RandomNumberGenerator.GetBytes(32));
        var now = time.GetUtcNow();
        var invite = new RegistrationInvite
        {
            TokenHash = Hash(token),
            CreatedByUserId = createdByUserId,
            CreatedAt = now,
            ExpiresAt = now + RegistrationInvite.Lifetime,
        };

        db.RegistrationInvites.Add(invite);
        await db.SaveChangesAsync(request.HttpContext.RequestAborted);

        return new CreatedInviteResponse(
            invite.Id, $"{request.Scheme}://{request.Host}/einladung/{token}", invite.ExpiresAt);
    }

    // The invite behind a token, if it can still be used right now.
    public async Task<RegistrationInvite?> FindUsableAsync(string? token, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrEmpty(token))
        {
            return null;
        }

        var hash = Hash(token);
        var invite = await db.RegistrationInvites.SingleOrDefaultAsync(i => i.TokenHash == hash, cancellationToken);
        return invite is not null && invite.IsUsableAt(time.GetUtcNow()) ? invite : null;
    }

    public static string Hash(string token) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
