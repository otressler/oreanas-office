using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Table;

// Fog of war and hidden creatures (knowledge/features/fog-of-war.md). Owned by the fog
// backend lane. Everything here is the session DM's, from a player connection only
// (TablePermissions.ActsAsSessionDm), saved before it is broadcast, and sent to each group
// through TableVisibility.
public sealed partial class TableHub
{
    // STUB: see ITableHub.ChangeFog.
    public Task<HubResult> ChangeFog(ChangeFogRequest request) => Task.FromResult(new HubResult(ApiErrorCode.NotBuilt));

    // STUB: see ITableHub.SetTokensHidden.
    public Task<HubResult> SetTokensHidden(SetTokensHiddenRequest request) => Task.FromResult(new HubResult(ApiErrorCode.NotBuilt));

    // STUB: see ITableHub.UndoChange. Undoes spawns too (TableHub.Spawn.cs records them).
    public Task<HubResult> UndoChange(Guid encounterId) => Task.FromResult(new HubResult(ApiErrorCode.NotBuilt));
}
