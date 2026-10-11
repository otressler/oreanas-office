using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Campaigns;

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

    public Campaign Campaign { get; set; } = null!;

    public AppUser Dm { get; set; } = null!;
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
