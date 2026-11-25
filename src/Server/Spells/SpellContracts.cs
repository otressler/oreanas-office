using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Spells;

// A class list a spell is on (SubclassId and ClassLevel null), or a subclass that grants it
// from a class level on (knowledge/rules/handbook-classes.md). Ids from GET /api/rules/classes.
public record SpellListLink(string ClassId, string? SubclassId, int? ClassLevel);

// A Handbook spell in the library: the German name, icon and art of its first variant (the one
// most characters use, then the oldest), or the Handbook's German name (the English one where it
// has none) and "spark" without a variant;
// how many variants it has; and its class lists.
public record SpellSummary(
    Guid Id,
    string NameEn,
    int Level,
    SpellSchool School,
    string Name,
    string Icon,
    int VariantCount,
    string? ArtUrl,
    List<SpellListLink> Lists);

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

// NameDe: the Handbook's German name, null where it has none. InHandbook: false for a spell
// made before the library was limited to the Handbook; it keeps its variants, but gets no new ones.
public record SpellDetail(
    Guid Id,
    string NameEn,
    string? NameDe,
    int Level,
    SpellSchool School,
    bool InHandbook,
    List<SpellListLink> Lists,
    List<SpellVariantView> Variants);

// A new variant of a Handbook spell from the library (409 SpellNotInHandbook otherwise).
public record CreateVariantRequest(
    Guid SpellId,
    SpellCard Card,
    SpellVariantOrigin Origin = SpellVariantOrigin.Manual,
    Guid? BasedOnVariantId = null);

public record UpdateVariantRequest(SpellCard Card);

// A character's spell: the variant it uses, and whether it is prepared.
public record CharacterSpellView(Guid SpellId, bool Prepared, DateTimeOffset AddedAt, SpellVariantView Variant);

// Adds the spell with this variant, or switches the variant or prepared of a spell the
// character has. Prepared null keeps it (false for a new entry).
public record SetCharacterSpellRequest(Guid VariantId, bool? Prepared = null);

// A status the character's list is missing that its spell offers (knowledge/features/spell-cards.md,
// "Statuses when a spell is added"). Key: "spell" for the spell's own status, else LibraryKey
// ("concentration", "restrained" …). IconUrl: a library status's static icon or a spell status's
// picked picture; SpellIcon: the card icon a spell status is drawn with otherwise.
public record SpellStatusOffer(string Key, string? LibraryKey, string Name, string? IconUrl, string? SpellIcon);

// The offered statuses to add to the character's list, by SpellStatusOffer.Key.
public record AddSpellStatusesRequest(List<string>? Keys);

// Spell import (knowledge/features/spell-cards.md, "Creating a spell"): a draft of a card for
// a Handbook spell, which the user checks in the editor. Level and school are the Handbook's.
// VariantCount: how many cards the library has for the spell already.
public record SpellDraft(
    Guid SpellId,
    string NameEn,
    int Level,
    SpellSchool School,
    SpellCard Card,
    SpellVariantOrigin Origin,
    int VariantCount);

// Force: write a draft from the wiki even when the library has cards for the spell already,
// for "Eigene Variante aus dem Wiki".
public record ImportByNameRequest(string Name, bool Force = false);

// The Handbook spell the input stands for, and the draft from the wiki; without Force no
// draft when the library has cards for it already (VariantCount above 0).
public record ImportByNameResponse(string NameEn, Guid SpellId, int VariantCount, SpellDraft? Draft);

public record ImportByPhotoResponse(List<SpellDraft> Drafts);

// What the text model may still spend this month, as for images.
public record SpellImportStatus(bool Available, ImageBudgetResponse Budget);
