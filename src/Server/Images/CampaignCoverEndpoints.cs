using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Images;

// A campaign's cover for its card on the home page (knowledge/domain/campaign.md): versions
// like a character's portraits, generated from the campaign's name and description or
// uploaded through the crop step, with one picked. `dm` members only. The contracts and the
// job queue are the token images' (TokenImageEndpoints): the owner is AssetOwnerType.Campaign
// with the campaign's own id.
public static class CampaignCoverEndpoints
{
    public static IEndpointRouteBuilder MapCampaignCoverEndpoints(this IEndpointRouteBuilder app)
    {
        var covers = app.MapGroup("/api/campaigns/{campaignId:guid}")
            .WithTags("Images")
            .RequireAuthorization(Policies.CampaignDm);
        covers.MapGet("/covers", ListCovers);
        covers.MapPost("/covers", GenerateCover);
        covers.MapPost("/covers/upload", UploadCover).AcceptsRawPicture();
        covers.MapPut("/cover", PickCover);
        return app;
    }

    private static async Task<Ok<TokenImagesResponse>> ListCovers(
        Guid campaignId,
        AppDbContext db,
        IOptions<ImageOptions> options,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var picked = await db.Campaigns.AsNoTracking()
            .Where(c => c.Id == campaignId)
            .Select(c => c.CoverAssetId)
            .SingleAsync(cancellationToken);
        return TypedResults.Ok(await TokenImages.ListAsync(
            db, AssetOwnerType.Campaign, campaignId, picked, options.Value, time, cancellationToken));
    }

    // 202 with the queued version. The request's fields don't apply to covers. Errors (409):
    // ImagesUnavailable, ImageBudgetExhausted, GenerationRunning, DescriptionMissing.
    private static async Task<Results<Accepted<TokenImage>, NotFound, Conflict<ApiError>>> GenerateCover(
        Guid campaignId,
        GenerateTokenImageRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        IOptions<ImageOptions> options,
        ImageJobQueue queue,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var outcome = await TokenImageEndpoints.QueueAsync(
            db, AssetOwnerType.Campaign, campaignId, user.GetUserId(), null, settings, time, async () =>
            {
                var description = await db.Campaigns.AsNoTracking()
                    .Where(c => c.Id == campaignId)
                    .Select(c => c.Description)
                    .SingleAsync(cancellationToken);
                if (!settings.Configured)
                {
                    return TokenImageEndpoints.Check.Fail(ApiErrorCode.ImagesUnavailable);
                }

                // A cover painted from a name alone is a guess.
                return string.IsNullOrWhiteSpace(description)
                    ? TokenImageEndpoints.Check.Fail(ApiErrorCode.DescriptionMissing)
                    : TokenImageEndpoints.Check.Ok(campaignId);
            },
            cancellationToken);

        return outcome switch
        {
            { Error: { } error } => TypedResults.Conflict(new ApiError(error)),
            { Image: { } image } => TokenImageEndpoints.QueuedAt(queue, CoversUrl(campaignId), image),
            _ => TypedResults.NotFound(),
        };
    }

    // 201 with the new version, already Done and picked. Errors (400): UploadInvalid,
    // UploadTooLarge.
    private static async Task<Results<Created<TokenImage>, BadRequest<ApiError>>> UploadCover(
        Guid campaignId,
        HttpRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        IOptions<ImageOptions> options,
        IAssetStore store,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var (image, error) = await TokenImageEndpoints.UploadAsync(
            request, db, options.Value, store, time, AssetOwnerType.Campaign, campaignId, campaignId, user.GetUserId(), cancellationToken);
        return image is null
            ? TypedResults.BadRequest(new ApiError(error!.Value))
            : TypedResults.Created(CoversUrl(campaignId), image);
    }

    // Sets CoverAssetId to a Done version of the campaign, or null for the default picture.
    private static async Task<Results<NoContent, Conflict<ApiError>>> PickCover(
        Guid campaignId,
        PickTokenImageRequest request,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        if (request.AssetId is { } assetId
            && await TokenImages.FinishedAsync(db, AssetOwnerType.Campaign, campaignId, assetId, cancellationToken) is null)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.ImageNotFound));
        }

        await TokenImages.PickAsync(db, AssetOwnerType.Campaign, campaignId, request.AssetId, cancellationToken);
        return TypedResults.NoContent();
    }

    private static string CoversUrl(Guid campaignId) => $"/api/campaigns/{campaignId}/covers";
}
