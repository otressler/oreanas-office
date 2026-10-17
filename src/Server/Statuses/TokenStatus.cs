using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Statuses;

// knowledge/domain/status.md, "Token status": a status put on a token in its encounter.
// Saved before it's broadcast, so a reload or a cold start keeps it.
public class TokenStatus
{
    public Guid TokenId { get; set; }

    public Guid StatusId { get; set; }

    // 1 to StatusDefinition.MaxLevel for statuses with levels, else null.
    public int? Level { get; set; }

    // Shown on the token card ("von Eli"); a player may remove only the ones they put on.
    public Guid AppliedByUserId { get; set; }

    // Put on from a shared screen; shown as "Tisch" and removable only from a shared screen.
    public bool FromSharedScreen { get; set; }

    public DateTimeOffset AppliedAt { get; set; }

    public Token Token { get; set; } = null!;

    public StatusDefinition Status { get; set; } = null!;
}

internal sealed class TokenStatusConfiguration : IEntityTypeConfiguration<TokenStatus>
{
    public void Configure(EntityTypeBuilder<TokenStatus> status)
    {
        status.HasKey(s => new { s.TokenId, s.StatusId });
        status.HasOne(s => s.Token).WithMany(t => t.Statuses).HasForeignKey(s => s.TokenId).OnDelete(DeleteBehavior.Cascade);
        status.HasOne(s => s.Status).WithMany().HasForeignKey(s => s.StatusId).OnDelete(DeleteBehavior.Restrict);
        status.HasOne<AppUser>().WithMany().HasForeignKey(s => s.AppliedByUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
