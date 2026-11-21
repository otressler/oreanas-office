using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Spells;

// knowledge/domain/spell.md: a spell of the rules, site-wide, identified by its English
// 2024 name. Level and school belong to the spell; the German card text to its variants.
public class Spell
{
    public const int NameMaxLength = 60;

    public const int MaxLevel = 9;

    public Guid Id { get; set; }

    public required string NameEn { get; set; }

    // NameEn trimmed and in lower case, for the unique index (SQL Server's collation
    // ignores case already, but this also keeps "Moonbeam " and "moonbeam" one spell).
    public required string NameKey { get; set; }

    public int Level { get; set; }

    public SpellSchool School { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Guid CreatedByUserId { get; set; }

    public List<SpellVariant> Variants { get; } = [];

    public static string KeyOf(string nameEn) => nameEn.Trim().ToLowerInvariant();
}

public enum SpellSchool
{
    Abjuration,
    Conjuration,
    Divination,
    Enchantment,
    Evocation,
    Illusion,
    Necromancy,
    Transmutation,
}

// The German card one user wrote for a spell. Only its author (and site admins) edits it;
// the edits reach every character that uses it (project owner, 2026-11-21).
public class SpellVariant
{
    public Guid Id { get; set; }

    public Guid SpellId { get; set; }

    public Guid AuthorUserId { get; set; }

    public Guid? BasedOnVariantId { get; set; }

    public SpellVariantOrigin Origin { get; set; }

    public required SpellCard Card { get; set; }

    // The picked art: a Done SpellArt asset owned by this variant, or null for the pattern.
    public Guid? ArtAssetId { get; set; }

    // "Abgenommen" in the studio.
    public bool ArtApproved { get; set; }

    // The spell-cards id ("moonbeam") of a seeded variant, so seeding twice skips it.
    public string? SeedKey { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public Spell Spell { get; set; } = null!;

    public AppUser Author { get; set; } = null!;
}

public enum SpellVariantOrigin
{
    Manual,
    Wiki,
    Photo,
    Seed,
}

// The card's content (knowledge/domain/spell.md, "The card"), stored as one JSON column.
// SpellCards.Validate checks the limits and the icon names.
public sealed record SpellCard
{
    public required string Name { get; init; }

    public string CastingTime { get; init; } = "";

    public string Range { get; init; } = "";

    public string Components { get; init; } = "";

    public string Duration { get; init; } = "";

    public bool Concentration { get; init; }

    public bool Ritual { get; init; }

    public string Description { get; init; } = "";

    public List<SpellEffect> Effects { get; init; } = [];

    public string Icon { get; init; } = "spark";

    public List<string> Pips { get; init; } = [];

    public string HigherLevels { get; init; } = "";

    public string Tip { get; init; } = "";

    public string Material { get; init; } = "";

    public string Source { get; init; } = "";

    public List<SpellWriteIn> WriteIns { get; init; } = [];
}

public sealed record SpellEffect
{
    public required string Icon { get; init; }

    public required string Title { get; init; }

    public string? Tag { get; init; }

    public string Text { get; init; } = "";

    public SpellChip? Chip { get; init; }
}

// A value chip beside an effect row: "2W10" over "Gleißend". Kind colours it by damage
// type; null takes the school's colour.
public sealed record SpellChip
{
    public required string Big { get; init; }

    public string? Small { get; init; }

    public SpellChipKind? Kind { get; init; }
}

public enum SpellChipKind
{
    Acid,
    Bludgeoning,
    Cold,
    Fire,
    Force,
    Lightning,
    Necrotic,
    Piercing,
    Poison,
    Psychic,
    Radiant,
    Slashing,
    Thunder,
    Heal,
}

// Blank lines on the back for the character's numbers.
public enum SpellWriteIn
{
    Attack,
    SaveDc,
    Modifier,
}

// The spells a character has: one variant per spell, prepared or not.
public class CharacterSpell
{
    public Guid Id { get; set; }

    public Guid CharacterId { get; set; }

    public Guid SpellId { get; set; }

    public Guid VariantId { get; set; }

    public bool Prepared { get; set; }

    public DateTimeOffset AddedAt { get; set; }

    public Character Character { get; set; } = null!;

    public Spell Spell { get; set; } = null!;

    public SpellVariant Variant { get; set; } = null!;
}

// A revision of one art motif of a variant (the studio's "Motiv A, B, …"). Append-only:
// the newest revision per letter is the current one.
public class SpellArtPrompt
{
    public const int SubjectMaxLength = 1500;

    public Guid Id { get; set; }

    public Guid VariantId { get; set; }

    // "a" to "z".
    public required string Letter { get; set; }

    public required string Subject { get; set; }

    public SpellArtPromptSource Source { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Guid CreatedByUserId { get; set; }
}

public enum SpellArtPromptSource
{
    Studio,
    Seed,
}

// A review in the studio: comments, ★, ✕ and hiding a failed request. Append-only; the
// newest favorite/reject per picture counts.
public class SpellArtEvent
{
    public const int ValueMaxLength = 1000;

    public Guid Id { get; set; }

    public Guid VariantId { get; set; }

    public Guid? AssetId { get; set; }

    public SpellArtEventKind Kind { get; set; }

    public string? Value { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Guid UserId { get; set; }
}

public enum SpellArtEventKind
{
    Comment,
    Favorite,
    Reject,
    Dismiss,
}

// One call to the text model (knowledge/decisions/text-model.md), counted against the
// monthly AI budget with the image jobs.
public class TextModelCall
{
    public const int PurposeMaxLength = 40;

    public Guid Id { get; set; }

    public required string Purpose { get; set; }

    public string? Model { get; set; }

    public int InputTokens { get; set; }

    public int OutputTokens { get; set; }

    public decimal CostUsd { get; set; }

    public bool Succeeded { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Guid? UserId { get; set; }
}

internal sealed class SpellConfiguration :
    IEntityTypeConfiguration<Spell>,
    IEntityTypeConfiguration<SpellVariant>,
    IEntityTypeConfiguration<CharacterSpell>,
    IEntityTypeConfiguration<SpellArtPrompt>,
    IEntityTypeConfiguration<SpellArtEvent>,
    IEntityTypeConfiguration<TextModelCall>
{
    public static readonly JsonSerializerOptions CardJson = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public void Configure(EntityTypeBuilder<Spell> spell)
    {
        spell.Property(s => s.NameEn).HasMaxLength(Spell.NameMaxLength);
        spell.Property(s => s.NameKey).HasMaxLength(Spell.NameMaxLength);
        spell.HasIndex(s => s.NameKey).IsUnique();
        spell.HasOne<AppUser>().WithMany().HasForeignKey(s => s.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    public void Configure(EntityTypeBuilder<SpellVariant> variant)
    {
        variant.Property(v => v.Card)
            .HasConversion(
                card => JsonSerializer.Serialize(card, CardJson),
                json => JsonSerializer.Deserialize<SpellCard>(json, CardJson)!,
                new ValueComparer<SpellCard>(
                    (a, b) => JsonSerializer.Serialize(a, CardJson) == JsonSerializer.Serialize(b, CardJson),
                    card => JsonSerializer.Serialize(card, CardJson).GetHashCode(),
                    card => JsonSerializer.Deserialize<SpellCard>(JsonSerializer.Serialize(card, CardJson), CardJson)!))
            .HasColumnName("CardJson");
        variant.Property(v => v.SeedKey).HasMaxLength(Spell.NameMaxLength);
        variant.HasIndex(v => v.SeedKey).IsUnique().HasFilter("[SeedKey] IS NOT NULL");
        variant.HasIndex(v => v.ArtAssetId);
        variant.HasOne(v => v.Spell).WithMany(s => s.Variants).HasForeignKey(v => v.SpellId).OnDelete(DeleteBehavior.Cascade);
        variant.HasOne(v => v.Author).WithMany().HasForeignKey(v => v.AuthorUserId).OnDelete(DeleteBehavior.Restrict);
        variant.HasOne<SpellVariant>().WithMany().HasForeignKey(v => v.BasedOnVariantId).OnDelete(DeleteBehavior.NoAction);
    }

    public void Configure(EntityTypeBuilder<CharacterSpell> entry)
    {
        entry.HasIndex(e => new { e.CharacterId, e.SpellId }).IsUnique();
        entry.HasIndex(e => e.VariantId);
        entry.HasOne(e => e.Character).WithMany().HasForeignKey(e => e.CharacterId).OnDelete(DeleteBehavior.Cascade);
        // The spell cascades through its variants; two cascade paths aren't allowed.
        entry.HasOne(e => e.Spell).WithMany().HasForeignKey(e => e.SpellId).OnDelete(DeleteBehavior.NoAction);
        entry.HasOne(e => e.Variant).WithMany().HasForeignKey(e => e.VariantId).OnDelete(DeleteBehavior.Restrict);
    }

    public void Configure(EntityTypeBuilder<SpellArtPrompt> prompt)
    {
        prompt.Property(p => p.Letter).HasMaxLength(1).IsUnicode(false);
        prompt.Property(p => p.Subject).HasMaxLength(SpellArtPrompt.SubjectMaxLength);
        prompt.HasIndex(p => new { p.VariantId, p.Letter, p.CreatedAt });
        prompt.HasOne<SpellVariant>().WithMany().HasForeignKey(p => p.VariantId).OnDelete(DeleteBehavior.Cascade);
        prompt.HasOne<AppUser>().WithMany().HasForeignKey(p => p.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    public void Configure(EntityTypeBuilder<SpellArtEvent> e)
    {
        e.Property(x => x.Value).HasMaxLength(SpellArtEvent.ValueMaxLength);
        e.HasIndex(x => new { x.VariantId, x.CreatedAt });
        e.HasOne<SpellVariant>().WithMany().HasForeignKey(x => x.VariantId).OnDelete(DeleteBehavior.Cascade);
        e.HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
    }

    public void Configure(EntityTypeBuilder<TextModelCall> call)
    {
        call.Property(c => c.Purpose).HasMaxLength(TextModelCall.PurposeMaxLength);
        call.Property(c => c.Model).HasMaxLength(100);
        call.Property(c => c.CostUsd).HasPrecision(10, 6);
        call.HasIndex(c => c.CreatedAt);
        call.HasOne<AppUser>().WithMany().HasForeignKey(c => c.UserId).OnDelete(DeleteBehavior.SetNull);
    }
}
