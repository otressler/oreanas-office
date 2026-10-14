using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Characters;

// knowledge/domain/character.md.
public class Character
{
    public const int NameMaxLength = 40;

    public Guid Id { get; set; }

    public Guid CampaignId { get; set; }

    public Guid OwnerUserId { get; set; }

    public required string Name { get; set; }

    public CreatureSize Size { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Campaign Campaign { get; set; } = null!;

    public AppUser Owner { get; set; } = null!;
}

internal sealed class CharacterConfiguration : IEntityTypeConfiguration<Character>
{
    public void Configure(EntityTypeBuilder<Character> character)
    {
        character.Property(c => c.Name).HasMaxLength(Character.NameMaxLength);
        character.HasOne(c => c.Campaign).WithMany(c => c.Characters).HasForeignKey(c => c.CampaignId).OnDelete(DeleteBehavior.Cascade);
        character.HasOne(c => c.Owner).WithMany().HasForeignKey(c => c.OwnerUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
