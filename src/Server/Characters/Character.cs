using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Characters;

// knowledge/domain/character.md.
public class Character
{
    public const int NameMaxLength = 40;

    public const int AppearanceMaxLength = 750;

    public const int TaglineMaxLength = 120;

    public const int BackgroundMaxLength = 1500;

    public const int PersonalityMaxLength = 750;

    public const int BondsMaxLength = 1500;

    // Class, species and age are free text ("Waldläuferin", "Waldelfe", "Mitte zwanzig").
    public const int FactMaxLength = 40;

    // "#rrggbb", lower case.
    public const int ColorLength = 7;

    public Guid Id { get; set; }

    public Guid CampaignId { get; set; }

    public Guid OwnerUserId { get; set; }

    public required string Name { get; set; }

    public CreatureSize Size { get; set; }

    // Short visual description that feeds the portrait prompt (knowledge/domain/character.md).
    public string Appearance { get; set; } = "";

    // Where it comes from and what it is like: both feed the portrait prompt with the
    // appearance. Bonds (its ties to people and places) are for the other players to read
    // and never reach the prompt.
    public string Background { get; set; } = "";

    // One flavor sentence for the character's card on the campaign page. Not part of the
    // portrait prompt.
    public string Tagline { get; set; } = "";

    public string Personality { get; set; } = "";

    public string Bonds { get; set; } = "";

    // Facts under the name on the character's page; free text, not in the portrait prompt.
    public string CharacterClass { get; set; } = "";

    public string Species { get; set; } = "";

    public string Age { get; set; } = "";

    // The picked portrait version: a Done TokenIcon asset owned by this character
    // (generated, uploaded or restyled), or null for the letter.
    public Guid? TokenAssetId { get; set; }

    // The ring colour its player picked, "#rrggbb" in lower case, or null for the one
    // given by the order characters were added (knowledge/domain/character.md).
    // Characters may share a colour.
    public string? Color { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Campaign Campaign { get; set; } = null!;

    public AppUser Owner { get; set; } = null!;

    // Who plays it in a session other than its owner (knowledge/domain/session.md).
    public List<SessionCharacterPlayer> SessionPlayers { get; } = [];
}

internal sealed class CharacterConfiguration : IEntityTypeConfiguration<Character>
{
    public void Configure(EntityTypeBuilder<Character> character)
    {
        character.Property(c => c.Name).HasMaxLength(Character.NameMaxLength);
        character.Property(c => c.Appearance).HasMaxLength(Character.AppearanceMaxLength);
        character.Property(c => c.Tagline).HasMaxLength(Character.TaglineMaxLength);
        character.Property(c => c.Background).HasMaxLength(Character.BackgroundMaxLength);
        character.Property(c => c.Personality).HasMaxLength(Character.PersonalityMaxLength);
        character.Property(c => c.Bonds).HasMaxLength(Character.BondsMaxLength);
        character.Property(c => c.CharacterClass).HasMaxLength(Character.FactMaxLength);
        character.Property(c => c.Species).HasMaxLength(Character.FactMaxLength);
        character.Property(c => c.Age).HasMaxLength(Character.FactMaxLength);
        character.Property(c => c.Color).HasMaxLength(Character.ColorLength).IsUnicode(false);
        character.HasIndex(c => c.TokenAssetId);
        character.HasOne(c => c.Campaign).WithMany(c => c.Characters).HasForeignKey(c => c.CampaignId).OnDelete(DeleteBehavior.Cascade);
        character.HasOne(c => c.Owner).WithMany().HasForeignKey(c => c.OwnerUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
