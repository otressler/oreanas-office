using Microsoft.AspNetCore.Http.HttpResults;
using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Sync;

// knowledge/decisions/offline-prep-pwa.md, "Sync protocol". Stubs in the contract; the
// backend lane builds the rules.
internal static class SyncEndpoints
{
    // Every item is rejected for now.
    public static Ok<SyncPushResponse> Push(SyncPushRequest request) =>
        TypedResults.Ok(new SyncPushResponse(
            [
                .. (request.Items ?? []).Select(item => new SyncItemResult(
                    item.Id, item.Kind, SyncOutcome.Rejected, null, new ApiError(ApiErrorCode.NotADm), null, null, null)),
            ]));

    public static Ok<SyncVersionList> Versions(Guid campaignId) =>
        TypedResults.Ok(new SyncVersionList([], [], []));

    public static Ok<List<SyncServerItem>> Fetch(Guid campaignId, SyncFetchRequest request) =>
        TypedResults.Ok(new List<SyncServerItem>());
}
