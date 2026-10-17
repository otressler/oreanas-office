using OreanasOffice.Server.Api;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Statuses;

namespace OreanasOffice.Server.Table;

// The live table's SignalR contract (knowledge/decisions/realtime-sync.md). The hub is
// at TableHub.Path; the frontend twin is src/web/src/table/hub.ts. Method names travel
// as written here, and the build lists them in openapi.json as TableHubMethod and
// TableClientMethod, so both sides are checked against one document.
//
// Order on every (re)connect: JoinEncounter, then GET the board. Moves broadcast in
// between can arrive before the board; the token Version decides which position is newer.

// What a device may call.
public interface ITableHub
{
    // Adds the connection to the encounter's group. Any campaign member, only while
    // the encounter is active. Errors: TokenNotFound for an encounter the caller can't
    // see (not a member, wrong id), EncounterNotActive.
    Task<HubResult> JoinEncounter(Guid encounterId);

    // Moves a token after the permission and target checks, saves the move and its
    // history, then broadcasts TokenMoved to the encounter's group, the caller included.
    // Errors: TokenNotFound, EncounterNotActive, NotYourToken, TargetInvalid.
    Task<MoveResult> MoveToken(MoveTokenRequest request);

    // Shows the others where the caller is about to move a token, before they confirm:
    // the same checks as MoveToken, then MovePreviewed to the encounter's group, the
    // caller left out. One preview per connection; a new one replaces it. Kept in memory
    // only and cleared by MoveToken, ClearPreview or a disconnect.
    // Errors: TokenNotFound, EncounterNotActive, NotYourToken, TargetInvalid.
    Task<HubResult> PreviewMove(MoveTokenRequest request);

    // The caller let go of the token without moving it: MovePreviewCleared to the others.
    Task ClearPreview();

    // Puts back the caller's own last move in the encounter, while it is still that
    // token's latest move, and broadcasts TokenMoved with Undo = true.
    // Errors: TokenNotFound (encounter), EncounterNotActive, NothingToUndo.
    Task<MoveResult> UndoMove(Guid encounterId);

    // The person is still at the table (they touched the screen). Resets the idle
    // timer; the device sends it at most once a minute.
    Task MarkActive();

    // Points at a cell or a token (knowledge/features/pings-and-arrows.md): Pinged to the
    // others in the encounter, with the colour the server sets. Not saved. Any campaign
    // member while the encounter is active. More than three pings and arrows per person in
    // two seconds are dropped without an error. Errors: TokenNotFound (encounter, or a
    // token not on its board), EncounterNotActive, TargetInvalid (a cell outside the map,
    // or not exactly one of Cell and TokenId).
    Task<HubResult> Ping(PingRequest request);

    // An arrow from a cell or a token to a cell: ArrowDrawn to the others. A person has
    // one arrow at a time; devices replace the person's older one. Same rules and errors
    // as Ping.
    Task<HubResult> DrawArrow(DrawArrowRequest request);

    // Puts a status on a token (knowledge/features/statuses.md): the session DM on any
    // token, everyone else on their own characters and on creatures. Saved, then
    // TokenStatusesChanged to the encounter's group, the caller included. A status with
    // levels starts at Level, or 1 without one. Errors: TokenNotFound, EncounterNotActive,
    // NotYourToken, StatusNotFound (not a library status or a custom status of the
    // campaign), StatusAlreadySet, LevelInvalid.
    Task<StatusResult> AddStatus(AddStatusRequest request);

    // Takes a status off: the session DM any, everyone else the ones they put on.
    // Errors: TokenNotFound, EncounterNotActive, StatusNotFound (not on the token),
    // NotYourStatus.
    Task<StatusResult> RemoveStatus(RemoveStatusRequest request);

    // Changes a status's level, for whoever may remove it. Errors: as RemoveStatus, and
    // LevelInvalid.
    Task<StatusResult> SetStatusLevel(SetStatusLevelRequest request);

    // Takes a token off the board (knowledge/features/removing-tokens.md): the session DM
    // only. Saved with RemovedAt, then TokenRemoved to the group, the caller included; the
    // token's move previews are cleared. Errors: TokenNotFound (also when already
    // removed), EncounterNotActive, NotSessionDm.
    Task<HubResult> RemoveToken(Guid tokenId);

    // Puts a removed token back on the cell it left: TokenRestored to the group, the
    // caller included. Errors: TokenNotFound (also when not removed), EncounterNotActive,
    // NotSessionDm.
    Task<HubResult> RestoreToken(Guid tokenId);

    // --- Stage 10: spectators, shared screens, fog and spawning ---

    // Makes the connection a screen of one session (knowledge/features/spectator-view.md):
    // a spectator screen, or with SharedScreen a shared screen
    // (knowledge/features/shared-table.md). Call it before JoinEncounter; a connection that
    // never calls it is a player. Joins the session's group, so the screen hears
    // EncounterStarted, EncounterEnded, SessionEnded and PlayModeChanged. Members of the
    // campaign and session spectators may watch; only members may open a shared screen, and
    // only while the session is in local mode. A spectator or shared screen is always in the
    // players' group, whoever is signed in. Errors: TokenNotFound (no access to the session),
    // NotLocalMode.
    Task<WatchResult> WatchSession(WatchSessionRequest request);

    // Session DM only (from a player connection). Hides or reveals cells of the encounter's
    // fog; saved with FogVersion + 1 and an EncounterChange, then FogChanged to each group
    // built for it (knowledge/features/fog-of-war.md). Errors: TokenNotFound,
    // EncounterNotActive, NotSessionDm, FogInvalid (cells outside the map, or no fog).
    Task<HubResult> ChangeFog(ChangeFogRequest request);

    // Session DM only. Reveals or hides creatures: TokenRevealed or TokenHidden per token,
    // numbering creatures at first sight. Errors: TokenNotFound, EncounterNotActive,
    // NotSessionDm.
    Task<HubResult> SetTokensHidden(SetTokensHiddenRequest request);

    // Session DM only (knowledge/features/creature-spawn.md). Saves all creatures in one
    // step, then TokensAdded to each group with the ones it may see. Errors: TokenNotFound,
    // EncounterNotActive, NotSessionDm, SpawnInvalid, TargetInvalid.
    Task<SpawnResult> SpawnCreatures(SpawnCreaturesRequest request);

    // Session DM only. Takes back the session DM's latest fog change, reveal or spawn in the
    // encounter while it isn't undone. Errors: TokenNotFound, EncounterNotActive,
    // NotSessionDm, NothingToUndo.
    Task<HubResult> UndoChange(Guid encounterId);
}

// What the server sends to devices.
public interface ITableClient
{
    // A confirmed move or undo, to everyone in the encounter's group.
    Task TokenMoved(TokenMovedEvent move);

    // Someone is about to move a token there (PreviewMove). Also sent to a device
    // when it joins, for every preview already shown.
    Task MovePreviewed(MovePreviewEvent preview);

    // A preview is gone: moved, let go of, or the device disconnected.
    Task MovePreviewCleared(MovePreviewClearedEvent cleared);

    // The session DM ended the fight, or the session with it. Everyone leaves the board.
    Task EncounterEnded(Guid encounterId);

    // Sent just before the server drops a connection idle for the configured time
    // (30 minutes). The device doesn't reconnect until the person comes back.
    Task IdleTimeout();

    // Someone else pointed at a cell or a token. The sender's own device shows it at once.
    Task Pinged(PingedEvent ping);

    // Someone else drew an arrow; it replaces their older one.
    Task ArrowDrawn(ArrowDrawnEvent arrow);

    // A token's statuses changed: its whole list, so devices never merge.
    Task TokenStatusesChanged(TokenStatusesChangedEvent change);

    // The session DM took a token off the board; devices fade it out.
    Task TokenRemoved(TokenRemovedEvent removed);

    // A removed token is back, with its statuses; devices fade it in.
    Task TokenRestored(TokenRestoredEvent restored);

    // --- Stage 10 ---

    // Session group: the session DM started a fight; screens join it by themselves.
    Task EncounterStarted(EncounterStartedEvent started);

    // Session group: the session ended; screens show "Sitzung beendet" and disconnect.
    Task SessionEnded(Guid sessionId);

    // Session group: the session DM changed the play mode. Nothing reloads.
    Task PlayModeChanged(PlayModeChangedEvent changed);

    // Both groups of the encounter: who is connected changed (after the 10-second grace).
    Task PresenceChanged(PresenceChangedEvent presence);

    // Fog changed. Built per group: the DM gets the plain change, players get the layout of
    // newly revealed cells and the creatures that appear or disappear.
    Task FogChanged(FogChangedEvent changed);

    // A creature became visible to players, or its flags changed for the DM. Players get the
    // whole token, as if it were added; the DM gets the token with Hidden false.
    Task TokenRevealed(TokenRevealedEvent revealed);

    // A creature was hidden again. Players get only the id.
    Task TokenHidden(TokenHiddenEvent hidden);

    // Spawned creatures: players only those they may see, the DM all.
    Task TokensAdded(TokensAddedEvent added);

    // What a device may see changed under it (a hand-over of the session DM): leave the
    // groups with JoinEncounter again and reload the board.
    Task ReloadBoard(Guid encounterId);
}

// The top-left cell the token should stand on.
public record MoveTokenRequest(Guid TokenId, int X, int Y);

// The token's new position. Version counts the token's moves and undos; a device keeps
// whichever position has the higher version, from events or a board reload. ByUserId:
// who moved it. Undo: this puts a move back.
public record TokenMovedEvent(
    Guid EncounterId,
    Guid TokenId,
    int X,
    int Y,
    decimal Elevation,
    int Version,
    Guid ByUserId,
    bool Undo);

// Where ByUserId is about to move the token: its top-left cell, not yet confirmed.
public record MovePreviewEvent(Guid EncounterId, Guid TokenId, int X, int Y, Guid ByUserId);

// Takes back the MovePreviewEvent with the same token and user.
public record MovePreviewClearedEvent(Guid EncounterId, Guid TokenId, Guid ByUserId);

// Error is null on success.
public record HubResult(ApiErrorCode? Error);

// Move is the broadcast event on success, null with an Error.
public record MoveResult(ApiErrorCode? Error, TokenMovedEvent? Move);

// A cell of the board: column X, row Y from the map's top-left cell.
public record BoardCell(int X, int Y);

// Exactly one of Cell and TokenId.
public record PingRequest(Guid EncounterId, BoardCell? Cell, Guid? TokenId);

// From exactly one of FromCell and FromTokenId, to a cell.
public record DrawArrowRequest(Guid EncounterId, BoardCell? FromCell, Guid? FromTokenId, BoardCell To);

// Color: "#rrggbb", set by the server (BoardPerson.PingColor of UserId).
public record PingedEvent(Guid EncounterId, Guid UserId, string Color, BoardCell? Cell, Guid? TokenId);

public record ArrowDrawnEvent(Guid EncounterId, Guid UserId, string Color, BoardCell? FromCell, Guid? FromTokenId, BoardCell To);

// Level: only for statuses with levels, 1 to 6; null means 1.
public record AddStatusRequest(Guid TokenId, Guid StatusId, int? Level);

public record RemoveStatusRequest(Guid TokenId, Guid StatusId);

public record SetStatusLevelRequest(Guid TokenId, Guid StatusId, int Level);

// Statuses: the token's whole list, in the order they were put on. Definitions: the
// definitions they use, so a custom status new to the device can be drawn.
public record TokenStatusesChangedEvent(
    Guid EncounterId,
    Guid TokenId,
    List<BoardTokenStatus> Statuses,
    List<StatusDefinitionView> Definitions);

// Change is the broadcast event on success, null with an Error.
public record StatusResult(ApiErrorCode? Error, TokenStatusesChangedEvent? Change);

public record TokenRemovedEvent(Guid EncounterId, Guid TokenId, Guid ByUserId, DateTimeOffset RemovedAt);

// Token: as on the board, back on the cell it left, with its statuses and their definitions.
public record TokenRestoredEvent(Guid EncounterId, BoardToken Token, List<StatusDefinitionView> Definitions);

// --- Stage 10 ---

// Session: what a screen needs before and between fights. Characters: the campaign's, for
// the waiting state (name and portrait).
public record WatchSessionRequest(Guid SessionId, bool SharedScreen);

public record WatchedSession(
    Guid SessionId,
    Guid CampaignId,
    string Title,
    DateOnly Date,
    SessionStatus Status,
    PlayMode PlayMode,
    Guid? ActiveEncounterId,
    List<WatchedCharacter> Characters);

public record WatchedCharacter(string Name, string? ImageUrl, string? Color, int ColorIndex);

// Mode is what the connection became; Session is null with an Error.
public record WatchResult(ApiErrorCode? Error, ConnectionMode Mode, WatchedSession? Session);

public record EncounterStartedEvent(Guid SessionId, Guid EncounterId);

public record PlayModeChangedEvent(Guid SessionId, PlayMode PlayMode);

public record PresenceChangedEvent(Guid EncounterId, PresenceState Presence);

// Reveal: true uncovers the cells, false covers them. Cells: the cells that changed.
public record ChangeFogRequest(Guid EncounterId, List<BoardCell> Cells, bool Reveal);

// Version: FogVersion after the change. Cells and Reveal as requested. Players only:
// RevealedLayout holds the newly revealed cells, features and entrances (whole features,
// revealed entrance cells), Appeared the creatures now visible and Disappeared the ids of
// those that stopped being visible. The DM's event has those empty, and Numbered lists the
// creatures that just got their number (knowledge/features/fog-of-war.md, "Creature numbers").
public record FogChangedEvent(
    Guid EncounterId,
    int Version,
    bool Reveal,
    List<BoardCell> Cells,
    MapLayout? RevealedLayout,
    List<BoardToken> Appeared,
    List<Guid> Disappeared,
    List<TokenNumber> Numbered);

public record TokenNumber(Guid TokenId, int Number, string Label);

public record SetTokensHiddenRequest(Guid EncounterId, List<Guid> TokenIds, bool Hidden);

// Token: as the receiving group may know it, with the label numbered if it just became visible.
public record TokenRevealedEvent(Guid EncounterId, BoardToken Token);

public record TokenHiddenEvent(Guid EncounterId, Guid TokenId);

public record SpawnCreaturesRequest(Guid EncounterId, List<SpawnedCreature> Creatures, bool Hidden);

// The top-left cell of the new token.
public record SpawnedCreature(Guid CreatureTypeId, int X, int Y);

// TokenIds: the new tokens, for the undo bar. Null with an Error.
public record SpawnResult(ApiErrorCode? Error, List<Guid>? TokenIds);

public record TokensAddedEvent(Guid EncounterId, List<BoardToken> Tokens);
