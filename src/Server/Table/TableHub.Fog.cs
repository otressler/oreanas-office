using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Table;

// Fog of war and hidden creatures (knowledge/features/fog-of-war.md). Owned by the fog
// backend lane. Everything here is the session DM's, from a player connection only
// (TablePermissions.ActsAsSessionDm, checked in TableFog), saved before it is broadcast, and
// sent to each group through TableVisibility (Delivery).
public sealed partial class TableHub
{
    public async Task<HubResult> ChangeFog(ChangeFogRequest request) =>
        ReadOnly() is { } readOnly
            ? new HubResult(readOnly)
            : await SendAsync(await fog.ChangeFogAsync(UserId, Connection.Mode, request));

    public async Task<HubResult> SetTokensHidden(SetTokensHiddenRequest request) =>
        ReadOnly() is { } readOnly
            ? new HubResult(readOnly)
            : await SendAsync(await fog.SetTokensHiddenAsync(UserId, Connection.Mode, request));

    // Undoes spawns too (TableHub.Spawn.cs records them).
    public async Task<HubResult> UndoChange(Guid encounterId) =>
        ReadOnly() is { } readOnly
            ? new HubResult(readOnly)
            : await SendAsync(await fog.UndoAsync(UserId, Connection.Mode, encounterId));

    // Tokens that left the board lose their move previews first, as in RemoveToken.
    private async Task<HubResult> SendAsync((ApiErrorCode? Error, ChangeOutcome? Outcome) result)
    {
        if (result.Outcome is { } outcome)
        {
            await ClearPreviewsOfAsync(outcome.EncounterId, outcome.RemovedTokenIds);
            await outcome.Delivery.SendAsync(broadcaster, outcome.EncounterId);
        }

        return new HubResult(result.Error);
    }

    private async Task ClearPreviewsOfAsync(Guid encounterId, IEnumerable<Guid> tokenIds)
    {
        foreach (var tokenId in tokenIds)
        {
            foreach (var (connectionId, preview) in previews.ClearToken(encounterId, tokenId))
            {
                await fanOut.ClearedAsync(
                    new MovePreviewClearedEvent(preview.EncounterId, preview.TokenId, preview.ByUserId), connectionId);
            }
        }
    }
}
