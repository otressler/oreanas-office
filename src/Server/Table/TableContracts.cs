using OreanasOffice.Server.Api;
using OreanasOffice.Server.Encounters;
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
