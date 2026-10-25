using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Table;

// The initiative list (knowledge/features/initiative.md): the session DM's, from a player
// connection only (checked in TableInitiative), saved before it is sent, and sent to the
// session DM's group alone.
public sealed partial class TableHub
{
    public async Task<InitiativeRollResult> RollInitiative(Guid encounterId)
    {
        if (ReadOnly() is { } readOnly)
        {
            return new InitiativeRollResult(readOnly, null);
        }

        var (error, entries) = await initiative.RollAsync(UserId, Connection.Mode, encounterId);
        return new InitiativeRollResult(error, entries);
    }

    public async Task<InitiativeResult> SetInitiative(SetInitiativeRequest request) =>
        ReadOnly() is { } readOnly
            ? new InitiativeResult(readOnly, null)
            : await SendAsync(await initiative.SetAsync(UserId, Connection.Mode, request));

    public async Task<InitiativeResult> ClearInitiative(Guid encounterId) =>
        ReadOnly() is { } readOnly
            ? new InitiativeResult(readOnly, null)
            : await SendAsync(await initiative.ClearAsync(UserId, Connection.Mode, encounterId));

    private async Task<InitiativeResult> SendAsync((ApiErrorCode? Error, InitiativeChangedEvent? Change) result)
    {
        if (result.Change is { } change)
        {
            await broadcaster.Dm(change.EncounterId).InitiativeChanged(change);
        }

        return new InitiativeResult(result.Error, result.Change);
    }
}
