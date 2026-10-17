using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;

namespace OreanasOffice.Server.Table;

// The live table: two groups per active encounter, the session DM's player connections and
// everyone else (TableGroups), plus a group per session for screens
// (knowledge/decisions/realtime-sync.md, knowledge/features/fog-of-war.md).
// Every call checks permissions against the database, like the HTTP policies, so a new
// session DM applies at once. The rules live in TableMoves, TableStatuses, TableRemovals
// and TablePings; the hub saves first, then broadcasts. TableActivity counts every call as
// activity for the idle timeout. Move previews go only to the others and live in
// TablePreviews until the move, a cancel, the token's removal or the connection's end.
// Pings and arrows go only to the others and are never saved.
//
// The hub is split by feature so lanes don't edit the same file: TableHub.Spectators.cs
// (WatchSession), TableHub.Fog.cs (ChangeFog, SetTokensHidden, UndoChange) and
// TableHub.Spawn.cs (SpawnCreatures). A spectator connection, or a shared screen outside
// local mode, can only watch: its calls fail with ReadOnlyConnection.
[Authorize]
public sealed partial class TableHub(
    TableMoves moves,
    TablePreviews previews,
    TableStatuses statuses,
    TableRemovals removals,
    TablePings pings,
    TablePingLimiter pingLimiter,
    TableConnections connections,
    TablePresence presence,
    TableBroadcaster broadcaster,
    TableFanOut fanOut,
    TableFog fog,
    TableSpawns spawns) : Hub<ITableClient>, ITableHub
{
    public const string Path = "/hubs/table";

    // The connection's role in the table, set by WatchSession and JoinEncounter.
    private TableConnection Connection => connections.Get(Context.ConnectionId);

    // Everyone in the fight: both groups. Anything secret goes through TableVisibility to
    // one group instead.
    private ITableClient Everyone(Guid encounterId) => broadcaster.Everyone(encounterId);

    public async Task<HubResult> JoinEncounter(Guid encounterId)
    {
        var (error, sessionDmUserId) = await moves.JoinAsync(UserId, encounterId, Context.ConnectionAborted);
        if (error is null)
        {
            // Leaving both first makes a second JoinEncounter after a hand-over re-sort the
            // connection (ReloadBoard).
            var connection = Connection;
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, TableGroups.Dm(encounterId), Context.ConnectionAborted);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, TableGroups.Players(encounterId), Context.ConnectionAborted);
            connection.UserId = UserId;
            connection.EncounterId = encounterId;
            connection.InDmGroup = TablePermissions.ActsAsSessionDm(connection.Mode, UserId, sessionDmUserId);
            await Groups.AddToGroupAsync(
                Context.ConnectionId,
                connection.InDmGroup ? TableGroups.Dm(encounterId) : TableGroups.Players(encounterId),
                Context.ConnectionAborted);
            // A player never gets a preview of a creature or a target it cannot see.
            foreach (var preview in await fanOut.PreviewsForAsync(previews.In(encounterId), connection.InDmGroup))
            {
                await Clients.Caller.MovePreviewed(preview);
            }

            await presence.JoinedAsync(encounterId, Context.ConnectionAborted);
        }

        return new HubResult(error);
    }

    public async Task<MoveResult> MoveToken(MoveTokenRequest request)
    {
        if (ReadOnly() is { } readOnly)
        {
            return new MoveResult(readOnly, null);
        }

        var result = await Broadcast(await moves.MoveAsync(UserId, request, Connection.Mode));
        await ClearPreview();
        return result;
    }

    // A rejected preview takes the shown one back: the person's target has changed.
    public async Task<HubResult> PreviewMove(MoveTokenRequest request)
    {
        if (ReadOnly() is { } readOnly)
        {
            return new HubResult(readOnly);
        }

        var (error, preview) = await moves.PreviewAsync(UserId, request, Connection.Mode);
        if (preview is null)
        {
            await ClearPreview();
            return new HubResult(error);
        }

        if (previews.Show(Context.ConnectionId, preview) is { } replaced && !SameToken(replaced, preview))
        {
            await SendCleared(replaced);
        }

        await fanOut.PreviewedAsync(preview, Context.ConnectionId);

        // The connection may have closed meanwhile, after OnDisconnectedAsync cleared it.
        if (Context.ConnectionAborted.IsCancellationRequested)
        {
            await ClearPreview();
        }

        return new HubResult(null);
    }

    public async Task ClearPreview()
    {
        if (previews.Clear(Context.ConnectionId) is { } cleared)
        {
            await SendCleared(cleared);
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await ClearPreview();
        var gone = connections.Find(Context.ConnectionId);
        connections.Remove(Context.ConnectionId);
        if (gone?.EncounterId is { } encounterId)
        {
            await presence.DisconnectedAsync(encounterId, gone.UserId, gone.Mode);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task<MoveResult> UndoMove(Guid encounterId) =>
        ReadOnly() is { } readOnly
            ? new MoveResult(readOnly, null)
            : await Broadcast(await moves.UndoAsync(UserId, encounterId, Connection.Mode));

    // The activity filter has already noted the call.
    public Task MarkActive() => Task.CompletedTask;

    // Pings and arrows share the rate limit. Only those that pass the checks count; one
    // over the limit is dropped and answers as if it went out.
    public async Task<HubResult> Ping(PingRequest request)
    {
        if (ReadOnly() is { } readOnly)
        {
            return new HubResult(readOnly);
        }

        var (error, ping) = await pings.PingAsync(UserId, request, Connection.Mode);
        if (ping is not null && pingLimiter.TryTake(ping.UserId, ping.EncounterId))
        {
            await fanOut.PingedAsync(ping, Context.ConnectionId);
        }

        return new HubResult(error);
    }

    public async Task<HubResult> DrawArrow(DrawArrowRequest request)
    {
        if (ReadOnly() is { } readOnly)
        {
            return new HubResult(readOnly);
        }

        var (error, arrow) = await pings.ArrowAsync(UserId, request, Connection.Mode);
        if (arrow is not null && pingLimiter.TryTake(arrow.UserId, arrow.EncounterId))
        {
            await fanOut.ArrowDrawnAsync(arrow, Context.ConnectionId);
        }

        return new HubResult(error);
    }

    public async Task<StatusResult> AddStatus(AddStatusRequest request) =>
        ReadOnly() is { } readOnly ? new StatusResult(readOnly, null) : await Broadcast(await statuses.AddAsync(UserId, request, Connection.Mode));

    public async Task<StatusResult> RemoveStatus(RemoveStatusRequest request) =>
        ReadOnly() is { } readOnly ? new StatusResult(readOnly, null) : await Broadcast(await statuses.RemoveAsync(UserId, request, Connection.Mode));

    public async Task<StatusResult> SetStatusLevel(SetStatusLevelRequest request) =>
        ReadOnly() is { } readOnly ? new StatusResult(readOnly, null) : await Broadcast(await statuses.SetLevelAsync(UserId, request, Connection.Mode));

    // Saved, then the token's previews go (to everyone but the device that showed each),
    // then TokenRemoved reaches the whole group.
    public async Task<HubResult> RemoveToken(Guid tokenId)
    {
        if (ReadOnly() is { } readOnly)
        {
            return new HubResult(readOnly);
        }

        if (Connection.Mode != ConnectionMode.Player)
        {
            return new HubResult(ApiErrorCode.NotSessionDm);
        }

        var (error, removed) = await removals.RemoveAsync(UserId, tokenId);
        if (removed is null)
        {
            return new HubResult(error);
        }

        foreach (var (connectionId, preview) in previews.ClearToken(removed.EncounterId, removed.TokenId))
        {
            await fanOut.ClearedAsync(
                new MovePreviewClearedEvent(preview.EncounterId, preview.TokenId, preview.ByUserId), connectionId);
        }

        await fanOut.RemovedAsync(removed);
        return new HubResult(null);
    }

    public async Task<HubResult> RestoreToken(Guid tokenId)
    {
        if (ReadOnly() is { } readOnly)
        {
            return new HubResult(readOnly);
        }

        if (Connection.Mode != ConnectionMode.Player)
        {
            return new HubResult(ApiErrorCode.NotSessionDm);
        }

        var (error, restored) = await removals.RestoreAsync(UserId, tokenId);
        if (restored is not null)
        {
            await fanOut.RestoredAsync(restored);
        }

        return new HubResult(error);
    }

    private Guid UserId => Context.User!.GetUserId();

    // A spectator connection only watches. A shared screen watches too once the session
    // leaves local mode; the services check that against the database (TablePermissions).
    private ApiErrorCode? ReadOnly() => Connection.Mode == ConnectionMode.Spectator ? ApiErrorCode.ReadOnlyConnection : null;

    // Everyone in the encounter's groups except `except` (default: the caller).
    private async Task Others(Guid encounterId, Func<ITableClient, Task> send, string? except = null)
    {
        var excluded = except ?? Context.ConnectionId;
        await send(Clients.GroupExcept(TableGroups.Dm(encounterId), excluded));
        await send(Clients.GroupExcept(TableGroups.Players(encounterId), excluded));
    }

    private static bool SameToken(MovePreviewEvent a, MovePreviewEvent b) =>
        a.EncounterId == b.EncounterId && a.TokenId == b.TokenId;

    private Task SendCleared(MovePreviewEvent preview) =>
        fanOut.ClearedAsync(
            new MovePreviewClearedEvent(preview.EncounterId, preview.TokenId, preview.ByUserId), Context.ConnectionId);

    // Only a saved move reaches the group; errors send nothing.
    private async Task<MoveResult> Broadcast(MoveResult result)
    {
        if (result.Move is { } move)
        {
            await fanOut.MovedAsync(move, moves.LastFrom);
        }

        return result;
    }

    // Only a saved change reaches the group, the caller included.
    private async Task<StatusResult> Broadcast(StatusResult result)
    {
        if (result.Change is { } change)
        {
            await fanOut.StatusesChangedAsync(change);
        }

        return result;
    }
}
