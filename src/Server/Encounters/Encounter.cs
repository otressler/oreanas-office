using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Encounters;

// knowledge/domain/encounter.md: one fight on a battle map, prepared at campaign
// level and linked to a session when the session DM starts it. The active encounter
// of a session isn't a column: it is the encounter with status Active, and a filtered
// unique index allows at most one per session.
public class Encounter
{
    public const int NameMaxLength = BattleMap.NameMaxLength;

    public Guid Id { get; set; }

    public Guid CampaignId { get; set; }

    public Guid BattleMapId { get; set; }

    // Set when the encounter is started.
    public Guid? SessionId { get; set; }

    public required string Name { get; set; }

    public EncounterStatus Status { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? StartedAt { get; set; }

    public DateTimeOffset? EndedAt { get; set; }

    public Campaign Campaign { get; set; } = null!;

    public BattleMap BattleMap { get; set; } = null!;

    public GameSession? Session { get; set; }

    public List<Token> Tokens { get; } = [];
}

// Draft: built in the editor (stage 5). Ready: complete, can be started; imports
// land here. Active: running in a session. Ended: read-only.
public enum EncounterStatus
{
    Draft,
    Ready,
    Active,
    Ended,
}

internal sealed class EncounterConfiguration : IEntityTypeConfiguration<Encounter>
{
    public void Configure(EntityTypeBuilder<Encounter> encounter)
    {
        encounter.Property(e => e.Name).HasMaxLength(Encounter.NameMaxLength);
        encounter.HasOne(e => e.Campaign).WithMany().HasForeignKey(e => e.CampaignId).OnDelete(DeleteBehavior.Cascade);

        // SQL Server allows one cascade path per row: the campaign already deletes its
        // maps, sessions and encounters, so these two links don't cascade.
        encounter.HasOne(e => e.BattleMap).WithMany().HasForeignKey(e => e.BattleMapId).OnDelete(DeleteBehavior.Restrict);
        encounter.HasOne(e => e.Session).WithMany(s => s.Encounters).HasForeignKey(e => e.SessionId).OnDelete(DeleteBehavior.Restrict);

        // At most one active encounter per session, enforced by the database.
        encounter.HasIndex(e => e.SessionId)
            .IsUnique()
            .HasFilter($"[{nameof(Encounter.Status)}] = N'{nameof(EncounterStatus.Active)}'")
            .HasDatabaseName("IX_Encounters_SessionId_Active");
        encounter.HasIndex(e => new { e.CampaignId, e.Status });
    }
}
