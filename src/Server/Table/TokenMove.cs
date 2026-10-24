using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Table;

// knowledge/domain/token.md, "Move history": one confirmed move. Undo puts the token
// back to From and sets UndoneAt. A user can undo their latest move in the encounter
// while it isn't undone and Version still equals the token's Version (nobody moved the
// token since).
public class TokenMove
{
    // Increasing, so "latest" is the highest id.
    public long Id { get; set; }

    // Same as the token's; kept here so "the user's last move in this encounter" is
    // one index lookup. No foreign key: the token already links to the encounter, and
    // SQL Server allows only one cascade path.
    public Guid EncounterId { get; set; }

    public Guid TokenId { get; set; }

    public Guid ByUserId { get; set; }

    public int FromX { get; set; }

    public int FromY { get; set; }

    public decimal FromElevation { get; set; }

    public int ToX { get; set; }

    public int ToY { get; set; }

    public decimal ToElevation { get; set; }

    // The token's Version right after this move.
    public int Version { get; set; }

    public DateTimeOffset At { get; set; }

    public DateTimeOffset? UndoneAt { get; set; }

    // Made from a shared screen in local mode; decides whose undo it is
    // (knowledge/features/shared-table.md, "Who did it").
    public bool FromSharedScreen { get; set; }

    public Token Token { get; set; } = null!;
}

internal sealed class TokenMoveConfiguration : IEntityTypeConfiguration<TokenMove>
{
    public void Configure(EntityTypeBuilder<TokenMove> move)
    {
        move.Property(m => m.FromElevation).HasPrecision(6, 1);
        move.Property(m => m.ToElevation).HasPrecision(6, 1);
        move.HasOne(m => m.Token).WithMany().HasForeignKey(m => m.TokenId).OnDelete(DeleteBehavior.Cascade);
        move.HasOne<AppUser>().WithMany().HasForeignKey(m => m.ByUserId).OnDelete(DeleteBehavior.Restrict);
        move.HasIndex(m => new { m.EncounterId, m.ByUserId, m.Id });
        move.HasIndex(m => new { m.TokenId, m.Id });
    }
}
