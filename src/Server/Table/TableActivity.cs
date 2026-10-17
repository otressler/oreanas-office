using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;

namespace OreanasOffice.Server.Table;

// When each table connection last did something: connecting and every call, MarkActive
// included. Messages the server sends don't count. In memory only: after a restart
// every device reconnects anyway (knowledge/decisions/realtime-sync.md).
public sealed class TableActivity(TimeProvider time)
{
    private readonly ConcurrentDictionary<string, Connection> _connections = new();

    public void Connected(HubCallerContext context) =>
        _connections[context.ConnectionId] = new Connection(context, time.GetUtcNow());

    public void Touched(string connectionId)
    {
        if (_connections.TryGetValue(connectionId, out var connection))
        {
            connection.LastActive = time.GetUtcNow();
        }
    }

    public void Disconnected(string connectionId) => _connections.TryRemove(connectionId, out _);

    // Connections idle for at least `timeout`. Each is handed out once: it leaves the
    // list here, so a slow disconnect doesn't get a second IdleTimeout.
    public List<HubCallerContext> TakeIdle(TimeSpan timeout)
    {
        var cutoff = time.GetUtcNow() - timeout;
        var idle = new List<HubCallerContext>();
        foreach (var (id, connection) in _connections)
        {
            if (connection.LastActive <= cutoff && _connections.TryRemove(id, out _))
            {
                idle.Add(connection.Context);
            }
        }

        return idle;
    }

    private sealed class Connection(HubCallerContext context, DateTimeOffset lastActive)
    {
        private long _lastActiveTicks = lastActive.UtcTicks;

        public HubCallerContext Context { get; } = context;

        // Written by the connection's calls, read by the idle check.
        public DateTimeOffset LastActive
        {
            get => new(Interlocked.Read(ref _lastActiveTicks), TimeSpan.Zero);
            set => Interlocked.Exchange(ref _lastActiveTicks, value.UtcTicks);
        }
    }
}

// Notes connects, calls and disconnects of the table hub in TableActivity.
public sealed class TableActivityFilter(TableActivity activity) : IHubFilter
{
    public Task OnConnectedAsync(HubLifetimeContext context, Func<HubLifetimeContext, Task> next)
    {
        activity.Connected(context.Context);
        return next(context);
    }

    public ValueTask<object?> InvokeMethodAsync(
        HubInvocationContext invocationContext, Func<HubInvocationContext, ValueTask<object?>> next)
    {
        activity.Touched(invocationContext.Context.ConnectionId);
        return next(invocationContext);
    }

    public Task OnDisconnectedAsync(
        HubLifetimeContext context, Exception? exception, Func<HubLifetimeContext, Exception?, Task> next)
    {
        activity.Disconnected(context.Context.ConnectionId);
        return next(context, exception);
    }
}

// Drops connections idle for TableOptions.IdleTimeout, so a forgotten tab doesn't keep
// the container awake: IdleTimeout() first, then the connection is closed without a
// reconnect. Looks every IdleCheckInterval; touches the database only to ask whether an idle
// screen's session is still active (TableScreenKeepAlive).
public sealed class TableIdleTimeout(
    TableActivity activity,
    TableScreenKeepAlive screens,
    IHubContext<TableHub, ITableClient> hub,
    IOptions<TableOptions> options,
    TimeProvider time,
    ILogger<TableIdleTimeout> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(options.Value.IdleCheckInterval, time);
        try
        {
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                var idle = await DropScreensOfRunningSessionsAsync(activity.TakeIdle(options.Value.IdleTimeout), stoppingToken);
                if (idle.Count == 0)
                {
                    continue;
                }

                foreach (var connection in idle)
                {
                    await NotifyAsync(connection);
                }

                // Closing at once could cut off the message, and a device that never got
                // it would reconnect and keep the container awake.
                await Task.Delay(CloseDelay, time, stoppingToken);
                foreach (var connection in idle)
                {
                    connection.Abort();
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
        }
    }

    // Spectator and shared screens of an active session stay (TableScreenKeepAlive): they go
    // back into the activity list, as if just touched, and are looked at again after another
    // timeout.
    private async Task<List<HubCallerContext>> DropScreensOfRunningSessionsAsync(
        List<HubCallerContext> idle, CancellationToken cancellationToken)
    {
        var dropped = new List<HubCallerContext>();
        foreach (var connection in idle)
        {
            if (await KeepsAsync(connection, cancellationToken))
            {
                activity.Connected(connection);
            }
            else
            {
                dropped.Add(connection);
            }
        }

        return dropped;
    }

    private async Task<bool> KeepsAsync(HubCallerContext connection, CancellationToken cancellationToken)
    {
        try
        {
            return await screens.KeepsAsync(connection.ConnectionId, cancellationToken);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Could not check the session of {ConnectionId}", connection.ConnectionId);
            return false;
        }
    }

    private static readonly TimeSpan CloseDelay = TimeSpan.FromSeconds(1);

    private async Task NotifyAsync(HubCallerContext connection)
    {
        try
        {
            await hub.Clients.Client(connection.ConnectionId).IdleTimeout();
        }
        catch (Exception ex)
        {
            // The connection may be gone already; it is closed either way.
            logger.LogDebug(ex, "Could not send IdleTimeout to {ConnectionId}", connection.ConnectionId);
        }
    }
}
