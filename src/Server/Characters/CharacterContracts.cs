using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Characters;

// Appearance, Background, Personality, Bonds: up to the Character.*MaxLength characters
// each, and Tagline up to Character.TaglineMaxLength (a flavor sentence for the card,
// not in the prompt); the first three feed the portrait prompt, Bonds don't. Null saves an empty text.
// Species, Age: free text up to Character.FactMaxLength characters, shown under the name. Null
// saves an empty text.
// Classes: the character's classes in order, each once, with its level (1-20, together at most
// 20) and a subclass of that class from level 3 on (knowledge/domain/character.md). Null saves
// none. 400 CharacterClassInvalid with Field "classes" otherwise.
// Color: the ring colour as "#rrggbb" (any case), or null or empty for the default.
// OwnerUserId: the member the character belongs to. Null keeps the owner, or for a new
// character makes it the signed-in user's. Only `dm` members give a character to someone
// else (403); it must be a member of the campaign (NotAMember).
public record CharacterRequest(
    string Name, CreatureSize Size, string? Appearance = null, string? Color = null, Guid? OwnerUserId = null,
    string? Background = null, string? Personality = null, string? Bonds = null, string? Tagline = null,
    string? Species = null, string? Age = null, List<CharacterClassRequest>? Classes = null);

// ClassId and SubclassId: ids from GET /api/rules/classes ("wizard", "evoker").
public record CharacterClassRequest(string ClassId, int Level, string? SubclassId = null);

// One of a character's classes with its level, and its subclass or null.
public record CharacterClassView(string ClassId, int Level, string? SubclassId);

// CanEdit: the signed-in user owns the character or is a `dm` member. ColorIndex: the
// character's place in the order characters were added to the campaign (0, 1, 2…),
// which picks its default ring colour on the board (BoardToken.ColorIndex). Color: the
// ring colour its player picked, "#rrggbb", which replaces the default; null for the
// default. PortraitUrl: the picked portrait (Character.TokenAssetId), null for the letter.
public record CharacterResponse(
    Guid Id,
    Guid OwnerUserId,
    string OwnerDisplayName,
    string Name,
    CreatureSize Size,
    bool CanEdit,
    int ColorIndex,
    string Appearance,
    string? PortraitUrl,
    string? Color,
    string Background,
    string Personality,
    string Bonds,
    string Tagline,
    string Species,
    string Age,
    List<CharacterClassView> Classes);

// One of the signed-in user's characters in another campaign they belong to, to take into
// this one (knowledge/features/character-import.md). Color: the ring colour its player
// picked, which the copy keeps; null for the default. PortraitUrl: its picked portrait, null
// for the letter.
public record ImportableCharacterResponse(
    Guid Id,
    Guid CampaignId,
    string CampaignName,
    string Name,
    CreatureSize Size,
    string Tagline,
    List<CharacterClassView> Classes,
    string Species,
    string? Color,
    string? PortraitUrl);

// CharacterId: one of the user's characters from GET characters/importable. The copy belongs
// to the signed-in user; 404 for anything else.
public record ImportCharacterRequest(Guid CharacterId);
