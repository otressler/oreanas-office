using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Table;

// Spectator and shared screens (knowledge/features/spectator-view.md, shared-table.md).
// Owned by the spectator lane.
public sealed partial class TableHub
{
    // STUB: sets Connection.Mode, checks access (member, or session spectator for a
    // spectator screen; member in local mode for a shared screen), joins TableGroups.Session
    // and returns the session's state.
    public Task<WatchResult> WatchSession(WatchSessionRequest request) =>
        Task.FromResult(new WatchResult(ApiErrorCode.NotBuilt, ConnectionMode.Spectator, null));
}
