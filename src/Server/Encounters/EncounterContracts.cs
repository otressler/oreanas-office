using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Table;
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
    List<BoardPerson> People,
    BoardViewer Viewer,
    FogView? Fog,
    PlayMode PlayMode,
    PresenceState Presence,
    InitiativeView? Initiative = null);

// The initiative list on the session DM's board (knowledge/features/initiative.md); null on
// every other board. Version: InitiativeVersion; devices keep the list with the higher
// version. Entries: in turn order, null while initiative is off. Entries of removed tokens
// stay listed; devices leave them out until the token is back.
public record InitiativeView(int Version, List<InitiativeEntry>? Entries);

// Who the board was built for (knowledge/features/fog-of-war.md, "Keeping secrets on the
// wire"). Dm: the session DM's own device, which sees everything. Player: everyone else, and
// any connection that asked for the players' view (?view=player: spectator and shared
// screens, also when signed in as the session DM). A Player board has no hidden creature,
// no layout of a hidden cell, no areas and no removed tokens, and IsSessionDm is false.
public enum BoardViewer
{
    Dm,
    Player,
}

// Fog as a device gets it. Version: FogVersion; devices keep the fog with the higher
// version. HiddenCells: the DM's and the players' alike. Areas: the DM only (empty for
// players).
public record FogView(int Version, List<BoardCell> HiddenCells, List<FogArea> Areas);

// Who is connected to the fight right now (knowledge/features/shared-table.md), built from
// live connections and never stored. SharedScreen: a spectator screen is connected to the
// session (the table icon).
public record PresenceState(List<PresentPerson> People, bool SharedScreen);

// A person (campaign member) in the row of avatars; Connected is false when none of their
// devices is, for longer than the 10-second grace. IsSessionDm: the avatar gets the gold ring.
public record PresentPerson(Guid UserId, bool Connected, bool IsSessionDm);

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
// background while it fits the map's size. Grid: how the grid is drawn over the picture.
public record BoardMap(
    Guid Id,
    string Name,
    int Width,
    int Height,
    MapLayout Layout,
    BoardBackground? Background,
    MapGridStyle Grid = MapGridStyle.Normal);

// Url: /api/assets/{id}, cacheable for good. X, Y, Width, Height: where the unturned picture
// lies in cells, relative to the map's top-left cell (the DM's BackgroundPlacement, or the
// asset's frame). Rotation: degrees clockwise around the picture's centre. Padding of a map
// wider than 3:1 lies outside the map.
public record BoardBackground(Guid AssetId, string Url, double X, double Y, double Width, double Height, double Rotation);

// Label: the character's name or the creature's label. OwnerUserId: who plays the
// character in this session, its owner unless the session DM handed it to someone else
// (CharacterPlayers); null for creatures. ColorIndex: characters get a fixed ring colour by the
// order they were added to the campaign (0, 1, 2…); null for creatures, which share
// one colour. Color: the ring colour the character's player picked ("#rrggbb"), which
// replaces the one ColorIndex gives; null for that default and for creatures. Size
// comes from the character or creature type. Version: see
// Token.Version; devices keep the position with the higher version. ImageUrl: the
// character's or creature type's picked portrait or icon as it is now, also in a running
// fight (knowledge/features/token-icons.md); null for the letter. Label of a creature:
// CreatureLabels.Display, the type name and number or the DM's own name; an unseen creature
// has no number (knowledge/features/fog-of-war.md). Hidden: only on a Dm board. Statuses: in the order
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
    DateTimeOffset? RemovedAt = null,
    bool Hidden = false);

// A status on a token. Level: 1-6 for statuses with levels, else null. AppliedByUserId:
// who put it on (the card's "von Eli"); a player may remove only their own. FromSharedScreen:
// put on from a shared screen (the card says "Tisch"); only a shared screen removes it
// (knowledge/features/shared-table.md).
public record BoardTokenStatus(Guid StatusId, int? Level, Guid AppliedByUserId, DateTimeOffset AppliedAt, bool FromSharedScreen);
