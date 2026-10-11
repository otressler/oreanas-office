using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace OreanasOffice.Server.Accounts;

// knowledge/domain/registration-invite.md: a link from the site admin that lets
// any number of people create an account for four hours.
public class RegistrationInvite
{
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(4);

    public Guid Id { get; set; }

    // SHA-256 of the token in the link, as lowercase hex. The token itself is
    // never stored.
    public required string TokenHash { get; set; }

    public Guid CreatedByUserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset ExpiresAt { get; set; }

    public DateTimeOffset? RevokedAt { get; set; }

    public bool IsUsableAt(DateTimeOffset now) => RevokedAt is null && now < ExpiresAt;
}

internal sealed class RegistrationInviteConfiguration : IEntityTypeConfiguration<RegistrationInvite>
{
    public void Configure(EntityTypeBuilder<RegistrationInvite> invite)
    {
        invite.Property(i => i.TokenHash).HasMaxLength(64).IsFixedLength();
        invite.HasIndex(i => i.TokenHash).IsUnique();
        invite.HasOne<AppUser>().WithMany().HasForeignKey(i => i.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
