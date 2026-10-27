using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Table;

// Hit points and the dead mark (knowledge/features/hit-points.md): the session DM's, from a
// player connection only. Hit points go to the session DM's group alone; the dead mark to
// everyone who may see the creature.
public sealed partial class TableHub
{
    public async Task<HitPointsResult> SetHitPoints(SetHitPointsRequest request)
    {
        if (DmOnly() is { } error)
        {
            return new HitPointsResult(error, null);
        }

        var (failed, change) = await hitPoints.SetHitPointsAsync(UserId, request);
        if (change is not null)
        {
            await broadcaster.Dm(change.EncounterId).TokenHitPointsChanged(change);
        }

        return new HitPointsResult(failed, change);
    }

    public async Task<DeadResult> SetTokenDead(SetTokenDeadRequest request)
    {
        if (DmOnly() is { } error)
        {
            return new DeadResult(error, null);
        }

        var (failed, change) = await hitPoints.SetDeadAsync(UserId, request);
        if (change is not null)
        {
            await fanOut.DeadChangedAsync(change);
        }

        return new DeadResult(failed, change);
    }

    // A spectator only watches; a shared screen is never the session DM.
    private ApiErrorCode? DmOnly() =>
        ReadOnly() ?? (Connection.Mode != ConnectionMode.Player ? ApiErrorCode.NotSessionDm : null);
}
