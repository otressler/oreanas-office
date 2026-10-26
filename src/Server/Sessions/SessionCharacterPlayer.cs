using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Characters;

namespace OreanasOffice.Server.Sessions;

// knowledge/domain/session.md, "Who plays which character": the session DM hands a
// character to another member for this session only. Without a row, the character's owner
// plays it. Playing means what a player does with the character at the table; editing the
// character stays with its owner (knowledge/domain/character.md).
public class SessionCharacterPlayer
{
    public Guid SessionId { get; set; }

    public Guid CharacterId { get; set; }

    public Guid UserId { get; set; }

    public GameSession Session { get; set; } = null!;

    public Character Character { get; set; } = null!;

    public AppUser User { get; set; } = null!;
}

internal sealed class SessionCharacterPlayerConfiguration : IEntityTypeConfiguration<SessionCharacterPlayer>
{
    public void Configure(EntityTypeBuilder<SessionCharacterPlayer> player)
    {
        player.ToTable("SessionCharacterPlayers");
        player.HasKey(p => new { p.SessionId, p.CharacterId });
        player.HasOne(p => p.Session).WithMany(s => s.CharacterPlayers).HasForeignKey(p => p.SessionId).OnDelete(DeleteBehavior.Cascade);
        // Restrict, as for tokens: the campaign already cascades to both sessions and characters.
        player.HasOne(p => p.Character).WithMany(c => c.SessionPlayers).HasForeignKey(p => p.CharacterId).OnDelete(DeleteBehavior.Restrict);
        player.HasOne(p => p.User).WithMany().HasForeignKey(p => p.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}
