using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Characters;

// Appearance: up to Character.AppearanceMaxLength characters; feeds the portrait prompt.
// Color: the ring colour as "#rrggbb" (any case), or null or empty for the default.
// OwnerUserId: the member the character belongs to. Null keeps the owner, or for a new
// character makes it the signed-in user's. Only `dm` members give a character to someone
// else (403); it must be a member of the campaign (NotAMember).
public record CharacterRequest(
    string Name, CreatureSize Size, string? Appearance = null, string? Color = null, Guid? OwnerUserId = null);

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
    string? Color);
