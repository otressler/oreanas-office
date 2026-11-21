using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Net.Http.Headers;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images;
using SkiaSharp;

namespace OreanasOffice.Server.Spells;

// knowledge/features/spell-cards.md, "Creating a spell": "Nach Name" and "Aus Foto". Both
// answer drafts; the editor saves them through SpellEndpoints. Errors (409):
// TextModelUnavailable, ImageBudgetExhausted (the month's AI budget is used up),
// SpellNotRecognized, SpellNotInWiki, SpellImportFailed; for photos also UploadInvalid and
// UploadTooLarge.
public static class SpellImportEndpoints
{
    public static IEndpointRouteBuilder MapSpellImportEndpoints(this IEndpointRouteBuilder app)
    {
        var import = app.MapGroup("/api/spells/import").WithTags("Spells").RequireAuthorization();
        import.MapGet("/", Status);
        import.MapPost("/name", ByName);
        import.MapPost("/photo", ByPhoto).AcceptsRawPicture();
        return app;
    }

    private static async Task<Ok<SpellImportStatus>> Status(
        SpellImport import, AppDbContext db, IOptions<ImageOptions> options, TimeProvider time, CancellationToken cancellationToken) =>
        TypedResults.Ok(new SpellImportStatus(import.Available, await MapBackgrounds.BudgetAsync(db, options.Value, time, cancellationToken)));

    private static async Task<Results<Ok<ImportByNameResponse>, BadRequest<ApiError>, Conflict<ApiError>>> ByName(
        ImportByNameRequest request, ClaimsPrincipal user, SpellImport import, AppDbContext db, CancellationToken cancellationToken)
    {
        var input = request.Name?.Trim() ?? "";
        if (input.Length is 0 or > Spell.NameMaxLength)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.SpellInvalid, "name"));
        }

        if (await PreconditionAsync(import, cancellationToken) is { } blocked)
        {
            return TypedResults.Conflict(blocked);
        }

        var userId = user.GetUserId();
        try
        {
            var nameEn = await import.EnglishNameAsync(input, userId, cancellationToken);
            if (nameEn is null)
            {
                return TypedResults.Conflict(new ApiError(ApiErrorCode.SpellNotRecognized));
            }

            var key = Spell.KeyOf(nameEn);
            var existing = await db.Spells.Where(s => s.NameKey == key).Select(s => (Guid?)s.Id).SingleOrDefaultAsync(cancellationToken);
            if (existing is not null && !request.Force)
            {
                return TypedResults.Ok(new ImportByNameResponse(nameEn, existing, null));
            }

            var page = await import.WikiPageAsync(nameEn, cancellationToken);
            if (page is null)
            {
                return TypedResults.Conflict(new ApiError(ApiErrorCode.SpellNotInWiki));
            }

            var draft = await import.DraftFromWikiAsync(nameEn, page, userId, cancellationToken);
            if (draft is null)
            {
                return TypedResults.Conflict(new ApiError(ApiErrorCode.SpellNotRecognized));
            }

            var withExisting = (await import.WithExistingAsync([draft], cancellationToken)).Single();
            return TypedResults.Ok(new ImportByNameResponse(nameEn, withExisting.ExistingSpellId, withExisting));
        }
        catch (SpellImportException ex)
        {
            return TypedResults.Conflict(new ApiError(ex.Refused ? ApiErrorCode.SpellNotRecognized : ApiErrorCode.SpellImportFailed));
        }
    }

    private static async Task<Results<Ok<ImportByPhotoResponse>, Conflict<ApiError>>> ByPhoto(
        HttpRequest http, ClaimsPrincipal user, SpellImport import, IOptions<ImageOptions> options, CancellationToken cancellationToken)
    {
        var settings = options.Value;
        if (!MediaTypeHeaderValue.TryParse(http.ContentType, out var mediaType)
            || !TokenPicture.UploadFormats.TryGetValue(mediaType.MediaType.ToString(), out var declared))
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.UploadInvalid));
        }

        if (http.ContentLength > settings.SpellPhotoMaxBytes)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.UploadTooLarge));
        }

        var body = await TokenImageEndpoints.ReadBodyAsync(http, settings.SpellPhotoMaxBytes, cancellationToken);
        if (body is null)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.UploadTooLarge));
        }

        var photo = TokenPicture.Identify(body) == declared ? Upright(body, settings.SpellPhotoPixels, settings.UploadMaxPixels) : null;
        if (photo is null)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.UploadInvalid));
        }

        if (await PreconditionAsync(import, cancellationToken) is { } blocked)
        {
            return TypedResults.Conflict(blocked);
        }

        try
        {
            var drafts = await import.DraftsFromPhotoAsync(new ImageInput(photo, "image/jpeg"), user.GetUserId(), cancellationToken);
            if (drafts.Count == 0)
            {
                return TypedResults.Conflict(new ApiError(ApiErrorCode.SpellNotRecognized));
            }

            return TypedResults.Ok(new ImportByPhotoResponse(await import.WithExistingAsync(drafts, cancellationToken)));
        }
        catch (SpellImportException ex)
        {
            return TypedResults.Conflict(new ApiError(ex.Refused ? ApiErrorCode.SpellNotRecognized : ApiErrorCode.SpellImportFailed));
        }
    }

    private static async Task<ApiError?> PreconditionAsync(SpellImport import, CancellationToken cancellationToken)
    {
        if (!import.Available)
        {
            return new ApiError(ApiErrorCode.TextModelUnavailable);
        }

        return await import.BudgetLeftAsync(cancellationToken) ? null : new ApiError(ApiErrorCode.ImageBudgetExhausted);
    }

    // The photo upright and at most maxEdge on its long edge, as a JPEG for the model; null
    // when it can't be read or is larger than maxPixels on an edge.
    internal static byte[]? Upright(byte[] bytes, int maxEdge, int maxPixels)
    {
        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data);
        if (codec is null || codec.Info.Width <= 0 || codec.Info.Height <= 0
            || codec.Info.Width > maxPixels || codec.Info.Height > maxPixels)
        {
            return null;
        }

        using var source = SKBitmap.Decode(codec);
        if (source is null)
        {
            return null;
        }

        var origin = codec.EncodedOrigin;
        var swaps = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var (uprightWidth, uprightHeight) = swaps ? (source.Height, source.Width) : (source.Width, source.Height);
        var scale = Math.Min(1f, (float)maxEdge / Math.Max(uprightWidth, uprightHeight));
        var width = Math.Max(1, (int)Math.Round(uprightWidth * scale));
        var height = Math.Max(1, (int)Math.Round(uprightHeight * scale));

        using var image = SKImage.FromBitmap(source);
        using var target = new SKBitmap(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul));
        using (var canvas = new SKCanvas(target))
        {
            canvas.Clear(SKColors.White);
            canvas.Scale(scale);
            TokenPicture.Orient(canvas, origin, source.Width, source.Height);
            canvas.DrawImage(image, 0, 0, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        }

        using var pixmap = target.PeekPixels();
        using var jpeg = pixmap.Encode(SKEncodedImageFormat.Jpeg, 85);
        return jpeg?.ToArray();
    }
}
