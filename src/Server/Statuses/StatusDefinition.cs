using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Spells;

namespace OreanasOffice.Server.Statuses;

// knowledge/domain/status.md, knowledge/features/statuses.md: one of the 15 conditions of
// the 2024 rules (the library, seeded once for the whole site with fixed ids) or a custom
// status of a campaign. Never deleted, so a token's status always has a name and an icon.
public class StatusDefinition
{
    public const int NameMaxLength = 40;

    public const int IconDescriptionMaxLength = 300;

    public const int LibraryKeyMaxLength = 20;

    public const int SpellIconMaxLength = 20;

    // Exhaustion and custom statuses with levels: 1 to MaxLevel.
    public const int MaxLevel = 6;

    public Guid Id { get; set; }

    // One of StatusLibrary.Keys for library statuses; null for custom ones.
    public string? LibraryKey { get; set; }

    // Null for library statuses, which belong to no campaign.
    public Guid? CampaignId { get; set; }

    // German. The app shows library statuses by LibraryKey from its text file; the name
    // stored for them is only for reading the database.
    public required string Name { get; set; }

    // What the icon shows, for the icon prompt of a custom status ("a purple eye inside a hand").
    public string? IconDescription { get; set; }

    public bool HasLevels { get; set; }

    // Custom statuses: the picked icon version, a Done TokenIcon asset owned by this status
    // (AssetOwnerType.Status). Library icons are static files of the app instead.
    public Guid? IconAssetId { get; set; }

    // Custom statuses: the character whose status list it was made in, or null when it was
    // made in a DM status list (then CreatedByUserId's). Decides who may generate and pick
    // its icon: whoever may edit that character, or any `dm` member for a DM's status.
    public Guid? CharacterId { get; set; }

    public Guid? CreatedByUserId { get; set; }

    // A spell status (knowledge/features/spell-cards.md, "Statuses when a spell is added"):
    // the spell it was made from, at most one per campaign and spell.
    public Guid? SpellId { get; set; }

    // A spell status's card icon (SpellCards.Icons), drawn while it has no IconAssetId.
    public string? SpellIcon { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Campaign? Campaign { get; set; }
}

internal sealed class StatusDefinitionConfiguration : IEntityTypeConfiguration<StatusDefinition>
{
    public void Configure(EntityTypeBuilder<StatusDefinition> status)
    {
        status.ToTable("StatusDefinitions");
        status.Property(s => s.LibraryKey).HasMaxLength(StatusDefinition.LibraryKeyMaxLength).IsUnicode(false);
        status.Property(s => s.Name).HasMaxLength(StatusDefinition.NameMaxLength);
        status.Property(s => s.IconDescription).HasMaxLength(StatusDefinition.IconDescriptionMaxLength);
        status.HasIndex(s => s.LibraryKey).IsUnique().HasFilter($"[{nameof(StatusDefinition.LibraryKey)}] IS NOT NULL");
        status.HasIndex(s => s.CampaignId);
        status.HasIndex(s => s.IconAssetId);
        status.Property(s => s.SpellIcon).HasMaxLength(StatusDefinition.SpellIconMaxLength).IsUnicode(false);
        status.HasIndex(s => new { s.CampaignId, s.SpellId }).IsUnique().HasFilter($"[{nameof(StatusDefinition.SpellId)}] IS NOT NULL");
        status.HasOne<Spell>().WithMany().HasForeignKey(s => s.SpellId).OnDelete(DeleteBehavior.Restrict);
        status.HasOne(s => s.Campaign).WithMany().HasForeignKey(s => s.CampaignId).OnDelete(DeleteBehavior.Cascade);

        // The campaign's cascade already deletes characters; one path is all SQL Server allows.
        status.HasOne<Character>().WithMany().HasForeignKey(s => s.CharacterId).OnDelete(DeleteBehavior.Restrict);
        status.HasOne<AppUser>().WithMany().HasForeignKey(s => s.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);

        status.ToTable(t => t.HasCheckConstraint(
            "CK_StatusDefinitions_Library",
            $"([{nameof(StatusDefinition.LibraryKey)}] IS NOT NULL AND [{nameof(StatusDefinition.CampaignId)}] IS NULL)"
            + $" OR ([{nameof(StatusDefinition.LibraryKey)}] IS NULL AND [{nameof(StatusDefinition.CampaignId)}] IS NOT NULL)"));

        status.HasData(StatusLibrary.Seed());
    }
}

// The 15 conditions (knowledge/features/statuses.md, "The library") and Konzentration, which
// new status lists don't start with. Keys and ids are fixed for good: tokens and status lists
// point at them, and the app's static icons are /statuses/<key>.webp.
public static class StatusLibrary
{
    public static readonly IReadOnlyList<(string Key, string Name, Guid Id)> Conditions =
    [
        ("blinded", "Blind", new Guid("5a7d0000-0000-4000-8000-000000000001")),
        ("charmed", "Bezaubert", new Guid("5a7d0000-0000-4000-8000-000000000002")),
        ("deafened", "Taub", new Guid("5a7d0000-0000-4000-8000-000000000003")),
        ("exhaustion", "Erschöpfung", new Guid("5a7d0000-0000-4000-8000-000000000004")),
        ("frightened", "Verängstigt", new Guid("5a7d0000-0000-4000-8000-000000000005")),
        ("grappled", "Gepackt", new Guid("5a7d0000-0000-4000-8000-000000000006")),
        ("incapacitated", "Kampfunfähig", new Guid("5a7d0000-0000-4000-8000-000000000007")),
        ("invisible", "Unsichtbar", new Guid("5a7d0000-0000-4000-8000-000000000008")),
        ("paralyzed", "Gelähmt", new Guid("5a7d0000-0000-4000-8000-000000000009")),
        ("petrified", "Versteinert", new Guid("5a7d0000-0000-4000-8000-00000000000a")),
        ("poisoned", "Vergiftet", new Guid("5a7d0000-0000-4000-8000-00000000000b")),
        ("prone", "Liegend", new Guid("5a7d0000-0000-4000-8000-00000000000c")),
        ("restrained", "Festgesetzt", new Guid("5a7d0000-0000-4000-8000-00000000000d")),
        ("stunned", "Betäubt", new Guid("5a7d0000-0000-4000-8000-00000000000e")),
        ("unconscious", "Bewusstlos", new Guid("5a7d0000-0000-4000-8000-00000000000f")),
    ];

    public static readonly (string Key, string Name, Guid Id) Concentration =
        ("concentration", "Konzentration", new Guid("5a7d0000-0000-4000-8000-000000000010"));

    // Every library status: the conditions in their order, then Konzentration.
    public static readonly IReadOnlyList<(string Key, string Name, Guid Id)> All = [.. Conditions, Concentration];

    public const string LevelledKey = "exhaustion";

    public static bool IsCondition(string? key) => key is not null && Conditions.Any(c => c.Key == key);

    public static Guid ConditionId(string key) => Conditions.Single(c => c.Key == key).Id;

    // The keys in the conditions' order, each once.
    public static List<string> InConditionOrder(IEnumerable<string> keys)
    {
        var wanted = keys.ToHashSet(StringComparer.Ordinal);
        return [.. Conditions.Where(c => wanted.Contains(c.Key)).Select(c => c.Key)];
    }

    // The static icon of a library status, served from wwwroot.
    public static string IconUrl(string key) => $"/statuses/{key}.webp";

    internal static IEnumerable<StatusDefinition> Seed() =>
        All.Select(c => new StatusDefinition
        {
            Id = c.Id,
            LibraryKey = c.Key,
            Name = c.Name,
            HasLevels = c.Key == LevelledKey,
            CreatedAt = c.Key == Concentration.Key
                ? new DateTimeOffset(2026, 11, 25, 0, 0, 0, TimeSpan.Zero)
                : new DateTimeOffset(2026, 10, 16, 0, 0, 0, TimeSpan.Zero),
        });
}
