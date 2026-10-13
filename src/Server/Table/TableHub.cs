using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace OreanasOffice.Server.Table;

// The live table: one group per active encounter (knowledge/decisions/realtime-sync.md).
// Every call checks permissions against the database, like the HTTP policies, so a new
// session DM applies at once. Contract stub; the hub lane implements it.
[Authorize]
public sealed class TableHub : Hub<ITableClient>, ITableHub
{
    public const string Path = "/hubs/table";

    public static string GroupName(Guid encounterId) => $"encounter:{encounterId}";

    public Task<HubResult> JoinEncounter(Guid encounterId) => throw new NotImplementedException();

    public Task<MoveResult> MoveToken(MoveTokenRequest request) => throw new NotImplementedException();

    public Task<MoveResult> UndoMove(Guid encounterId) => throw new NotImplementedException();

    public Task MarkActive() => throw new NotImplementedException();
}
