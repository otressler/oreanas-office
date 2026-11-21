using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Spells;

// A spell in the library: the German name, icon and art of its first variant (the one most
// characters use, then the oldest), and how many variants it has.
public record SpellSummary(
    Guid Id,
    string NameEn,
    int Level,
    SpellSchool School,
    string Name,
    string Icon,
    int VariantCount,
    string? ArtUrl);

public record SpellAuthor(Guid Id, string DisplayName);

// A variant with its spell's facts, everything a card needs. UsedBy: how many characters
// use it. CanEdit: the signed-in user is its author or a site admin.
public record SpellVariantView(
    Guid Id,
    Guid SpellId,
    string NameEn,
    int Level,
    SpellSchool School,
    SpellAuthor Author,
    Guid? BasedOnVariantId,
    SpellVariantOrigin Origin,
    SpellCard Card,
    Guid? ArtAssetId,
    string? ArtUrl,
    bool ArtApproved,
    int UsedBy,
    bool CanEdit,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

// CanEditFacts: a site admin, who may correct the English name, level and school.
public record SpellDetail(
    Guid Id,
    string NameEn,
    int Level,
    SpellSchool School,
    bool CanEditFacts,
    List<SpellVariantView> Variants);

// A new variant. With a spell of this English name already in the library the variant
// joins it, and that spell's level and school stay; otherwise the spell is created.
public record CreateVariantRequest(
    string NameEn,
    int Level,
    SpellSchool School,
    SpellCard Card,
    SpellVariantOrigin Origin = SpellVariantOrigin.Manual,
    Guid? BasedOnVariantId = null);

public record UpdateVariantRequest(SpellCard Card);

public record UpdateSpellRequest(string NameEn, int Level, SpellSchool School);

// A character's spell: the variant it uses, and whether it is prepared.
public record CharacterSpellView(Guid SpellId, bool Prepared, DateTimeOffset AddedAt, SpellVariantView Variant);

// Adds the spell with this variant, or switches the variant or prepared of a spell the
// character has. Prepared null keeps it (false for a new entry).
public record SetCharacterSpellRequest(Guid VariantId, bool? Prepared = null);

// Spell import (knowledge/features/spell-cards.md, "Creating a spell"): a draft the user
// checks in the editor. ExistingSpellId: the library has a spell of this English name
// already, so saving adds a variant to it.
public record SpellDraft(
    string NameEn,
    int Level,
    SpellSchool School,
    SpellCard Card,
    SpellVariantOrigin Origin,
    Guid? ExistingSpellId);

// Force: write a draft from the wiki even when the library has the spell already, for
// "Eigene Variante aus dem Wiki".
public record ImportByNameRequest(string Name, bool Force = false);

// The English name the input stands for, and the draft from the wiki; without Force no
// draft when the library has the spell already (ExistingSpellId).
public record ImportByNameResponse(string NameEn, Guid? ExistingSpellId, SpellDraft? Draft);

public record ImportByPhotoResponse(List<SpellDraft> Drafts);

// What the text model may still spend this month, as for images.
public record SpellImportStatus(bool Available, ImageBudgetResponse Budget);
