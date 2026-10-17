using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Table;

// Who is connected to an encounter (knowledge/features/shared-table.md, "Who's here"),
// built from the live TableConnections and never stored. The row holds the session DM, the
// owner of every character in the fight and every other member connected, each once however
// many devices they use. A person losing their last connection still counts as connected
// for the grace period (10 seconds), so a quick reconnect doesn't flicker; the grace is a
// small in-memory map and a timer, never the database. Spectator and shared screens are
// never the person; they only make SharedScreen true while at least one is in the encounter.
//
// The hub calls JoinedAsync after JoinEncounter and DisconnectedAsync from
// OnDisconnectedAsync; code that puts a spectator or shared screen into an encounter some
// other way calls ChangedAsync. All three raise PresenceChanged to the whole encounter when
// the computed state differs from the one last sent.
public sealed class TablePresence(
    TableConnections connections,
    TableBroadcaster broadcaster,
    IServiceScopeFactory scopes,
    TimeProvider time,
    IOptions<TableOptions> options)
{
    // Who counts for an encounter, loaded when a device joins (hub calls may use the
    // database; the grace timer must not).
    private sealed record Roster(Guid? DmUserId, HashSet<Guid> Owners, List<Guid> Members);

    private readonly object _lock = new();
    private readonly Dictionary<Guid, Roster> _rosters = [];
    private readonly Dictionary<Guid, PresenceState> _published = [];
    // When a person's last player connection in an encounter closed.
    private readonly Dictionary<(Guid EncounterId, Guid UserId), DateTimeOffset> _gone = [];
    private readonly ConcurrentDictionary<(Guid EncounterId, Guid UserId), ITimer> _timers = new();

    private TimeSpan Grace => options.Value.PresenceGrace;

    // The state for the board. The caller supplies the people it already loaded: the session
    // DM, the owners of the fight's characters and the campaign's members in the order they
    // joined.
    public PresenceState Snapshot(
        Guid encounterId, Guid? sessionDmUserId, IEnumerable<Guid> characterOwnerUserIds, IEnumerable<Guid> memberIds)
    {
        lock (_lock)
        {
            return Compute(encounterId, sessionDmUserId, [.. characterOwnerUserIds], [.. memberIds]);
        }
    }

    // A device joined the encounter as a player, spectator screen or shared screen.
    public async Task JoinedAsync(Guid encounterId, CancellationToken cancellationToken)
    {
        var roster = await LoadRosterAsync(encounterId, cancellationToken);
        if (roster is null)
        {
            return;
        }

        lock (_lock)
        {
            _rosters[encounterId] = roster;
            foreach (var connection in connections.InEncounter(encounterId).Where(c => c.Mode == ConnectionMode.Player))
            {
                _gone.Remove((encounterId, connection.UserId));
            }
        }

        await ChangedAsync(encounterId);
    }

    // A connection closed. Call it after the connection left TableConnections, with what it was.
    public async Task DisconnectedAsync(Guid encounterId, Guid userId, ConnectionMode mode)
    {
        if (mode == ConnectionMode.Player
            && !connections.InEncounter(encounterId).Any(c => c.Mode == ConnectionMode.Player && c.UserId == userId))
        {
            var key = (encounterId, userId);
            lock (_lock)
            {
                _gone[key] = time.GetUtcNow();
            }

            var timer = time.CreateTimer(_ => _ = GraceOverAsync(encounterId), null, Grace, Timeout.InfiniteTimeSpan);
            if (_timers.TryGetValue(key, out var older))
            {
                older.Dispose();
            }

            _timers[key] = timer;
        }

        await ChangedAsync(encounterId);
    }

    // Raises PresenceChanged when the state is not what the encounter was last told.
    public async Task ChangedAsync(Guid encounterId)
    {
        PresenceChangedEvent changed;
        lock (_lock)
        {
            if (!_rosters.TryGetValue(encounterId, out var roster))
            {
                return;
            }

            var state = Compute(encounterId, roster.DmUserId, roster.Owners, roster.Members);
            if (_published.TryGetValue(encounterId, out var last) && Same(last, state))
            {
                return;
            }

            _published[encounterId] = state;
            changed = new PresenceChangedEvent(encounterId, state);
        }

        await broadcaster.Everyone(encounterId).PresenceChanged(changed);
    }

    private async Task GraceOverAsync(Guid encounterId)
    {
        try
        {
            await ChangedAsync(encounterId);
            if (connections.InEncounter(encounterId).Count == 0)
            {
                Forget(encounterId);
            }
        }
        catch (Exception)
        {
            // A timer must never take the process down; the next change raises it again.
        }
    }

    // Nobody is left in the encounter: drop what was kept for it.
    private void Forget(Guid encounterId)
    {
        lock (_lock)
        {
            _rosters.Remove(encounterId);
            _published.Remove(encounterId);
            foreach (var key in _gone.Keys.Where(k => k.EncounterId == encounterId).ToList())
            {
                _gone.Remove(key);
                if (_timers.TryRemove(key, out var timer))
                {
                    timer.Dispose();
                }
            }
        }
    }

    private PresenceState Compute(Guid encounterId, Guid? dmUserId, HashSet<Guid> owners, List<Guid> members)
    {
        var inEncounter = connections.InEncounter(encounterId);
        var live = inEncounter.Where(c => c.Mode == ConnectionMode.Player).Select(c => c.UserId).ToHashSet();
        var now = time.GetUtcNow();
        bool Connected(Guid userId) =>
            live.Contains(userId) || (_gone.TryGetValue((encounterId, userId), out var at) && now - at < Grace);

        var people = members
            .Distinct()
            .Where(id => id == dmUserId || owners.Contains(id) || Connected(id))
            .Select(id => new PresentPerson(id, Connected(id), id == dmUserId))
            .ToList();
        return new PresenceState(people, inEncounter.Any(c => c.Mode != ConnectionMode.Player));
    }

    private static bool Same(PresenceState a, PresenceState b) =>
        a.SharedScreen == b.SharedScreen && a.People.SequenceEqual(b.People);

    private async Task<Roster?> LoadRosterAsync(Guid encounterId, CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var encounter = await db.Encounters.AsNoTracking()
            .Where(e => e.Id == encounterId)
            .Select(e => new
            {
                e.CampaignId,
                DmUserId = (Guid?)e.Session.DmUserId,
                Owners = e.Tokens.Where(t => t.CharacterId != null).Select(t => t.Character!.OwnerUserId).Distinct().ToList(),
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (encounter is null)
        {
            return null;
        }

        var members = await db.CampaignMembers.AsNoTracking()
            .Where(m => m.CampaignId == encounter.CampaignId)
            .OrderBy(m => m.JoinedAt)
            .ThenBy(m => m.UserId)
            .Select(m => m.UserId)
            .ToListAsync(cancellationToken);
        return new Roster(encounter.DmUserId, [.. encounter.Owners], members);
    }
}
