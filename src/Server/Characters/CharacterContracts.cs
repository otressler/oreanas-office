using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Characters;

public record CharacterRequest(string Name, CreatureSize Size);

// CanEdit: the signed-in user owns the character or is a `dm` member. ColorIndex: the
// character's place in the order characters were added to the campaign (0, 1, 2…),
// which picks its ring colour on the board (BoardToken.ColorIndex).
public record CharacterResponse(
    Guid Id,
    Guid OwnerUserId,
    string OwnerDisplayName,
    string Name,
    CreatureSize Size,
    bool CanEdit,
    int ColorIndex);
