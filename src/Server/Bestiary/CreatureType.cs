using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Bestiary;

// knowledge/domain/creature-type.md. Stage 3 creates types only through map imports;
// the bestiary screens come in stage 6, the icon with assets in stage 8.
public class CreatureType
{
    public const int NameMaxLength = 40;
    public const int AppearanceMaxLength = 500;
    public const int NotesMaxLength = 2000;

    public Guid Id { get; set; }

    public Guid CampaignId { get; set; }

    public required string Name { get; set; }

    public CreatureSize Size { get; set; }

    public string Appearance { get; set; } = "";

    public string Notes { get; set; } = "";

    public DateTimeOffset CreatedAt { get; set; }

    // Sync (knowledge/decisions/offline-prep-pwa.md, "Versions and IDs"): 1 when created,
    // raised by 1 on every accepted change; a concurrency token.
    public int Version { get; set; } = 1;

    // Archived items stay listed for sync but aren't offered for picking.
    public DateTimeOffset? ArchivedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public Guid? UpdatedByUserId { get; set; }

    public Campaign Campaign { get; set; } = null!;
}

internal sealed class CreatureTypeConfiguration : IEntityTypeConfiguration<CreatureType>
{
    public void Configure(EntityTypeBuilder<CreatureType> type)
    {
        type.Property(t => t.Name).HasMaxLength(CreatureType.NameMaxLength);
        type.Property(t => t.Appearance).HasMaxLength(CreatureType.AppearanceMaxLength);
        type.Property(t => t.Notes).HasMaxLength(CreatureType.NotesMaxLength);
        type.Property(t => t.Version).IsConcurrencyToken();
        type.HasOne<AppUser>().WithMany().HasForeignKey(t => t.UpdatedByUserId).OnDelete(DeleteBehavior.Restrict);
        type.HasOne(t => t.Campaign).WithMany().HasForeignKey(t => t.CampaignId).OnDelete(DeleteBehavior.Cascade);

        // One "Goblin" per campaign. The database collation ignores case, so "goblin"
        // is the same name, which is how imports match types.
        type.HasIndex(t => new { t.CampaignId, t.Name }).IsUnique();
    }
}
