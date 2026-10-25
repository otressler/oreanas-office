using System.Security.Claims;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Net.Http.Headers;
using Microsoft.OpenApi;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Images;

// Token icons for creature types and portraits for characters
// (knowledge/features/token-icons.md). Creature icons: `dm` members only. Portraits: the
// character's owner and every `dm` member (knowledge/domain/character.md); 403 for anyone
// else in the campaign. 404 for an owner that isn't in the campaign.
//
// Both can be uploaded. Uploads send the picture as the raw request body with its
// Content-Type (image/jpeg, image/png or image/webp), not as a form, so a cross-site page
// can't post one without a CORS preflight. The server checks the type and size, turns it the
// right way up, crops the middle square, shrinks it to ImageOptions.TokenPixels and saves it
// as WebP, which drops the photo's metadata.
public static class TokenImageEndpoints
{
    public static IEndpointRouteBuilder MapTokenImageEndpoints(this IEndpointRouteBuilder app)
    {
        var icons = app.MapGroup("/api/campaigns/{campaignId:guid}/creature-types")
            .WithTags("Images")
            .RequireAuthorization(Policies.CampaignDm);
        icons.MapGet("/icons", ListCreatureTypeIcons);
        icons.MapGet("/{creatureTypeId:guid}/icons", ListIcons);
        icons.MapPost("/{creatureTypeId:guid}/icons", GenerateIcon);
        icons.MapPost("/{creatureTypeId:guid}/icons/upload", UploadIcon).AcceptsRawPicture();
        icons.MapPut("/{creatureTypeId:guid}/icon", PickIcon);

        var portraits = app.MapGroup("/api/campaigns/{campaignId:guid}/characters/{characterId:guid}")
            .WithTags("Images")
            .RequireAuthorization(Policies.CampaignMember);
        portraits.MapGet("/portraits", ListPortraits);
        portraits.MapPost("/portraits", GeneratePortrait);
        portraits.MapPost("/portraits/upload", UploadPortrait).AcceptsRawPicture();
        portraits.MapPut("/portrait", PickPortrait);

        return app;
    }

    // The picked icon of every type of the campaign that has one, archived types included,
    // by name.
    private static async Task<Ok<List<CreatureTypeIcon>>> ListCreatureTypeIcons(
        Guid campaignId, AppDbContext db, CancellationToken cancellationToken)
    {
        var picked = await db.CreatureTypes.AsNoTracking()
            .Where(t => t.CampaignId == campaignId && t.IconAssetId != null)
            .OrderBy(t => t.Name)
            .Select(t => new { t.Id, AssetId = t.IconAssetId!.Value })
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(picked.Select(t => new CreatureTypeIcon(t.Id, t.AssetId, MapBackgrounds.Url(t.AssetId))).ToList());
    }

    // 404 for a type of another campaign; an archived type's versions are still listed.
    private static async Task<Results<Ok<TokenImagesResponse>, NotFound>> ListIcons(
        Guid campaignId,
        Guid creatureTypeId,
        AppDbContext db,
        IOptions<ImageOptions> options,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var type = await db.CreatureTypes.AsNoTracking()
            .Where(t => t.Id == creatureTypeId && t.CampaignId == campaignId)
            .Select(t => new { t.IconAssetId })
            .SingleOrDefaultAsync(cancellationToken);
        if (type is null)
        {
            return TypedResults.NotFound();
        }

        return TypedResults.Ok(await TokenImages.ListAsync(
            db, AssetOwnerType.CreatureType, creatureTypeId, type.IconAssetId, options.Value, time, cancellationToken));
    }

    // 202 with the queued version. 404 for an archived type.
    private static async Task<Results<Accepted<TokenImage>, NotFound, Conflict<ApiError>>> GenerateIcon(
        Guid campaignId,
        Guid creatureTypeId,
        GenerateTokenImageRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        IOptions<ImageOptions> options,
        ImageJobQueue queue,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var settings = options.Value;
        var userId = user.GetUserId();
        var outcome = await QueueAsync(db, AssetOwnerType.CreatureType, creatureTypeId, userId, null, settings, time, async () =>
        {
            var type = await db.CreatureTypes.AsNoTracking()
                .SingleOrDefaultAsync(t => t.Id == creatureTypeId && t.CampaignId == campaignId, cancellationToken);
            if (type is null || type.ArchivedAt is not null)
            {
                return Check.NotFound;
            }

            if (!settings.Configured)
            {
                return Check.Fail(ApiErrorCode.ImagesUnavailable);
            }

            // The DM confirmed the job for the type as they saw it after syncing.
            return request.ItemVersion != type.Version ? Check.Fail(ApiErrorCode.ItemChanged) : Check.Ok(type.CampaignId);
        }, cancellationToken);

        return outcome switch
        {
            { Error: { } error } => TypedResults.Conflict(new ApiError(error)),
            { Image: { } image } => QueuedAt(queue, $"/api/campaigns/{campaignId}/creature-types/{creatureTypeId}/icons", image),
            _ => TypedResults.NotFound(),
        };
    }

    // 201 with the new version, already Done and picked. Archived types may still get one,
    // like picking; only generating is refused. Errors (400): UploadInvalid, UploadTooLarge.
    private static async Task<Results<Created<TokenImage>, NotFound, BadRequest<ApiError>>> UploadIcon(
        Guid campaignId,
        Guid creatureTypeId,
        HttpRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        IOptions<ImageOptions> options,
        IAssetStore store,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        if (!await db.CreatureTypes.AnyAsync(t => t.Id == creatureTypeId && t.CampaignId == campaignId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        var (image, error) = await UploadAsync(
            request, db, options.Value, store, time, AssetOwnerType.CreatureType, creatureTypeId, campaignId, user.GetUserId(), cancellationToken);
        return image is null
            ? TypedResults.BadRequest(new ApiError(error!.Value))
            : TypedResults.Created($"/api/campaigns/{campaignId}/creature-types/{creatureTypeId}/icons", image);
    }

    // Sets IconAssetId to a Done version of the type, or null for the letter.
    private static async Task<Results<NoContent, NotFound, Conflict<ApiError>>> PickIcon(
        Guid campaignId,
        Guid creatureTypeId,
        PickTokenImageRequest request,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        if (!await db.CreatureTypes.AnyAsync(t => t.Id == creatureTypeId && t.CampaignId == campaignId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        if (request.AssetId is { } assetId
            && await TokenImages.FinishedAsync(db, AssetOwnerType.CreatureType, creatureTypeId, assetId, cancellationToken) is null)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.ImageNotFound));
        }

        await TokenImages.PickAsync(db, AssetOwnerType.CreatureType, creatureTypeId, request.AssetId, cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<TokenImagesResponse>, NotFound, ForbidHttpResult>> ListPortraits(
        Guid campaignId,
        Guid characterId,
        ClaimsPrincipal user,
        AppDbContext db,
        IOptions<ImageOptions> options,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var (character, allowed) = await CharacterAsync(db, campaignId, characterId, user, cancellationToken);
        if (character is null)
        {
            return TypedResults.NotFound();
        }

        if (!allowed)
        {
            return TypedResults.Forbid();
        }

        return TypedResults.Ok(await TokenImages.ListAsync(
            db, AssetOwnerType.Character, characterId, character.TokenAssetId, options.Value, time, cancellationToken));
    }

    // 202 with the queued version.
    private static async Task<Results<Accepted<TokenImage>, NotFound, ForbidHttpResult, Conflict<ApiError>>> GeneratePortrait(
        Guid campaignId,
        Guid characterId,
        GenerateTokenImageRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        IOptions<ImageOptions> options,
        ImageJobQueue queue,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var (found, allowed) = await CharacterAsync(db, campaignId, characterId, user, cancellationToken);
        if (found is null)
        {
            return TypedResults.NotFound();
        }

        if (!allowed)
        {
            return TypedResults.Forbid();
        }

        var settings = options.Value;
        var outcome = await QueueAsync(db, AssetOwnerType.Character, characterId, user.GetUserId(), request.RestyleAssetId, settings, time, async () =>
        {
            var character = await db.Characters.AsNoTracking()
                .SingleOrDefaultAsync(c => c.Id == characterId && c.CampaignId == campaignId, cancellationToken);
            if (character is null)
            {
                return Check.NotFound;
            }

            if (!settings.Configured)
            {
                return Check.Fail(ApiErrorCode.ImagesUnavailable);
            }

            // A restyle paints one of the character's uploaded versions; a plain portrait
            // is painted from the appearance.
            if (request.RestyleAssetId is { } sourceId)
            {
                var source = await TokenImages.FinishedAsync(db, AssetOwnerType.Character, characterId, sourceId, cancellationToken);
                if (source is not { Origin: AssetOrigin.Uploaded })
                {
                    return Check.Fail(ApiErrorCode.ImageNotFound);
                }
            }
            else if (string.IsNullOrWhiteSpace(character.Appearance))
            {
                return Check.Fail(ApiErrorCode.AppearanceMissing);
            }

            return Check.Ok(character.CampaignId);
        }, cancellationToken);

        return outcome switch
        {
            { Error: { } error } => TypedResults.Conflict(new ApiError(error)),
            { Image: { } image } => QueuedAt(queue, PortraitsUrl(campaignId, characterId), image),
            _ => TypedResults.NotFound(),
        };
    }

    // 201 with the new version, already Done and picked. Errors (400): UploadInvalid,
    // UploadTooLarge.
    private static async Task<Results<Created<TokenImage>, NotFound, ForbidHttpResult, BadRequest<ApiError>>> UploadPortrait(
        Guid campaignId,
        Guid characterId,
        HttpRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        IOptions<ImageOptions> options,
        IAssetStore store,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var (character, allowed) = await CharacterAsync(db, campaignId, characterId, user, cancellationToken);
        if (character is null)
        {
            return TypedResults.NotFound();
        }

        if (!allowed)
        {
            return TypedResults.Forbid();
        }

        var (image, error) = await UploadAsync(
            request, db, options.Value, store, time, AssetOwnerType.Character, characterId, campaignId, user.GetUserId(), cancellationToken);
        return image is null
            ? TypedResults.BadRequest(new ApiError(error!.Value))
            : TypedResults.Created(PortraitsUrl(campaignId, characterId), image);
    }

    // Sets TokenAssetId to a Done version of the character, or null for the letter.
    private static async Task<Results<NoContent, NotFound, ForbidHttpResult, Conflict<ApiError>>> PickPortrait(
        Guid campaignId,
        Guid characterId,
        PickTokenImageRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var (character, allowed) = await CharacterAsync(db, campaignId, characterId, user, cancellationToken);
        if (character is null)
        {
            return TypedResults.NotFound();
        }

        if (!allowed)
        {
            return TypedResults.Forbid();
        }

        if (request.AssetId is { } assetId
            && await TokenImages.FinishedAsync(db, AssetOwnerType.Character, characterId, assetId, cancellationToken) is null)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.ImageNotFound));
        }

        await TokenImages.PickAsync(db, AssetOwnerType.Character, characterId, request.AssetId, cancellationToken);
        return TypedResults.NoContent();
    }

    private static string PortraitsUrl(Guid campaignId, Guid characterId) =>
        $"/api/campaigns/{campaignId}/characters/{characterId}/portraits";

    // The character of the campaign (tracked), and whether the user may change its portrait:
    // its owner or a `dm` member.
    private static async Task<(Character? Character, bool Allowed)> CharacterAsync(
        AppDbContext db, Guid campaignId, Guid characterId, ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var character = await db.Characters
            .SingleOrDefaultAsync(c => c.Id == characterId && c.CampaignId == campaignId, cancellationToken);
        if (character is null)
        {
            return (null, false);
        }

        var userId = user.GetUserId();
        return (character, character.OwnerUserId == userId || await db.IsCampaignDmAsync(campaignId, userId, cancellationToken));
    }

    // Queues a job after a person confirmed it, like a map background: two confirms at once
    // take turns on an app lock, so only one job per owner is queued. check loads the owner
    // and applies the owner's own rules; then one job at a time (GenerationRunning) and the
    // monthly limit (ImageBudgetExhausted). The worker builds the prompt when the job runs.
    internal static async Task<Outcome> QueueAsync(
        AppDbContext db,
        AssetOwnerType ownerType,
        Guid ownerId,
        Guid userId,
        Guid? sourceAssetId,
        ImageOptions settings,
        TimeProvider time,
        Func<Task<Check>> check,
        CancellationToken cancellationToken)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            await db.Database.ExecuteSqlAsync(
                $"EXEC sp_getapplock @Resource = {$"token-image:{ownerType}:{ownerId}"}, @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 20000",
                cancellationToken);

            var result = await check();
            if (result.Found is false)
            {
                return new Outcome(null, null);
            }

            if (result.Error is { } error)
            {
                return new Outcome(null, error);
            }

            if (await TokenImages.JobRunningAsync(db, ownerType, ownerId, cancellationToken))
            {
                return new Outcome(null, ApiErrorCode.GenerationRunning);
            }

            var now = time.GetUtcNow();
            if (await MapBackgrounds.SpentSinceAsync(db, MapBackgrounds.MonthStart(now), cancellationToken) >= settings.MonthlyLimitUsd)
            {
                return new Outcome(null, ApiErrorCode.ImageBudgetExhausted);
            }

            var asset = new Asset
            {
                Id = Guid.NewGuid(),
                Kind = AssetKind.TokenIcon,
                OwnerType = ownerType,
                OwnerId = ownerId,
                CampaignId = result.CampaignId,
                Origin = AssetOrigin.Generated,
                Status = AssetStatus.Queued,
                Model = settings.Deployment,
                Quality = settings.TokenQuality,
                SourceAssetId = sourceAssetId,
                CreatedAt = now,
                CreatedByUserId = userId,
            };
            db.Assets.Add(asset);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return new Outcome(TokenImages.ToView(asset), null);
        });
    }

    internal static Accepted<TokenImage> QueuedAt(ImageJobQueue queue, string location, TokenImage image)
    {
        queue.Notify();
        return TypedResults.Accepted(location, image);
    }

    // The accepted types are only described in the OpenAPI document, not set as Accepts
    // metadata: routing would answer any other type with the /api fallback's 404, where the
    // app needs UploadInvalid.
    private static RouteHandlerBuilder AcceptsRawPicture(this RouteHandlerBuilder endpoint) =>
        endpoint.AddOpenApiOperationTransformer((operation, _, _) =>
        {
            operation.RequestBody = new OpenApiRequestBody
            {
                Required = true,
                Content = TokenPicture.UploadFormats.Keys.ToDictionary(
                    type => type,
                    _ => new OpenApiMediaType { Schema = new OpenApiSchema { Type = JsonSchemaType.String, Format = "byte" } }),
            };
            return Task.CompletedTask;
        });

    // Checks an uploaded picture and stores it as a new Done version of the owner, picked at
    // once: the version, or why not (UploadInvalid, UploadTooLarge). The pick goes through
    // TokenImages.PickAsync, so a creature type's sync version stays as it is.
    private static async Task<(TokenImage? Image, ApiErrorCode? Error)> UploadAsync(
        HttpRequest request,
        AppDbContext db,
        ImageOptions settings,
        IAssetStore store,
        TimeProvider time,
        AssetOwnerType ownerType,
        Guid ownerId,
        Guid campaignId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        if (!MediaTypeHeaderValue.TryParse(request.ContentType, out var mediaType)
            || !TokenPicture.UploadFormats.TryGetValue(mediaType.MediaType.ToString(), out var declared))
        {
            return (null, ApiErrorCode.UploadInvalid);
        }

        if (request.ContentLength > settings.UploadMaxBytes)
        {
            return (null, ApiErrorCode.UploadTooLarge);
        }

        var body = await ReadBodyAsync(request, settings.UploadMaxBytes, cancellationToken);
        if (body is null)
        {
            return (null, ApiErrorCode.UploadTooLarge);
        }

        // The bytes must be the picture the Content-Type says.
        var picture = TokenPicture.Identify(body) == declared
            ? TokenPicture.FromUpload(body, settings.TokenPixels, settings.UploadMaxPixels)
            : null;
        if (picture is null)
        {
            return (null, ApiErrorCode.UploadInvalid);
        }

        var now = time.GetUtcNow();
        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            Kind = AssetKind.TokenIcon,
            OwnerType = ownerType,
            OwnerId = ownerId,
            CampaignId = campaignId,
            Origin = AssetOrigin.Uploaded,
            Status = AssetStatus.Done,
            ContentType = TokenPicture.ContentType,
            CreatedAt = now,
            CreatedByUserId = userId,
            FinishedAt = now,
        };
        asset.BlobName = TokenImages.BlobName(ownerType, ownerId, asset.Id);
        await store.SaveAsync(asset.BlobName, picture, TokenPicture.ContentType, cancellationToken);

        db.Assets.Add(asset);
        await db.SaveChangesAsync(cancellationToken);
        await TokenImages.PickAsync(db, ownerType, ownerId, asset.Id, cancellationToken);
        return (TokenImages.ToView(asset), null);
    }

    // Reads at most maxBytes; null when the body is longer.
    private static async Task<byte[]?> ReadBodyAsync(HttpRequest request, int maxBytes, CancellationToken cancellationToken)
    {
        // Kestrel's own limit (30 MB by default) mustn't cut in below the setting.
        if (request.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit
            && limit.MaxRequestBodySize < maxBytes + 1L)
        {
            limit.MaxRequestBodySize = maxBytes + 1L;
        }

        using var buffer = new MemoryStream();
        var chunk = new byte[81920];
        int read;
        while ((read = await request.Body.ReadAsync(chunk, cancellationToken)) > 0)
        {
            if (buffer.Length + read > maxBytes)
            {
                return null;
            }

            buffer.Write(chunk, 0, read);
        }

        return buffer.ToArray();
    }

    internal sealed record Check(bool Found, ApiErrorCode? Error, Guid CampaignId)
    {
        public static readonly Check NotFound = new(false, null, Guid.Empty);

        public static Check Fail(ApiErrorCode error) => new(true, error, Guid.Empty);

        public static Check Ok(Guid campaignId) => new(true, null, campaignId);
    }

    internal sealed record Outcome(TokenImage? Image, ApiErrorCode? Error);
}
