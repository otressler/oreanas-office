using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Encounters;

// Request and response types for encounters and the board.

// An encounter in the DM's list. SessionId is set once it has been started.
public record EncounterSummaryResponse(
    Guid Id,
    string Name,
    EncounterStatus Status,
    Guid BattleMapId,
    int Width,
    int Height,
    int CreatureCount,
    Guid? SessionId,
    DateTimeOffset CreatedAt);

// The setup screen's result: the characters taking part and where each stands.
// Placing and starting are one step (knowledge/domain/encounter.md, "Starting").
public record StartEncounterRequest(List<CharacterPlacement> Characters);

public record CharacterPlacement(Guid CharacterId, int X, int Y);

// The landing page and session list link to the running fight.
public record ActiveEncounterSummary(Guid Id, string Name);

// GET board: everything needed to draw the encounter, in one document. Stage 4 reloads
// it on every reconnect. IsSessionDm: the signed-in user runs the session (moves any
// token from stage 4 on); false for an encounter that hasn't started.
public record BoardStateResponse(
    Guid EncounterId,
    Guid CampaignId,
    Guid? SessionId,
    string Name,
    EncounterStatus Status,
    BoardMap Map,
    List<BoardToken> Tokens,
    bool IsSessionDm);

// BackgroundUrl stays null until AI backgrounds arrive (stage 7); the board then
// draws the plain layout.
public record BoardMap(Guid Id, string Name, int Width, int Height, MapLayout Layout, string? BackgroundUrl);

// Label: the character's name or the creature's label. OwnerUserId: the character's
// owner, null for creatures. ColorIndex: characters get a fixed ring colour by the
// order they were added to the campaign (0, 1, 2…); null for creatures, which share
// one colour. Size and speed come from the character or creature type.
public record BoardToken(
    Guid Id,
    TokenKind Kind,
    Guid? CharacterId,
    Guid? CreatureTypeId,
    Guid? OwnerUserId,
    string Label,
    int X,
    int Y,
    decimal Elevation,
    CreatureSize Size,
    int SpeedSquares,
    int? ColorIndex);
