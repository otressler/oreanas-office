using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Statuses;

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
// undo it; null otherwise. Tokens leaves out removed tokens (knowledge/features/removing-tokens.md);
// RemovedTokens lists them, newest first, for the session DM only and empty for everyone
// else. Statuses: the definitions of every status on Tokens and RemovedTokens. People:
// every campaign member, for names on pings and the token card and the colour they ping in.
public record BoardStateResponse(
    Guid EncounterId,
    Guid CampaignId,
    Guid SessionId,
    string Name,
    EncounterStatus Status,
    BoardMap Map,
    List<BoardToken> Tokens,
    bool IsSessionDm,
    UndoableMove? UndoableMove,
    List<BoardToken> RemovedTokens,
    List<StatusDefinitionView> Statuses,
    List<BoardPerson> People);

// PingColor: "#rrggbb" (knowledge/features/pings-and-arrows.md, "Colours"): the session
// DM's fixed gold; a player's first character in this fight (by the order characters were
// added to the campaign), in its ring colour; white for anyone else. The server sends the
// same colour with every ping and arrow of the person.
public record BoardPerson(Guid UserId, string DisplayName, string PingColor);

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
// one colour. Color: the ring colour the character's player picked ("#rrggbb"), which
// replaces the one ColorIndex gives; null for that default and for creatures. Size
// comes from the character or creature type. Version: see
// Token.Version; devices keep the position with the higher version. ImageUrl: the
// character's or creature type's picked portrait or icon as it is now, also in a running
// fight (knowledge/features/token-icons.md); null for the letter. Statuses: in the order
// they were put on (knowledge/features/statuses.md). RemovedAt: set only on
// BoardStateResponse.RemovedTokens.
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
    int Version,
    string? ImageUrl,
    string? Color,
    List<BoardTokenStatus> Statuses,
    DateTimeOffset? RemovedAt = null);

// A status on a token. Level: 1-6 for statuses with levels, else null. AppliedByUserId:
// who put it on (the card's "von Eli"); a player may remove only their own.
public record BoardTokenStatus(Guid StatusId, int? Level, Guid AppliedByUserId, DateTimeOffset AppliedAt);
