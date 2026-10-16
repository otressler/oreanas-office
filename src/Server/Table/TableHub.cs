using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using OreanasOffice.Server.Authorization;

namespace OreanasOffice.Server.Table;

// The live table: one group per active encounter (knowledge/decisions/realtime-sync.md).
// Every call checks permissions against the database, like the HTTP policies, so a new
// session DM applies at once. The rules live in TableMoves; the hub saves first, then
// broadcasts. TableActivity counts every call as activity for the idle timeout. Move
// previews go only to the others and live in TablePreviews until the move, a cancel or
// the connection's end.
[Authorize]
public sealed class TableHub(TableMoves moves, TablePreviews previews) : Hub<ITableClient>, ITableHub
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

    // Stage 9 contract: the bodies come with the backend lane.
    public Task<HubResult> Ping(PingRequest request) => throw new NotImplementedException();

    public Task<HubResult> DrawArrow(DrawArrowRequest request) => throw new NotImplementedException();

    public Task<StatusResult> AddStatus(AddStatusRequest request) => throw new NotImplementedException();

    public Task<StatusResult> RemoveStatus(RemoveStatusRequest request) => throw new NotImplementedException();

    public Task<StatusResult> SetStatusLevel(SetStatusLevelRequest request) => throw new NotImplementedException();

    public Task<HubResult> RemoveToken(Guid tokenId) => throw new NotImplementedException();

    public Task<HubResult> RestoreToken(Guid tokenId) => throw new NotImplementedException();

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
}
