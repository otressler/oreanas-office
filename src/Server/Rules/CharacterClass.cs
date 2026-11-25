using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Spells;

namespace OreanasOffice.Server.Rules;

// knowledge/rules/handbook-classes.md: the classes and subclasses of the 2024 Player's
// Handbook. Reference data, written only by HandbookSync from handbook.json.
public class CharacterClass
{
    public const int IdMaxLength = 40;

    public const int NameMaxLength = 60;

    // "wizard", the class's slug on dnd2024.wikidot.com.
    public required string Id { get; set; }

    public required string NameEn { get; set; }

    public required string NameDe { get; set; }

    // How the class casts spells, for a later filter by the spell levels a class level
    // reaches; null for classes without spellcasting of their own.
    public SpellcastingKind? Caster { get; set; }

    // The Handbook's order (alphabetical in English).
    public int Position { get; set; }

    public List<CharacterSubclass> Subclasses { get; } = [];
}

public enum SpellcastingKind
{
    // Bard, Cleric, Druid, Sorcerer, Wizard: spell levels up to 9.
    Full,

    // Paladin, Ranger: up to 5.
    Half,

    // Warlock: Pact Magic.
    Pact,
}

public class CharacterSubclass
{
    // "evoker", the subclass's slug on dnd2024.wikidot.com; unique across classes.
    public required string Id { get; set; }

    public required string ClassId { get; set; }

    public required string NameEn { get; set; }

    public required string NameDe { get; set; }

    // The class whose spell list it casts from: "wizard" for Eldritch Knight and Arcane
    // Trickster; null for every other subclass.
    public string? SpellListClassId { get; set; }

    public int Position { get; set; }

    public CharacterClass Class { get; set; } = null!;
}

// One spell on a class's list (SubclassId and ClassLevel null) or granted by a subclass from
// a class level on (Life Domain: Aid from Cleric level 3). The groundwork for filtering by
// what a character of given class levels may cast (knowledge/domain/spell.md).
public class SpellListEntry
{
    public int Id { get; set; }

    public Guid SpellId { get; set; }

    public required string ClassId { get; set; }

    public string? SubclassId { get; set; }

    public int? ClassLevel { get; set; }

    public Spell Spell { get; set; } = null!;
}

// A character's level in one class, and its subclass from level 3 on
// (knowledge/domain/character.md). Characters may have several classes (multiclassing).
public class CharacterClassLevel
{
    public const int MaxLevel = 20;

    // The level from which a class has a subclass.
    public const int SubclassLevel = 3;

    public Guid CharacterId { get; set; }

    public required string ClassId { get; set; }

    public int Level { get; set; }

    public string? SubclassId { get; set; }

    // The order the player gave, the first being the class they started with.
    public int Position { get; set; }

    public Character Character { get; set; } = null!;

    public CharacterClass Class { get; set; } = null!;

    public CharacterSubclass? Subclass { get; set; }
}

// The version of the reference data copied into the database (HandbookSync).
public class ReferenceDataVersion
{
    public const int KeyMaxLength = 40;

    public required string Key { get; set; }

    public required string Hash { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}

internal sealed class CharacterClassConfiguration :
    IEntityTypeConfiguration<CharacterClass>,
    IEntityTypeConfiguration<CharacterSubclass>,
    IEntityTypeConfiguration<SpellListEntry>,
    IEntityTypeConfiguration<CharacterClassLevel>,
    IEntityTypeConfiguration<ReferenceDataVersion>
{
    public void Configure(EntityTypeBuilder<CharacterClass> entity)
    {
        entity.ToTable("CharacterClasses");
        entity.Property(c => c.Id).HasMaxLength(CharacterClass.IdMaxLength).IsUnicode(false);
        entity.Property(c => c.NameEn).HasMaxLength(CharacterClass.NameMaxLength);
        entity.Property(c => c.NameDe).HasMaxLength(CharacterClass.NameMaxLength);
    }

    public void Configure(EntityTypeBuilder<CharacterSubclass> entity)
    {
        entity.ToTable("CharacterSubclasses");
        entity.Property(s => s.Id).HasMaxLength(CharacterClass.IdMaxLength).IsUnicode(false);
        entity.Property(s => s.ClassId).HasMaxLength(CharacterClass.IdMaxLength).IsUnicode(false);
        entity.Property(s => s.SpellListClassId).HasMaxLength(CharacterClass.IdMaxLength).IsUnicode(false);
        entity.Property(s => s.NameEn).HasMaxLength(CharacterClass.NameMaxLength);
        entity.Property(s => s.NameDe).HasMaxLength(CharacterClass.NameMaxLength);
        entity.HasOne(s => s.Class).WithMany(c => c.Subclasses).HasForeignKey(s => s.ClassId).OnDelete(DeleteBehavior.Restrict);
        entity.HasOne<CharacterClass>().WithMany().HasForeignKey(s => s.SpellListClassId).OnDelete(DeleteBehavior.Restrict);
    }

    public void Configure(EntityTypeBuilder<SpellListEntry> entity)
    {
        entity.Property(e => e.ClassId).HasMaxLength(CharacterClass.IdMaxLength).IsUnicode(false);
        entity.Property(e => e.SubclassId).HasMaxLength(CharacterClass.IdMaxLength).IsUnicode(false);
        entity.HasIndex(e => new { e.SpellId, e.ClassId, e.SubclassId }).IsUnique();
        entity.HasIndex(e => e.ClassId);
        entity.HasIndex(e => e.SubclassId);
        entity.HasOne(e => e.Spell).WithMany(s => s.Lists).HasForeignKey(e => e.SpellId).OnDelete(DeleteBehavior.Cascade);
        entity.HasOne<CharacterClass>().WithMany().HasForeignKey(e => e.ClassId).OnDelete(DeleteBehavior.Restrict);
        entity.HasOne<CharacterSubclass>().WithMany().HasForeignKey(e => e.SubclassId).OnDelete(DeleteBehavior.Restrict);
    }

    public void Configure(EntityTypeBuilder<CharacterClassLevel> entity)
    {
        entity.HasKey(c => new { c.CharacterId, c.ClassId });
        entity.Property(c => c.ClassId).HasMaxLength(CharacterClass.IdMaxLength).IsUnicode(false);
        entity.Property(c => c.SubclassId).HasMaxLength(CharacterClass.IdMaxLength).IsUnicode(false);
        entity.HasOne(c => c.Character).WithMany(c => c.Classes).HasForeignKey(c => c.CharacterId).OnDelete(DeleteBehavior.Cascade);
        entity.HasOne(c => c.Class).WithMany().HasForeignKey(c => c.ClassId).OnDelete(DeleteBehavior.Restrict);
        entity.HasOne(c => c.Subclass).WithMany().HasForeignKey(c => c.SubclassId).OnDelete(DeleteBehavior.Restrict);
    }

    public void Configure(EntityTypeBuilder<ReferenceDataVersion> entity)
    {
        entity.HasKey(v => v.Key);
        entity.Property(v => v.Key).HasMaxLength(ReferenceDataVersion.KeyMaxLength).IsUnicode(false);
        entity.Property(v => v.Hash).HasMaxLength(64).IsUnicode(false);
    }
}
