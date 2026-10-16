using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Characters;

namespace OreanasOffice.Server.Statuses;

// knowledge/domain/status.md, "Status list": what a person picks from when adding a status
// ("Zustandsliste"). One per character, and one per `dm` member of a campaign. The row is
// made the first time the list is read, with all 15 conditions; until then the list
// doesn't exist, so a list someone emptied stays empty.
public class StatusList
{
    public Guid Id { get; set; }

    // A character's list: CharacterId set, UserId null.
    public Guid? CharacterId { get; set; }

    // Always set: the character's campaign, or the DM's.
    public Guid CampaignId { get; set; }

    // A DM's own list: UserId set, CharacterId null.
    public Guid? UserId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public List<StatusListEntry> Entries { get; set; } = [];
}

// One status in a list, in the owner's order. A status appears at most once per list.
public class StatusListEntry
{
    public Guid StatusListId { get; set; }

    public Guid StatusId { get; set; }

    public int Position { get; set; }

    public StatusList StatusList { get; set; } = null!;

    public StatusDefinition Status { get; set; } = null!;
}

internal sealed class StatusListConfiguration : IEntityTypeConfiguration<StatusList>
{
    public void Configure(EntityTypeBuilder<StatusList> list)
    {
        list.HasIndex(l => l.CharacterId).IsUnique().HasFilter($"[{nameof(StatusList.CharacterId)}] IS NOT NULL");
        list.HasIndex(l => new { l.CampaignId, l.UserId }).IsUnique().HasFilter($"[{nameof(StatusList.UserId)}] IS NOT NULL");
        list.HasOne<Campaign>().WithMany().HasForeignKey(l => l.CampaignId).OnDelete(DeleteBehavior.Cascade);

        // The campaign's cascade deletes the list; one path is all SQL Server allows.
        list.HasOne<Character>().WithMany().HasForeignKey(l => l.CharacterId).OnDelete(DeleteBehavior.Restrict);
        list.HasOne<AppUser>().WithMany().HasForeignKey(l => l.UserId).OnDelete(DeleteBehavior.Restrict);
        list.ToTable(t => t.HasCheckConstraint(
            "CK_StatusLists_Owner",
            $"([{nameof(StatusList.CharacterId)}] IS NOT NULL AND [{nameof(StatusList.UserId)}] IS NULL)"
            + $" OR ([{nameof(StatusList.CharacterId)}] IS NULL AND [{nameof(StatusList.UserId)}] IS NOT NULL)"));
    }
}

internal sealed class StatusListEntryConfiguration : IEntityTypeConfiguration<StatusListEntry>
{
    public void Configure(EntityTypeBuilder<StatusListEntry> entry)
    {
        entry.HasKey(e => new { e.StatusListId, e.StatusId });
        entry.HasOne(e => e.StatusList).WithMany(l => l.Entries).HasForeignKey(e => e.StatusListId).OnDelete(DeleteBehavior.Cascade);
        entry.HasOne(e => e.Status).WithMany().HasForeignKey(e => e.StatusId).OnDelete(DeleteBehavior.Restrict);
    }
}
