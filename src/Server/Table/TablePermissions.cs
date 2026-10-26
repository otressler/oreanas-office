using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Table;

// The one permission function of the table (knowledge/features/shared-table.md): what a
// connection may do depends on its mode and the session's play mode as well as on who is
// signed in. The services call these instead of comparing user ids themselves.
public static class TablePermissions
{
    // The mode that counts now. A shared screen in a session that left local mode watches
    // only, like a spectator screen.
    public static ConnectionMode Effective(ConnectionMode mode, PlayMode playMode) =>
        mode == ConnectionMode.SharedScreen && playMode != PlayMode.Local ? ConnectionMode.Spectator : mode;

    // The session DM acts as the session DM only from a player connection: removing tokens,
    // fog, reveals, spawning, moving creatures. Spectator and shared screens never do.
    public static bool ActsAsSessionDm(ConnectionMode mode, Guid userId, Guid? sessionDmUserId) =>
        mode == ConnectionMode.Player && userId == sessionDmUserId;

    // Moves a token. Player connections: the session DM any, owners their characters. A
    // shared screen in local mode: every character, no creature.
    public static bool MayMove(ConnectionMode effective, Guid userId, Guid? sessionDmUserId, TokenKind kind, Guid? ownerUserId) =>
        effective switch
        {
            ConnectionMode.Player => userId == sessionDmUserId || (kind == TokenKind.Character && ownerUserId == userId),
            ConnectionMode.SharedScreen => kind == TokenKind.Character,
            _ => false,
        };

    // Pings, arrows and token statuses: everything except a spectator screen.
    public static bool MayPoint(ConnectionMode effective) => effective != ConnectionMode.Spectator;

    // Undo of a move is the connection's own kind: a shared screen undoes the last move made
    // from a shared screen, everyone else their own last move made from a player connection.
    public static bool UndoesSharedScreenMoves(ConnectionMode effective) => effective == ConnectionMode.SharedScreen;
}
