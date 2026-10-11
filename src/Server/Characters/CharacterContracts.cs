using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Characters;

// Speed is whole squares; the frontend converts meters on input and output.
public record CharacterRequest(string Name, CreatureSize Size, int SpeedSquares);

// CanEdit: the signed-in user owns the character or is a `dm` member.
public record CharacterResponse(
    Guid Id,
    Guid OwnerUserId,
    string OwnerDisplayName,
    string Name,
    CreatureSize Size,
    int SpeedSquares,
    bool CanEdit);
