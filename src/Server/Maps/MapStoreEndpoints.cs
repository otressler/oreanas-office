using Microsoft.AspNetCore.Http.HttpResults;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Sync;

namespace OreanasOffice.Server.Maps;

// The map store (knowledge/domain/battle-map.md, "Store"): maps of other campaigns that
// a `dm` member can copy into theirs. Needs the server, so it is never offline.
// Stubs in the contract; the backend lane builds the rules.
public static class MapStoreEndpoints
{
    public static IEndpointRouteBuilder MapMapStoreEndpoints(this IEndpointRouteBuilder app)
    {
        var store = app.MapGroup("/api/campaigns/{campaignId:guid}/map-store")
            .WithTags("Maps")
            .RequireAuthorization(Policies.CampaignDm);

        store.MapGet("/", ListStore);
        store.MapPost("/{mapId:guid}", AddFromStore);
        return app;
    }

    // Every unarchived map of other campaigns, except maps this campaign already has an
    // unarchived copy of, and copies made from this campaign's own maps.
    private static Ok<List<StoreMapResponse>> ListStore(Guid campaignId) =>
        TypedResults.Ok(new List<StoreMapResponse>());

    // Copies the map into this campaign, or brings back this campaign's archived copy.
    // MapNotInStore (409) when the map is not offered.
    private static Results<Ok<SyncServerItem>, Conflict<ApiError>> AddFromStore(Guid campaignId, Guid mapId) =>
        TypedResults.Conflict(new ApiError(ApiErrorCode.MapNotInStore));
}

// A map another campaign could copy. HasArchivedCopy: adding it brings this campaign's
// archived copy back.
public record StoreMapResponse(
    Guid Id, string Name, int Width, int Height, string CampaignName, MapLayout Layout, bool HasArchivedCopy);
