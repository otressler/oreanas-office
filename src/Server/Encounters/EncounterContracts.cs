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

// GET board: everything needed to draw the encounter, in one document. Devices reload
// it on every reconnect (knowledge/decisions/realtime-sync.md). IsSessionDm: the
// signed-in user runs the session and moves any token; false for an encounter that
// hasn't started. UndoableMove: the signed-in user's last move, while they can still
// undo it; null otherwise.
public record BoardStateResponse(
    Guid EncounterId,
    Guid CampaignId,
    Guid? SessionId,
    string Name,
    EncounterStatus Status,
    BoardMap Map,
    List<BoardToken> Tokens,
    bool IsSessionDm,
    UndoableMove? UndoableMove);

// The token the move was made on and the token's Version right after it. The undo stays
// available while the token still has this version (TokenMovedEvent.Version).
public record UndoableMove(Guid TokenId, int Version);

// BackgroundUrl stays null until AI backgrounds arrive (stage 7); the board then
// draws the plain layout.
public record BoardMap(Guid Id, string Name, int Width, int Height, MapLayout Layout, string? BackgroundUrl);

// Label: the character's name or the creature's label. OwnerUserId: the character's
// owner, null for creatures. ColorIndex: characters get a fixed ring colour by the
// order they were added to the campaign (0, 1, 2…); null for creatures, which share
// one colour. Size comes from the character or creature type. Version: see
// Token.Version; devices keep the position with the higher version.
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
    int? ColorIndex,
    int Version);
