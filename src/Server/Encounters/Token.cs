using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Bestiary;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Encounters;

// knowledge/domain/token.md: a character or creature on an encounter's board. X and
// Y are the top-left cell of the footprint; size comes from the character or
// creature type. Character tokens take their label from the character's name, so
// Label is only stored for creatures ("Goblin 3").
public class Token
{
    public const int LabelMaxLength = 40;

    public Guid Id { get; set; }

    public Guid EncounterId { get; set; }

    public TokenKind Kind { get; set; }

    public Guid? CharacterId { get; set; }

    public Guid? CreatureTypeId { get; set; }

    public string? Label { get; set; }

    // Copied from the character or creature type when the token is created; later changes
    // to the type don't touch it.
    public CreatureSize Size { get; set; }

    public int X { get; set; }

    public int Y { get; set; }

    // Meters, one decimal. The highest elevation under the footprint when placed.
    public decimal Elevation { get; set; }

    // Later: visible only to the session DM until revealed.
    public bool Hidden { get; set; }

    // Counts moves and undos, starting at 0 when placed. Devices keep the position with
    // the higher version; saving a move requires the version it read (last move wins,
    // but two moves never interleave). See knowledge/decisions/realtime-sync.md.
    public int Version { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Encounter Encounter { get; set; } = null!;

    public Character? Character { get; set; }

    public CreatureType? CreatureType { get; set; }
}

public enum TokenKind
{
    Character,
    Creature,
}

internal sealed class TokenConfiguration : IEntityTypeConfiguration<Token>
{
    public void Configure(EntityTypeBuilder<Token> token)
    {
        token.Property(t => t.Label).HasMaxLength(Token.LabelMaxLength);
        token.Property(t => t.Elevation).HasPrecision(6, 1);
        token.Property(t => t.Version).IsConcurrencyToken();
        token.HasOne(t => t.Encounter).WithMany(e => e.Tokens).HasForeignKey(t => t.EncounterId).OnDelete(DeleteBehavior.Cascade);

        // Characters and creature types are deleted with their campaign, which already
        // deletes the encounter and its tokens; one cascade path is all SQL Server allows.
        token.HasOne(t => t.Character).WithMany().HasForeignKey(t => t.CharacterId).OnDelete(DeleteBehavior.Restrict);
        token.HasOne(t => t.CreatureType).WithMany().HasForeignKey(t => t.CreatureTypeId).OnDelete(DeleteBehavior.Restrict);

        // A character stands on the board at most once per encounter.
        token.HasIndex(t => new { t.EncounterId, t.CharacterId })
            .IsUnique()
            .HasFilter($"[{nameof(Token.CharacterId)}] IS NOT NULL");

        token.ToTable(t => t.HasCheckConstraint(
            "CK_Tokens_Kind",
            $"([{nameof(Token.Kind)}] = N'{nameof(TokenKind.Character)}' AND [{nameof(Token.CharacterId)}] IS NOT NULL AND [{nameof(Token.CreatureTypeId)}] IS NULL)"
            + $" OR ([{nameof(Token.Kind)}] = N'{nameof(TokenKind.Creature)}' AND [{nameof(Token.CreatureTypeId)}] IS NOT NULL AND [{nameof(Token.CharacterId)}] IS NULL)"));
    }
}
