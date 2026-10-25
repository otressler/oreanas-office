using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Sessions;

// knowledge/domain/session.md: one game night. Called GameSession in code so it
// isn't mistaken for an HTTP or sign-in session.
public class GameSession
{
    public const int TitleMaxLength = 100;

    public Guid Id { get; set; }

    public Guid CampaignId { get; set; }

    public required string Title { get; set; }

    public DateOnly Date { get; set; }

    public Guid DmUserId { get; set; }

    public Guid CreatedByUserId { get; set; }

    public SessionStatus Status { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    // The fight that was running when the session ended; continuing the session brings it
    // back (knowledge/domain/session.md, "Continuing"). No foreign key, like
    // Encounter.BackgroundAssetId: sessions and encounters already point at each other.
    public Guid? InterruptedEncounterId { get; set; }

    // knowledge/features/shared-table.md, "The play mode": set by the session DM.
    public PlayMode PlayMode { get; set; }

    public Campaign Campaign { get; set; } = null!;

    public AppUser Dm { get; set; } = null!;

    public List<Encounter> Encounters { get; } = [];

    // Characters someone other than their owner plays in this session.
    public List<SessionCharacterPlayer> CharacterPlayers { get; } = [];
}

// Byod: everyone plays on their own device. Local: any member may also open a shared screen
// that moves every character.
public enum PlayMode
{
    Byod,
    Local,
}

public enum SessionStatus
{
    Planned,
    Active,
    Ended,
}

internal sealed class GameSessionConfiguration : IEntityTypeConfiguration<GameSession>
{
    public void Configure(EntityTypeBuilder<GameSession> session)
    {
        session.ToTable("Sessions");
        session.Property(s => s.Title).HasMaxLength(GameSession.TitleMaxLength);
        session.HasOne(s => s.Campaign).WithMany(c => c.Sessions).HasForeignKey(s => s.CampaignId).OnDelete(DeleteBehavior.Cascade);
        session.HasOne(s => s.Dm).WithMany().HasForeignKey(s => s.DmUserId).OnDelete(DeleteBehavior.Restrict);
        session.HasOne<AppUser>().WithMany().HasForeignKey(s => s.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);

        // At most one active session per campaign, enforced by the database, so two
        // DMs pressing "start" at once can't both win.
        session.HasIndex(s => s.CampaignId)
            .IsUnique()
            .HasFilter($"[{nameof(GameSession.Status)}] = N'{nameof(SessionStatus.Active)}'")
            .HasDatabaseName("IX_Sessions_CampaignId_Active");
        session.HasIndex(s => new { s.CampaignId, s.Date });
    }
}
