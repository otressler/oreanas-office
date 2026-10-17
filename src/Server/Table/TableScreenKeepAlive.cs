using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Table;

// The idle-timeout exemption of spectator and shared screens (knowledge/features/
// spectator-view.md, "Connection and costs"): nobody touches the tablet in the middle of the
// table, so while its session is active it stays connected. A planned session's screen keeps
// the usual timeout. Asked only when a connection has become an idle candidate, and the
// session's status is remembered for a few minutes, so nothing polls the database.
public sealed class TableScreenKeepAlive(TableConnections connections, IServiceScopeFactory scopes, TimeProvider time)
{
    public static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(3);

    private readonly ConcurrentDictionary<Guid, (SessionStatus Status, DateTimeOffset At)> _status = new();

    // The decision: only screens, and only while their session is active.
    public static bool Exempt(ConnectionMode mode, SessionStatus? status) =>
        mode is ConnectionMode.Spectator or ConnectionMode.SharedScreen && status == SessionStatus.Active;

    public async Task<bool> KeepsAsync(string connectionId, CancellationToken cancellationToken)
    {
        if (connections.Find(connectionId) is not { Mode: not ConnectionMode.Player, SessionId: { } sessionId } connection)
        {
            return false;
        }

        return Exempt(connection.Mode, await StatusAsync(sessionId, cancellationToken));
    }

    private async Task<SessionStatus?> StatusAsync(Guid sessionId, CancellationToken cancellationToken)
    {
        var now = time.GetUtcNow();
        if (_status.TryGetValue(sessionId, out var known) && now - known.At < CacheFor)
        {
            return known.Status;
        }

        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var status = await db.Sessions
            .Where(s => s.Id == sessionId)
            .Select(s => (SessionStatus?)s.Status)
            .SingleOrDefaultAsync(cancellationToken);
        if (status is { } found)
        {
            _status[sessionId] = (found, now);
        }

        return status;
    }
}
