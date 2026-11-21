using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images;
using Microsoft.Net.Http.Headers;

namespace OreanasOffice.Server.Spells;

// What the studio shows for a picture: generated or uploaded, its status as a request, and
// the motif revision it came from. QueuePosition: 1 for the next job of the whole site.
public record SpellArtImage(
    Guid Id,
    string? Letter,
    Guid? PromptId,
    AssetOrigin Origin,
    AssetStatus Status,
    string? Url,
    AssetFailure? Failure,
    string? Prompt,
    string? Model,
    string? Quality,
    int Attempts,
    int? QueuePosition,
    DateTimeOffset CreatedAt,
    DateTimeOffset? StartedAt,
    DateTimeOffset? FinishedAt);

public record SpellArtPromptView(Guid Id, string Letter, string Subject, SpellArtPromptSource Source, DateTimeOffset CreatedAt);

public record SpellArtEventView(Guid Id, Guid? AssetId, SpellArtEventKind Kind, string? Value, DateTimeOffset CreatedAt, string UserName);

public record SpellArtGenerator(bool Available, string? Model, string Quality, int Width, int Height);

// Everything the studio needs for one variant. CanEdit: the author or a site admin.
public record SpellStudio(
    SpellVariantView Variant,
    bool CanEdit,
    SpellArtGenerator Generator,
    ImageBudgetResponse Budget,
    List<SpellArtPromptView> Prompts,
    List<SpellArtImage> Images,
    List<SpellArtEventView> Events);

// Saves a revision of a motif (unless the subject is the current one) and, with Generate,
// queues a picture of it.
public record SaveArtPromptRequest(string Letter, string Subject, bool Generate = false);

public record SaveArtPromptResponse(SpellArtPromptView Prompt, SpellArtImage? Image);

// Queues a picture of a revision: PromptId, or the current one of Letter.
public record GenerateArtRequest(string? Letter = null, Guid? PromptId = null);

public record PickArtRequest(Guid AssetId);

public record ApproveArtRequest(bool Approved);

public record AddArtEventRequest(SpellArtEventKind Kind, Guid? AssetId = null, string? Value = null);

// knowledge/features/spell-cards.md, "Art studio".
public static class SpellArt
{
    // Open requests per variant (queued or running), so a stuck finger can't spend the month.
    public const int MaxOpenRequests = 6;

    public static string BlobName(Guid variantId, Guid assetId) => $"spells/{variantId}/{assetId}.webp";

    // The style block's first line, the subject, then the rest: the spell-cards studio's
    // prompt format.
    public static string FullPrompt(string style, string subject)
    {
        var lines = style.Replace("\r\n", "\n").Trim().Split('\n');
        return string.Join('\n', [lines[0].Trim(), $"Subject: {subject.Trim()}", .. lines.Skip(1).Select(l => l.Trim())]);
    }

    public static IEndpointRouteBuilder MapSpellArtEndpoints(this IEndpointRouteBuilder app)
    {
        var studio = app.MapGroup("/api/spells/variants/{variantId:guid}/studio").WithTags("Spells").RequireAuthorization();
        studio.MapGet("/", GetStudio);
        studio.MapPost("/prompts", SavePrompt);
        studio.MapPost("/generate", Generate);
        studio.MapPost("/upload", Upload).AcceptsRawPicture();
        studio.MapPut("/art", PickArt);
        studio.MapPut("/approved", Approve);
        studio.MapPost("/events", AddEvent);
        studio.MapDelete("/requests/{assetId:guid}", CancelRequest);
        return app;
    }

    private static async Task<Results<Ok<SpellStudio>, NotFound>> GetStudio(
        Guid variantId, ClaimsPrincipal user, AppDbContext db, IOptions<ImageOptions> options, TimeProvider time, CancellationToken cancellationToken)
    {
        var variant = (await SpellEndpoints.ViewsAsync(db, db.SpellVariants.Where(v => v.Id == variantId), user, cancellationToken)).SingleOrDefault();
        if (variant is null)
        {
            return TypedResults.NotFound();
        }

        var settings = options.Value;
        var prompts = await db.SpellArtPrompts.AsNoTracking()
            .Where(p => p.VariantId == variantId)
            .OrderBy(p => p.CreatedAt)
            .Select(p => new SpellArtPromptView(p.Id, p.Letter, p.Subject, p.Source, p.CreatedAt))
            .ToListAsync(cancellationToken);
        var events = await db.SpellArtEvents.AsNoTracking()
            .Where(e => e.VariantId == variantId)
            .OrderBy(e => e.CreatedAt)
            .Join(db.Users, e => e.UserId, u => u.Id, (e, u) => new SpellArtEventView(e.Id, e.AssetId, e.Kind, e.Value, e.CreatedAt, u.DisplayName))
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(new SpellStudio(
            variant,
            variant.CanEdit,
            new SpellArtGenerator(settings.Configured, settings.Deployment, settings.SpellArtQuality, settings.SpellArtRequestWidth, settings.SpellArtRequestHeight),
            await MapBackgrounds.BudgetAsync(db, settings, time, cancellationToken),
            prompts,
            await ImagesAsync(db, variantId, prompts, null, cancellationToken),
            events));
    }

    private static async Task<Results<Ok<SaveArtPromptResponse>, NotFound, BadRequest<ApiError>, Conflict<ApiError>>> SavePrompt(
        Guid variantId,
        SaveArtPromptRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        IOptions<ImageOptions> options,
        ImageJobQueue queue,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        switch (await AccessAsync(db, variantId, user, cancellationToken))
        {
            case null:
                return TypedResults.NotFound();
            case false:
                return TypedResults.Conflict(new ApiError(ApiErrorCode.NotSpellAuthor));
        }

        var letter = request.Letter?.Trim().ToLowerInvariant() ?? "";
        var subject = request.Subject?.Trim() ?? "";
        if (letter.Length != 1 || letter[0] is < 'a' or > 'z' || subject.Length is 0 or > SpellArtPrompt.SubjectMaxLength)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.ArtPromptInvalid));
        }

        var current = await CurrentPromptAsync(db, variantId, letter, cancellationToken);
        if (current?.Subject != subject)
        {
            current = new SpellArtPrompt
            {
                Id = Guid.NewGuid(),
                VariantId = variantId,
                Letter = letter,
                Subject = subject,
                Source = SpellArtPromptSource.Studio,
                CreatedAt = time.GetUtcNow(),
                CreatedByUserId = user.GetUserId(),
            };
            db.SpellArtPrompts.Add(current);
            await db.SaveChangesAsync(cancellationToken);
        }

        SpellArtImage? image = null;
        if (request.Generate)
        {
            var (queued, error) = await QueueAsync(db, options.Value, time, variantId, current, user.GetUserId(), cancellationToken);
            if (error is { } code)
            {
                return TypedResults.Conflict(new ApiError(code));
            }

            queue.Notify();
            image = queued;
        }

        return TypedResults.Ok(new SaveArtPromptResponse(ToView(current), image));
    }

    private static async Task<Results<Accepted<SpellArtImage>, NotFound, BadRequest<ApiError>, Conflict<ApiError>>> Generate(
        Guid variantId,
        GenerateArtRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        IOptions<ImageOptions> options,
        ImageJobQueue queue,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        switch (await AccessAsync(db, variantId, user, cancellationToken))
        {
            case null:
                return TypedResults.NotFound();
            case false:
                return TypedResults.Conflict(new ApiError(ApiErrorCode.NotSpellAuthor));
        }

        var prompt = request.PromptId is { } promptId
            ? await db.SpellArtPrompts.AsNoTracking().SingleOrDefaultAsync(p => p.Id == promptId && p.VariantId == variantId, cancellationToken)
            : await CurrentPromptAsync(db, variantId, request.Letter?.Trim().ToLowerInvariant() ?? "", cancellationToken);
        if (prompt is null)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.ArtPromptInvalid));
        }

        var (image, error) = await QueueAsync(db, options.Value, time, variantId, prompt, user.GetUserId(), cancellationToken);
        if (error is { } code)
        {
            return TypedResults.Conflict(new ApiError(code));
        }

        queue.Notify();
        return TypedResults.Accepted($"/api/spells/variants/{variantId}/studio", image!);
    }

    // A picture of the variant, cropped to 7:12. Letter: the motif it belongs to, or none.
    private static async Task<Results<Ok<SpellArtImage>, NotFound, Conflict<ApiError>>> Upload(
        Guid variantId,
        string? letter,
        HttpRequest http,
        ClaimsPrincipal user,
        AppDbContext db,
        IAssetStore store,
        IOptions<ImageOptions> options,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        switch (await AccessAsync(db, variantId, user, cancellationToken))
        {
            case null:
                return TypedResults.NotFound();
            case false:
                return TypedResults.Conflict(new ApiError(ApiErrorCode.NotSpellAuthor));
        }

        var settings = options.Value;
        if (!MediaTypeHeaderValue.TryParse(http.ContentType, out var mediaType)
            || !TokenPicture.UploadFormats.TryGetValue(mediaType.MediaType.ToString(), out var declared))
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.UploadInvalid));
        }

        if (http.ContentLength > settings.UploadMaxBytes)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.UploadTooLarge));
        }

        var body = await TokenImageEndpoints.ReadBodyAsync(http, settings.UploadMaxBytes, cancellationToken);
        if (body is null)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.UploadTooLarge));
        }

        var picture = TokenPicture.Identify(body) == declared
            ? TokenPicture.FromUpload(body, settings.SpellArtWidth, settings.SpellArtHeight, settings.UploadMaxPixels)
            : null;
        if (picture is null)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.UploadInvalid));
        }

        var key = letter?.Trim().ToLowerInvariant();
        var prompt = key is { Length: 1 } ? await CurrentPromptAsync(db, variantId, key, cancellationToken) : null;
        var now = time.GetUtcNow();
        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            Kind = AssetKind.SpellArt,
            OwnerType = AssetOwnerType.SpellVariant,
            OwnerId = variantId,
            Origin = AssetOrigin.Uploaded,
            Status = AssetStatus.Done,
            ContentType = TokenPicture.ContentType,
            SpellArtPromptId = prompt?.Id,
            CreatedAt = now,
            CreatedByUserId = user.GetUserId(),
            FinishedAt = now,
        };
        asset.BlobName = BlobName(variantId, asset.Id);
        await store.SaveAsync(asset.BlobName, picture, TokenPicture.ContentType, cancellationToken);
        db.Assets.Add(asset);
        await db.SaveChangesAsync(cancellationToken);
        await db.SpellVariants
            .Where(v => v.Id == variantId && v.ArtAssetId == null)
            .ExecuteUpdateAsync(set => set.SetProperty(v => v.ArtAssetId, asset.Id), cancellationToken);
        return TypedResults.Ok((await ImagesAsync(db, variantId, null, asset.Id, cancellationToken)).Single());
    }

    private static async Task<Results<NoContent, NotFound, Conflict<ApiError>>> PickArt(
        Guid variantId, PickArtRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var variant = await db.SpellVariants.SingleOrDefaultAsync(v => v.Id == variantId, cancellationToken);
        if (variant is null)
        {
            return TypedResults.NotFound();
        }

        if (!SpellEndpoints.CanEdit(variant, user))
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.NotSpellAuthor));
        }

        if (!await Pictures(db, variantId).AnyAsync(a => a.Id == request.AssetId && a.Status == AssetStatus.Done, cancellationToken))
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.ImageNotFound));
        }

        variant.ArtAssetId = request.AssetId;
        variant.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, NotFound, Conflict<ApiError>>> Approve(
        Guid variantId, ApproveArtRequest request, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var variant = await db.SpellVariants.SingleOrDefaultAsync(v => v.Id == variantId, cancellationToken);
        if (variant is null)
        {
            return TypedResults.NotFound();
        }

        if (!SpellEndpoints.CanEdit(variant, user))
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.NotSpellAuthor));
        }

        variant.ArtApproved = request.Approved;
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    // Comments ("Notiz" without a picture), ★ and ✕ ("1" on, "0" off) and hiding a failed
    // request. Only the author and admins review.
    private static async Task<Results<Ok<SpellArtEventView>, NotFound, BadRequest<ApiError>, Conflict<ApiError>>> AddEvent(
        Guid variantId, AddArtEventRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        switch (await AccessAsync(db, variantId, user, cancellationToken))
        {
            case null:
                return TypedResults.NotFound();
            case false:
                return TypedResults.Conflict(new ApiError(ApiErrorCode.NotSpellAuthor));
        }

        if (!Enum.IsDefined(request.Kind)
            || (request.AssetId is { } assetId && !await Pictures(db, variantId).AnyAsync(a => a.Id == assetId, cancellationToken))
            || (request.Kind != SpellArtEventKind.Comment && request.AssetId is null))
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.ImageNotFound, "assetId"));
        }

        var value = request.Kind switch
        {
            SpellArtEventKind.Comment => request.Value?.Trim() ?? "",
            SpellArtEventKind.Dismiss => null,
            _ => request.Value == "0" ? "0" : "1",
        };
        if (request.Kind == SpellArtEventKind.Comment && value is not { Length: > 0 and <= SpellArtEvent.ValueMaxLength })
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.TextTooLong, "value"));
        }

        var e = new SpellArtEvent
        {
            Id = Guid.NewGuid(),
            VariantId = variantId,
            AssetId = request.AssetId,
            Kind = request.Kind,
            Value = value,
            CreatedAt = time.GetUtcNow(),
            UserId = user.GetUserId(),
        };
        db.SpellArtEvents.Add(e);
        await db.SaveChangesAsync(cancellationToken);
        var name = await db.Users.Where(u => u.Id == e.UserId).Select(u => u.DisplayName).SingleAsync(cancellationToken);
        return TypedResults.Ok(new SpellArtEventView(e.Id, e.AssetId, e.Kind, e.Value, e.CreatedAt, name));
    }

    // "Abbrechen" on a request still in the queue: it never ran and cost nothing, so its row
    // goes. A request that started meanwhile stays.
    private static async Task<Results<NoContent, NotFound, Conflict<ApiError>>> CancelRequest(
        Guid variantId, Guid assetId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        switch (await AccessAsync(db, variantId, user, cancellationToken))
        {
            case null:
                return TypedResults.NotFound();
            case false:
                return TypedResults.Conflict(new ApiError(ApiErrorCode.NotSpellAuthor));
        }

        var deleted = await Pictures(db, variantId)
            .Where(a => a.Id == assetId && a.Status == AssetStatus.Queued)
            .ExecuteDeleteAsync(cancellationToken);
        return deleted > 0 ? TypedResults.NoContent() : TypedResults.Conflict(new ApiError(ApiErrorCode.GenerationRunning));
    }

    private static IQueryable<Asset> Pictures(AppDbContext db, Guid variantId) =>
        db.Assets.Where(a => a.Kind == AssetKind.SpellArt && a.OwnerType == AssetOwnerType.SpellVariant && a.OwnerId == variantId);

    private static async Task<(SpellArtImage? Image, ApiErrorCode? Error)> QueueAsync(
        AppDbContext db, ImageOptions settings, TimeProvider time, Guid variantId, SpellArtPrompt prompt, Guid userId, CancellationToken cancellationToken)
    {
        if (!settings.Configured)
        {
            return (null, ApiErrorCode.ImagesUnavailable);
        }

        var now = time.GetUtcNow();
        if (await MapBackgrounds.SpentSinceAsync(db, MapBackgrounds.MonthStart(now), cancellationToken) >= settings.MonthlyLimitUsd)
        {
            return (null, ApiErrorCode.ImageBudgetExhausted);
        }

        if (await Pictures(db, variantId).CountAsync(a => a.Status == AssetStatus.Queued || a.Status == AssetStatus.Running, cancellationToken) >= MaxOpenRequests)
        {
            return (null, ApiErrorCode.GenerationRunning);
        }

        var full = FullPrompt(settings.SpellArtStyle, prompt.Subject);
        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            Kind = AssetKind.SpellArt,
            OwnerType = AssetOwnerType.SpellVariant,
            OwnerId = variantId,
            Origin = AssetOrigin.Generated,
            Status = AssetStatus.Queued,
            Model = settings.Deployment,
            Quality = settings.SpellArtQuality,
            Prompt = full.Length <= Asset.PromptMaxLength ? full : full[..Asset.PromptMaxLength],
            SpellArtPromptId = prompt.Id,
            CreatedAt = now,
            CreatedByUserId = userId,
        };
        db.Assets.Add(asset);
        await db.SaveChangesAsync(cancellationToken);
        return ((await ImagesAsync(db, variantId, null, asset.Id, cancellationToken)).Single(), null);
    }

    // The variant's pictures, newest first (or only one), with each queued one's place in
    // the site's queue.
    private static async Task<List<SpellArtImage>> ImagesAsync(
        AppDbContext db, Guid variantId, List<SpellArtPromptView>? prompts, Guid? only, CancellationToken cancellationToken)
    {
        var assets = await Pictures(db, variantId).AsNoTracking()
            .Where(a => only == null || a.Id == only)
            .OrderByDescending(a => a.CreatedAt)
            .ToListAsync(cancellationToken);
        var letters = prompts?.ToDictionary(p => p.Id, p => p.Letter)
            ?? await db.SpellArtPrompts.AsNoTracking().Where(p => p.VariantId == variantId).ToDictionaryAsync(p => p.Id, p => p.Letter, cancellationToken);
        var queue = assets.Any(a => a.Status == AssetStatus.Queued)
            ? await db.Assets.AsNoTracking()
                .Where(a => a.Status == AssetStatus.Queued)
                .OrderBy(a => a.CreatedAt)
                .ThenBy(a => a.Id)
                .Select(a => a.Id)
                .ToListAsync(cancellationToken)
            : [];
        return [.. assets.Select(a => new SpellArtImage(
            a.Id,
            a.SpellArtPromptId is { } p && letters.TryGetValue(p, out var l) ? l : null,
            a.SpellArtPromptId,
            a.Origin,
            a.Status,
            a.Status == AssetStatus.Done ? MapBackgrounds.Url(a.Id) : null,
            a.Status == AssetStatus.Failed ? a.Failure : null,
            a.Prompt,
            a.Model,
            a.Quality,
            a.Attempts,
            a.Status == AssetStatus.Queued ? queue.IndexOf(a.Id) + 1 : null,
            a.CreatedAt,
            a.StartedAt,
            a.FinishedAt))];
    }

    private static Task<SpellArtPrompt?> CurrentPromptAsync(AppDbContext db, Guid variantId, string letter, CancellationToken cancellationToken) =>
        db.SpellArtPrompts
            .Where(p => p.VariantId == variantId && p.Letter == letter)
            .OrderByDescending(p => p.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

    private static SpellArtPromptView ToView(SpellArtPrompt p) => new(p.Id, p.Letter, p.Subject, p.Source, p.CreatedAt);

    // Null: no such variant; false: not the author or an admin.
    private static async Task<bool?> AccessAsync(AppDbContext db, Guid variantId, ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var author = await db.SpellVariants.Where(v => v.Id == variantId).Select(v => (Guid?)v.AuthorUserId).SingleOrDefaultAsync(cancellationToken);
        if (author is null)
        {
            return null;
        }

        return author == user.GetUserId() || user.IsAdmin();
    }
}
