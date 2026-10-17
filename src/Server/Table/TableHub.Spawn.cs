using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Table;

// Creature spawn (knowledge/features/creature-spawn.md). Owned by the fog backend lane,
// since spawning shares the visibility filter and the numbering at first sight.
public sealed partial class TableHub
{
    // STUB: see ITableHub.SpawnCreatures.
    public Task<SpawnResult> SpawnCreatures(SpawnCreaturesRequest request) =>
        Task.FromResult(new SpawnResult(ApiErrorCode.NotBuilt, null));
}
