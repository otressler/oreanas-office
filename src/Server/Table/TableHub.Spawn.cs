using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Table;

// Creature spawn (knowledge/features/creature-spawn.md). Owned by the fog backend lane,
// since spawning shares the visibility filter and the numbering at first sight.
public sealed partial class TableHub
{
    public async Task<SpawnResult> SpawnCreatures(SpawnCreaturesRequest request)
    {
        if (ReadOnly() is { } readOnly)
        {
            return new SpawnResult(readOnly, null);
        }

        var (error, outcome, tokenIds) = await spawns.SpawnAsync(UserId, Connection.Mode, request);
        if (outcome is not null)
        {
            await outcome.Delivery.SendAsync(broadcaster, outcome.EncounterId);
        }

        return new SpawnResult(error, tokenIds);
    }
}
