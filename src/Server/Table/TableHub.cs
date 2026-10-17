using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using OreanasOffice.Server.Authorization;

namespace OreanasOffice.Server.Table;

// The live table: one group per active encounter (knowledge/decisions/realtime-sync.md).
// Every call checks permissions against the database, like the HTTP policies, so a new
// session DM applies at once. The rules live in TableMoves, TableStatuses, TableRemovals
// and TablePings; the hub saves first, then broadcasts. TableActivity counts every call as
// activity for the idle timeout. Move previews go only to the others and live in
// TablePreviews until the move, a cancel, the token's removal or the connection's end.
// Pings and arrows go only to the others and are never saved.
[Authorize]
public sealed class TableHub(
    TableMoves moves,
    TablePreviews previews,
    TableStatuses statuses,
    TableRemovals removals,
    TablePings pings,
    TablePingLimiter pingLimiter) : Hub<ITableClient>, ITableHub
{
    public const string Path = "/hubs/table";

    public static string GroupName(Guid encounterId) => $"encounter:{encounterId}";

    public async Task<HubResult> JoinEncounter(Guid encounterId)
    {
        var error = await moves.JoinAsync(UserId, encounterId, Context.ConnectionAborted);
        if (error is null)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(encounterId), Context.ConnectionAborted);
            foreach (var preview in previews.In(encounterId))
            {
                await Clients.Caller.MovePreviewed(preview);
            }
        }

        return new HubResult(error);
    }

    public async Task<MoveResult> MoveToken(MoveTokenRequest request)
    {
        var result = await Broadcast(await moves.MoveAsync(UserId, request));
        await ClearPreview();
        return result;
    }

    // A rejected preview takes the shown one back: the person's target has changed.
    public async Task<HubResult> PreviewMove(MoveTokenRequest request)
    {
        var (error, preview) = await moves.PreviewAsync(UserId, request);
        if (preview is null)
        {
            await ClearPreview();
            return new HubResult(error);
        }

        if (previews.Show(Context.ConnectionId, preview) is { } replaced && !SameToken(replaced, preview))
        {
            await SendCleared(replaced);
        }

        await Clients.OthersInGroup(GroupName(preview.EncounterId)).MovePreviewed(preview);

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
        await base.OnDisconnectedAsync(exception);
    }

    public async Task<MoveResult> UndoMove(Guid encounterId) => await Broadcast(await moves.UndoAsync(UserId, encounterId));

    // The activity filter has already noted the call.
    public Task MarkActive() => Task.CompletedTask;

    // Pings and arrows share the rate limit. Only those that pass the checks count; one
    // over the limit is dropped and answers as if it went out.
    public async Task<HubResult> Ping(PingRequest request)
    {
        var (error, ping) = await pings.PingAsync(UserId, request);
        if (ping is not null && pingLimiter.TryTake(ping.UserId, ping.EncounterId))
        {
            await Clients.OthersInGroup(GroupName(ping.EncounterId)).Pinged(ping);
        }

        return new HubResult(error);
    }

    public async Task<HubResult> DrawArrow(DrawArrowRequest request)
    {
        var (error, arrow) = await pings.ArrowAsync(UserId, request);
        if (arrow is not null && pingLimiter.TryTake(arrow.UserId, arrow.EncounterId))
        {
            await Clients.OthersInGroup(GroupName(arrow.EncounterId)).ArrowDrawn(arrow);
        }

        return new HubResult(error);
    }

    public async Task<StatusResult> AddStatus(AddStatusRequest request) => await Broadcast(await statuses.AddAsync(UserId, request));

    public async Task<StatusResult> RemoveStatus(RemoveStatusRequest request) => await Broadcast(await statuses.RemoveAsync(UserId, request));

    public async Task<StatusResult> SetStatusLevel(SetStatusLevelRequest request) =>
        await Broadcast(await statuses.SetLevelAsync(UserId, request));

    // Saved, then the token's previews go (to everyone but the device that showed each),
    // then TokenRemoved reaches the whole group.
    public async Task<HubResult> RemoveToken(Guid tokenId)
    {
        var (error, removed) = await removals.RemoveAsync(UserId, tokenId);
        if (removed is null)
        {
            return new HubResult(error);
        }

        var group = GroupName(removed.EncounterId);
        foreach (var (connectionId, preview) in previews.ClearToken(removed.EncounterId, removed.TokenId))
        {
            await Clients.GroupExcept(group, connectionId)
                .MovePreviewCleared(new MovePreviewClearedEvent(preview.EncounterId, preview.TokenId, preview.ByUserId));
        }

        await Clients.Group(group).TokenRemoved(removed);
        return new HubResult(null);
    }

    public async Task<HubResult> RestoreToken(Guid tokenId)
    {
        var (error, restored) = await removals.RestoreAsync(UserId, tokenId);
        if (restored is not null)
        {
            await Clients.Group(GroupName(restored.EncounterId)).TokenRestored(restored);
        }

        return new HubResult(error);
    }

    private Guid UserId => Context.User!.GetUserId();

    private static bool SameToken(MovePreviewEvent a, MovePreviewEvent b) =>
        a.EncounterId == b.EncounterId && a.TokenId == b.TokenId;

    private Task SendCleared(MovePreviewEvent preview) =>
        Clients.OthersInGroup(GroupName(preview.EncounterId))
            .MovePreviewCleared(new MovePreviewClearedEvent(preview.EncounterId, preview.TokenId, preview.ByUserId));

    // Only a saved move reaches the group; errors send nothing.
    private async Task<MoveResult> Broadcast(MoveResult result)
    {
        if (result.Move is { } move)
        {
            await Clients.Group(GroupName(move.EncounterId)).TokenMoved(move);
        }

        return result;
    }

    // Only a saved change reaches the group, the caller included.
    private async Task<StatusResult> Broadcast(StatusResult result)
    {
        if (result.Change is { } change)
        {
            await Clients.Group(GroupName(change.EncounterId)).TokenStatusesChanged(change);
        }

        return result;
    }
}
