using Microsoft.AspNetCore.SignalR;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Table;

// Spectator and shared screens (knowledge/features/spectator-view.md, shared-table.md).
// Owned by the spectator lane.
public sealed partial class TableHub
{
    // Sets the connection's mode, checks access (TableWatching) and joins the session's
    // group. The database comes from a scope of its own, so the hub's constructor stays as it
    // is. A second call (another session) leaves the first session's group.
    public async Task<WatchResult> WatchSession(WatchSessionRequest request)
    {
        var scopes = Context.GetHttpContext()!.RequestServices.GetRequiredService<IServiceScopeFactory>();
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var (error, mode) = await TableWatching.AccessAsync(db, UserId, request, Context.ConnectionAborted);
        if (error is not null)
        {
            return new WatchResult(error, mode, null);
        }

        var connection = Connection;
        if (connection.SessionId is { } previous && previous != request.SessionId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, TableGroups.Session(previous), Context.ConnectionAborted);
        }

        connection.UserId = UserId;
        connection.Mode = mode;
        connection.SessionId = request.SessionId;

        // In the group before the state is read, so a fight that starts meanwhile is not missed.
        await Groups.AddToGroupAsync(Context.ConnectionId, TableGroups.Session(request.SessionId), Context.ConnectionAborted);
        var session = await TableWatching.LoadAsync(db, request.SessionId, Context.ConnectionAborted);
        return new WatchResult(session is null ? ApiErrorCode.TokenNotFound : null, mode, session);
    }
}
