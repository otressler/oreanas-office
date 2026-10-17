using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Table;

// Who is connected to an encounter (knowledge/features/shared-table.md, "Who is here"),
// built from TableConnections and never stored. STUB: the shared table lane adds the
// 10-second grace before a person greys out and raises PresenceChanged.
public sealed class TablePresence(TableConnections connections)
{
    public PresenceState Snapshot(Guid encounterId, IEnumerable<Guid> memberIds)
    {
        var inEncounter = connections.InEncounter(encounterId);
        var connected = inEncounter.Where(c => c.Mode != ConnectionMode.Spectator).Select(c => c.UserId).ToHashSet();
        var screen = inEncounter.Any(c => c.Mode != ConnectionMode.Player);
        return new PresenceState([.. memberIds.Select(id => new PresentPerson(id, connected.Contains(id)))], screen);
    }
}
