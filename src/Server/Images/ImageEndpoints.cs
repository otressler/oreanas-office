using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Images;

// Map backgrounds (knowledge/features/ai-map-generation.md) and serving images
// (knowledge/decisions/persistence.md, "How images reach the browser"). Contract stubs;
// lane: job queue.
public static class ImageEndpoints
{
    public static IEndpointRouteBuilder MapImageEndpoints(this IEndpointRouteBuilder app)
    {
        var backgrounds = app.MapGroup("/api/campaigns/{campaignId:guid}/maps/{mapId:guid}")
            .WithTags("Images")
            .RequireAuthorization(Policies.CampaignDm);
        backgrounds.MapGet("/backgrounds", ListBackgrounds);
        backgrounds.MapPost("/backgrounds", GenerateBackground);
        backgrounds.MapPut("/background", PickBackground);

        app.MapGet("/api/assets/{assetId:guid}", GetAsset)
            .WithTags("Images")
            .RequireAuthorization();
        return app;
    }

    // The map's versions, newest first: its own assets, plus the picked one when it belongs
    // to the store map this one was copied from. 404 for a map of another campaign.
    private static async Task<Results<Ok<MapBackgroundsResponse>, NotFound>> ListBackgrounds(
        Guid campaignId, Guid mapId, AppDbContext db, CancellationToken cancellationToken)
    {
        await Task.CompletedTask;
        return TypedResults.Ok(new MapBackgroundsResponse(null, [], new ImageBudgetResponse(0m, 20m, DateTimeOffset.UnixEpoch, false)));
    }

    // Queues a job after the DM confirmed it: checks the map version, that no job of the map
    // is queued or running, the monthly limit and that a model is configured; then saves a
    // Queued asset with the map's size, frame and layout hash and wakes the worker. 202 with
    // the new version. 404 for a map of another campaign or an archived map.
    // Errors (409): MapChanged, GenerationRunning, ImageBudgetExhausted, ImagesUnavailable.
    private static async Task<Results<Accepted<MapBackground>, NotFound, Conflict<ApiError>>> GenerateBackground(
        Guid campaignId,
        Guid mapId,
        GenerateBackgroundRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        await Task.CompletedTask;
        return TypedResults.Conflict(new ApiError(ApiErrorCode.ImagesUnavailable));
    }

    // Sets the map's BackgroundAssetId: a Done version listed for the map (its own, or the
    // one it was copied with) that fits the map's size, or null. Doesn't raise the map's
    // sync version. Errors (409): BackgroundNotFound, BackgroundOutdated.
    private static async Task<Results<NoContent, NotFound, Conflict<ApiError>>> PickBackground(
        Guid campaignId,
        Guid mapId,
        PickBackgroundRequest request,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        await Task.CompletedTask;
        return TypedResults.NoContent();
    }

    // The image, for a signed-in member of a campaign that uses it: the asset's own campaign,
    // or one whose map or encounter points to it. Images never change, so the answer may be
    // cached for good (Cache-Control: private, max-age=31536000, immutable). 404 otherwise,
    // and for an asset that isn't Done.
    private static async Task<Results<FileStreamHttpResult, NotFound>> GetAsset(
        Guid assetId, ClaimsPrincipal user, AppDbContext db, IAssetStore store, HttpContext http, CancellationToken cancellationToken)
    {
        await Task.CompletedTask;
        return TypedResults.NotFound();
    }
}
