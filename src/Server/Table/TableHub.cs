using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using OreanasOffice.Server.Authorization;

namespace OreanasOffice.Server.Table;

// The live table: one group per active encounter (knowledge/decisions/realtime-sync.md).
// Every call checks permissions against the database, like the HTTP policies, so a new
// session DM applies at once. The rules live in TableMoves; the hub saves first, then
// broadcasts. TableActivity counts every call as activity for the idle timeout.
[Authorize]
public sealed class TableHub(TableMoves moves) : Hub<ITableClient>, ITableHub
{
    public const string Path = "/hubs/table";

    public static string GroupName(Guid encounterId) => $"encounter:{encounterId}";

    public async Task<HubResult> JoinEncounter(Guid encounterId)
    {
        var error = await moves.JoinAsync(UserId, encounterId, Context.ConnectionAborted);
        if (error is null)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(encounterId), Context.ConnectionAborted);
        }

        return new HubResult(error);
    }

    public async Task<MoveResult> MoveToken(MoveTokenRequest request) => await Broadcast(await moves.MoveAsync(UserId, request));

    public async Task<MoveResult> UndoMove(Guid encounterId) => await Broadcast(await moves.UndoAsync(UserId, encounterId));

    // The activity filter has already noted the call.
    public Task MarkActive() => Task.CompletedTask;

    private Guid UserId => Context.User!.GetUserId();

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
