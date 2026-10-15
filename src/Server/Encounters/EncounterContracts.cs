using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Encounters;

// Request and response types for encounters and the board.

// An encounter in a session's list of fights.
public record EncounterSummaryResponse(
    Guid Id,
    string Name,
    EncounterStatus Status,
    Guid BattleMapId,
    string BattleMapName,
    int Width,
    int Height,
    int CreatureCount,
    Guid SessionId,
    DateTimeOffset CreatedAt,
    int Version,
    DateTimeOffset? ArchivedAt);

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
    Guid SessionId,
    string Name,
    EncounterStatus Status,
    BoardMap Map,
    List<BoardToken> Tokens,
    bool IsSessionDm,
    UndoableMove? UndoableMove);

// The token the move was made on and the token's Version right after it. The undo stays
// available while the token still has this version (TokenMovedEvent.Version).
public record UndoableMove(Guid TokenId, int Version);

// Background: the picture to draw under the grid, null for the plain rendering. For an
// active or ended encounter the one saved when it started, otherwise the map's picked
// background while it fits the map's size.
public record BoardMap(Guid Id, string Name, int Width, int Height, MapLayout Layout, BoardBackground? Background);

// Url: /api/assets/{id}, cacheable for good. X, Y, Width, Height: where the picture lies
// in cells, relative to the map's top-left cell (Asset.FrameX…). Padding of a map wider
// than 3:1 lies outside the map.
public record BoardBackground(Guid AssetId, string Url, int X, int Y, int Width, int Height);

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
