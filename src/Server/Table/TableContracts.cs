using OreanasOffice.Server.Api;

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

    // Puts back the caller's own last move in the encounter, while it is still that
    // token's latest move, and broadcasts TokenMoved with Undo = true.
    // Errors: TokenNotFound (encounter), EncounterNotActive, NothingToUndo.
    Task<MoveResult> UndoMove(Guid encounterId);

    // The person is still at the table (they touched the screen). Resets the idle
    // timer; the device sends it at most once a minute.
    Task MarkActive();
}

// What the server sends to devices.
public interface ITableClient
{
    // A confirmed move or undo, to everyone in the encounter's group.
    Task TokenMoved(TokenMovedEvent move);

    // The session DM ended the fight, or the session with it. Everyone leaves the board.
    Task EncounterEnded(Guid encounterId);

    // Sent just before the server drops a connection idle for the configured time
    // (30 minutes). The device doesn't reconnect until the person comes back.
    Task IdleTimeout();
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

// Error is null on success.
public record HubResult(ApiErrorCode? Error);

// Move is the broadcast event on success, null with an Error.
public record MoveResult(ApiErrorCode? Error, TokenMovedEvent? Move);
