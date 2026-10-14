using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
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

    // Sync (knowledge/decisions/offline-prep-pwa.md, "Versions and IDs"): 1 when created,
    // raised by 1 on every accepted change; a concurrency token.
    public int Version { get; set; } = 1;

    // Archived items stay listed for sync but aren't offered for picking.
    public DateTimeOffset? ArchivedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public Guid? UpdatedByUserId { get; set; }

    // The battle map as it was when the encounter started; the live fight and the ended
    // encounter use it, so later map edits don't change them.
    public EncounterMapCopy? MapCopy { get; set; }

    // The map's picked background when the encounter started, saved with MapCopy; null when
    // the map had none that fits its size (knowledge/domain/encounter.md). No foreign key,
    // like BattleMap.BackgroundAssetId.
    public Guid? BackgroundAssetId { get; set; }

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
    // The same JSON as BattleMap.Layout.
    private static readonly JsonSerializerOptions LayoutJson = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public void Configure(EntityTypeBuilder<Encounter> encounter)
    {
        encounter.Property(e => e.Name).HasMaxLength(Encounter.NameMaxLength);
        encounter.Property(e => e.Version).IsConcurrencyToken();
        encounter.HasOne<AppUser>().WithMany().HasForeignKey(e => e.UpdatedByUserId).OnDelete(DeleteBehavior.Restrict);
        encounter.Property(e => e.MapCopy)
            .HasConversion(
                copy => JsonSerializer.Serialize(copy, LayoutJson),
                json => JsonSerializer.Deserialize<EncounterMapCopy>(json, LayoutJson),
                new ValueComparer<EncounterMapCopy?>(
                    (a, b) => JsonSerializer.Serialize(a, LayoutJson) == JsonSerializer.Serialize(b, LayoutJson),
                    copy => JsonSerializer.Serialize(copy, LayoutJson).GetHashCode(),
                    copy => JsonSerializer.Deserialize<EncounterMapCopy>(JsonSerializer.Serialize(copy, LayoutJson), LayoutJson)))
            .HasColumnName("MapCopyJson");
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
        encounter.HasIndex(e => e.BackgroundAssetId);
    }
}
