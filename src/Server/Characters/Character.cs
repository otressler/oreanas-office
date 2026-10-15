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

    public const int AppearanceMaxLength = 500;

    public Guid Id { get; set; }

    public Guid CampaignId { get; set; }

    public Guid OwnerUserId { get; set; }

    public required string Name { get; set; }

    public CreatureSize Size { get; set; }

    // Short visual description that feeds the portrait prompt (knowledge/domain/character.md).
    public string Appearance { get; set; } = "";

    // The picked portrait version: a Done TokenIcon asset owned by this character
    // (generated, uploaded or restyled), or null for the letter.
    public Guid? TokenAssetId { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Campaign Campaign { get; set; } = null!;

    public AppUser Owner { get; set; } = null!;
}

internal sealed class CharacterConfiguration : IEntityTypeConfiguration<Character>
{
    public void Configure(EntityTypeBuilder<Character> character)
    {
        character.Property(c => c.Name).HasMaxLength(Character.NameMaxLength);
        character.Property(c => c.Appearance).HasMaxLength(Character.AppearanceMaxLength);
        character.HasIndex(c => c.TokenAssetId);
        character.HasOne(c => c.Campaign).WithMany(c => c.Characters).HasForeignKey(c => c.CampaignId).OnDelete(DeleteBehavior.Cascade);
        character.HasOne(c => c.Owner).WithMany().HasForeignKey(c => c.OwnerUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
