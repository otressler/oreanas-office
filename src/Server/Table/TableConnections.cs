using System.Collections.Concurrent;

namespace OreanasOffice.Server.Table;

// What a device is doing with its table connection (knowledge/features/spectator-view.md,
// "Spectating is a mode of the device"). The same account may play on a phone and watch on
// a tablet, so the mode belongs to the connection. A session DM's spectator or shared screen
// is in the players' group and never acts as the session DM.
public enum ConnectionMode
{
    // A signed-in member playing. The session DM's own device is in the DM group.
    Player,

    // Only watches, always, in either play mode. Members and session spectators alike.
    Spectator,

    // A member's device in local mode: moves every character, pings, sets statuses
    // (knowledge/features/shared-table.md). Only a member may open one, and only while the
    // session is in local mode; it watches only when the mode is switched back.
    SharedScreen,
}

// The table connections of this process, in memory only: after a restart every device
// reconnects (knowledge/decisions/hosting.md). Filled by WatchSession and JoinEncounter.
public sealed class TableConnections
{
    private readonly ConcurrentDictionary<string, TableConnection> _byId = new();

    public TableConnection Get(string connectionId) => _byId.GetOrAdd(connectionId, id => new TableConnection(id));

    public TableConnection? Find(string connectionId) => _byId.GetValueOrDefault(connectionId);

    public void Remove(string connectionId) => _byId.TryRemove(connectionId, out _);

    // Every connection that joined the encounter, for presence and group changes.
    public List<TableConnection> InEncounter(Guid encounterId) =>
        [.. _byId.Values.Where(c => c.EncounterId == encounterId)];

    public List<TableConnection> InSession(Guid sessionId) =>
        [.. _byId.Values.Where(c => c.SessionId == sessionId)];
}

public sealed class TableConnection(string connectionId)
{
    public string ConnectionId { get; } = connectionId;

    public Guid UserId { get; set; }

    public ConnectionMode Mode { get; set; }

    // Set by WatchSession.
    public Guid? SessionId { get; set; }

    // Set by JoinEncounter, with the group it went into.
    public Guid? EncounterId { get; set; }

    public bool InDmGroup { get; set; }
}
