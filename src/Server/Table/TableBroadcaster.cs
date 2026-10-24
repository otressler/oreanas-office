using Microsoft.AspNetCore.SignalR;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Table;

// The hub groups (knowledge/features/fog-of-war.md, "Keeping secrets on the wire"). Each
// encounter has two: the session DM's player connections, and everyone else, spectator and
// shared screens always among the others. A session has one more, for screens waiting for
// fights and for the session page.
public static class TableGroups
{
    public static string Dm(Guid encounterId) => $"encounter:{encounterId}:dm";

    public static string Players(Guid encounterId) => $"encounter:{encounterId}:players";

    public static string Session(Guid sessionId) => $"session:{sessionId}";
}

// Sends hub messages from outside the hub (endpoints, services). Anything about tokens or
// cells that a player mustn't know goes through TableVisibility first and then to one group
// only; events that carry nothing secret use Everyone.
public sealed class TableBroadcaster(IHubContext<TableHub, ITableClient> hub)
{
    public IHubContext<TableHub, ITableClient> Hub { get; } = hub;

    // Both groups of the encounter: the same message for everyone in the fight.
    public ITableClient Everyone(Guid encounterId) =>
        Hub.Clients.Groups(TableGroups.Dm(encounterId), TableGroups.Players(encounterId));

    public ITableClient Dm(Guid encounterId) => Hub.Clients.Group(TableGroups.Dm(encounterId));

    public ITableClient Players(Guid encounterId) => Hub.Clients.Group(TableGroups.Players(encounterId));

    public ITableClient InSession(Guid sessionId) => Hub.Clients.Group(TableGroups.Session(sessionId));

    // The fight is over: its table and the session's screens hear it.
    public async Task EncounterEndedAsync(Guid sessionId, Guid encounterId)
    {
        await Everyone(encounterId).EncounterEnded(encounterId);
        await InSession(sessionId).EncounterEnded(encounterId);
    }

    public Task EncounterStartedAsync(Guid sessionId, Guid encounterId) =>
        InSession(sessionId).EncounterStarted(new EncounterStartedEvent(sessionId, encounterId));

    public Task SessionEndedAsync(Guid sessionId) => InSession(sessionId).SessionEnded(sessionId);

    public Task PlayModeChangedAsync(Guid sessionId, PlayMode playMode) =>
        InSession(sessionId).PlayModeChanged(new PlayModeChangedEvent(sessionId, playMode));
}
