using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Statuses;

// Status lists, custom statuses and their icons (knowledge/features/statuses.md). Statuses
// on tokens go through the table hub instead (TableHub.AddStatus…). Campaign members only;
// 404 for a character, status or encounter that isn't the campaign's.
public static class StatusEndpoints
{
    public static IEndpointRouteBuilder MapStatusEndpoints(this IEndpointRouteBuilder app)
    {
        var campaign = app.MapGroup("/api/campaigns/{campaignId:guid}")
            .WithTags("Statuses")
            .RequireAuthorization(Policies.CampaignMember);

        // Every status the campaign can put in a list: the 15 conditions, then its custom
        // statuses by name. For the status list editor's "add" choice.
        campaign.MapGet("/statuses", ListStatuses);
        campaign.MapPost("/statuses", CreateStatus);

        // A character's list: readable by every member, changed by its owner and `dm` members (403).
        campaign.MapGet("/characters/{characterId:guid}/status-list", GetCharacterList);
        campaign.MapPut("/characters/{characterId:guid}/status-list", SetCharacterList);

        // The caller's own DM status list: `dm` members only (403).
        campaign.MapGet("/dm-status-list", GetDmList);
        campaign.MapPut("/dm-status-list", SetDmList);

        // The picker for a running encounter: 404 unless the encounter is active.
        campaign.MapGet("/encounters/{encounterId:guid}/status-picker", GetPicker);

        // A custom status's icon versions, generated like creature icons
        // (knowledge/features/token-icons.md): who may edit the character it was made for,
        // or any `dm` member for a DM's status (403 otherwise). 404 for library statuses.
        // Generate errors (409): ImagesUnavailable, ImageBudgetExhausted, GenerationRunning.
        // GenerateTokenImageRequest's ItemVersion and RestyleAssetId are ignored.
        campaign.MapGet("/statuses/{statusId:guid}/icons", ListIcons);
        campaign.MapPost("/statuses/{statusId:guid}/icons", GenerateIcon);
        campaign.MapPut("/statuses/{statusId:guid}/icon", PickIcon);

        return app;
    }

    private static async Task<Ok<List<StatusDefinitionView>>> ListStatuses(
        Guid campaignId, AppDbContext db, CancellationToken cancellationToken)
    {
        var statuses = await db.StatusDefinitions.AsNoTracking()
            .Where(s => s.CampaignId == null || s.CampaignId == campaignId)
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(StatusViews.InLibraryOrder(statuses).Select(StatusViews.ToView).ToList());
    }

    // 201 with the new status, added at the end of the list. 403 when the caller may not
    // edit that list; 404 for a character of another campaign. Name is trimmed; an empty
    // IconDescription is stored as none.
    private static async Task<Results<Created<StatusDefinitionView>, BadRequest<ApiError>, NotFound, ForbidHttpResult>> CreateStatus(
        Guid campaignId, CreateStatusRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var isDm = await db.IsCampaignDmAsync(campaignId, userId, cancellationToken);
        if (request.CharacterId is { } characterId)
        {
            var owner = await OwnerAsync(db, campaignId, characterId, cancellationToken);
            if (owner is null)
            {
                return TypedResults.NotFound();
            }

            if (owner != userId && !isDm)
            {
                return TypedResults.Forbid();
            }
        }
        else if (!isDm)
        {
            return TypedResults.Forbid();
        }

        var name = (request.Name ?? "").Trim();
        if (name.Length is 0 or > StatusDefinition.NameMaxLength)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.NameInvalid, "name"));
        }

        var description = (request.IconDescription ?? "").Trim();
        if (description.Length > StatusDefinition.IconDescriptionMaxLength)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.TextTooLong, "iconDescription"));
        }

        var now = time.GetUtcNow();
        var listId = await StatusLists.EnsureAsync(db, campaignId, request.CharacterId, userId, now, cancellationToken);
        var status = new StatusDefinition
        {
            Id = Guid.NewGuid(),
            CampaignId = campaignId,
            Name = name,
            IconDescription = description.Length == 0 ? null : description,
            HasLevels = request.HasLevels,
            CharacterId = request.CharacterId,
            CreatedByUserId = userId,
            CreatedAt = now,
        };
        db.StatusDefinitions.Add(status);
        await StatusLists.AppendAsync(db, listId, status.Id, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Created($"/api/campaigns/{campaignId}/statuses", StatusViews.ToView(status));
    }

    private static async Task<Results<Ok<StatusListResponse>, NotFound>> GetCharacterList(
        Guid campaignId, Guid characterId, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var owner = await OwnerAsync(db, campaignId, characterId, cancellationToken);
        if (owner is null)
        {
            return TypedResults.NotFound();
        }

        var userId = user.GetUserId();
        var listId = await StatusLists.EnsureAsync(db, campaignId, characterId, null, time.GetUtcNow(), cancellationToken);
        var canEdit = owner == userId || await db.IsCampaignDmAsync(campaignId, userId, cancellationToken);
        return TypedResults.Ok(await ResponseAsync(db, listId, characterId, canEdit, cancellationToken));
    }

    // Duplicates and ids that are neither a library status nor a custom status of the
    // campaign: 400 StatusNotFound with Field "statusIds[i]" (the first bad one), or
    // "statusIds" when the list is missing.
    private static async Task<Results<Ok<StatusListResponse>, BadRequest<ApiError>, NotFound, ForbidHttpResult>> SetCharacterList(
        Guid campaignId, Guid characterId, SetStatusListRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var owner = await OwnerAsync(db, campaignId, characterId, cancellationToken);
        if (owner is null)
        {
            return TypedResults.NotFound();
        }

        var userId = user.GetUserId();
        if (owner != userId && !await db.IsCampaignDmAsync(campaignId, userId, cancellationToken))
        {
            return TypedResults.Forbid();
        }

        if (await CheckIdsAsync(db, campaignId, request.StatusIds, cancellationToken) is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        var listId = await StatusLists.EnsureAsync(db, campaignId, characterId, null, time.GetUtcNow(), cancellationToken);
        await StatusLists.ReplaceAsync(db, listId, request.StatusIds, cancellationToken);
        return TypedResults.Ok(await ResponseAsync(db, listId, characterId, canEdit: true, cancellationToken));
    }

    private static async Task<Results<Ok<StatusListResponse>, ForbidHttpResult>> GetDmList(
        Guid campaignId, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        if (!await db.IsCampaignDmAsync(campaignId, userId, cancellationToken))
        {
            return TypedResults.Forbid();
        }

        var listId = await StatusLists.EnsureAsync(db, campaignId, null, userId, time.GetUtcNow(), cancellationToken);
        return TypedResults.Ok(await ResponseAsync(db, listId, null, canEdit: true, cancellationToken));
    }

    // Bad ids as for a character's list.
    private static async Task<Results<Ok<StatusListResponse>, BadRequest<ApiError>, ForbidHttpResult>> SetDmList(
        Guid campaignId, SetStatusListRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        if (!await db.IsCampaignDmAsync(campaignId, userId, cancellationToken))
        {
            return TypedResults.Forbid();
        }

        if (await CheckIdsAsync(db, campaignId, request.StatusIds, cancellationToken) is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        var listId = await StatusLists.EnsureAsync(db, campaignId, null, userId, time.GetUtcNow(), cancellationToken);
        await StatusLists.ReplaceAsync(db, listId, request.StatusIds, cancellationToken);
        return TypedResults.Ok(await ResponseAsync(db, listId, null, canEdit: true, cancellationToken));
    }

    // Characters taken off the board are left out: no status can be put on them. The session
    // DM's own list is first, also when they have no character in the fight; a player with
    // no character in the fight gets no lists.
    private static async Task<Results<Ok<StatusPickerResponse>, NotFound>> GetPicker(
        Guid campaignId, Guid encounterId, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var encounter = await db.Encounters.AsNoTracking()
            .Where(e => e.Id == encounterId && e.CampaignId == campaignId && e.Status == EncounterStatus.Active)
            .Select(e => new
            {
                SessionDmUserId = (Guid?)e.Session.DmUserId,
                Characters = e.Tokens
                    .Where(t => t.Kind == TokenKind.Character && t.RemovedAt == null)
                    .Select(t => new { Id = t.CharacterId!.Value, t.Character!.Name, t.Character.OwnerUserId })
                    .ToList(),
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (encounter is null)
        {
            return TypedResults.NotFound();
        }

        var userId = user.GetUserId();
        var isSessionDm = encounter.SessionDmUserId == userId;
        var now = time.GetUtcNow();
        var lists = new List<(StatusListKind Kind, Guid? CharacterId, string? Name, Guid ListId)>();
        if (isSessionDm)
        {
            lists.Add((StatusListKind.Dm, null, null, await StatusLists.EnsureAsync(db, campaignId, null, userId, now, cancellationToken)));
        }

        var characters = encounter.Characters
            .Where(c => isSessionDm || c.OwnerUserId == userId)
            .OrderBy(c => c.Name, StringComparer.CurrentCultureIgnoreCase)
            .ThenBy(c => c.Id);
        foreach (var character in characters)
        {
            var listId = await StatusLists.EnsureAsync(db, campaignId, character.Id, null, now, cancellationToken);
            lists.Add((StatusListKind.Character, character.Id, character.Name, listId));
        }

        var statuses = await StatusLists.StatusesAsync(db, [.. lists.Select(l => l.ListId)], cancellationToken);
        return TypedResults.Ok(new StatusPickerResponse(
            [.. lists.Select(l => new StatusPickerList(l.Kind, l.CharacterId, l.Name, statuses[l.ListId]))]));
    }

    private static async Task<Results<Ok<TokenImagesResponse>, NotFound, ForbidHttpResult>> ListIcons(
        Guid campaignId,
        Guid statusId,
        ClaimsPrincipal user,
        AppDbContext db,
        IOptions<ImageOptions> options,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var (status, allowed) = await StatusIcons.AccessAsync(db, campaignId, statusId, user.GetUserId(), cancellationToken);
        if (status is null)
        {
            return TypedResults.NotFound();
        }

        if (!allowed)
        {
            return TypedResults.Forbid();
        }

        return TypedResults.Ok(await TokenImages.ListAsync(
            db, AssetOwnerType.Status, statusId, status.IconAssetId, options.Value, time, cancellationToken));
    }

    // 202 with the queued version; the first one to finish of each job becomes the pick, as
    // for creature icons.
    private static async Task<Results<Accepted<TokenImage>, NotFound, ForbidHttpResult, Conflict<ApiError>>> GenerateIcon(
        Guid campaignId,
        Guid statusId,
        GenerateTokenImageRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        IOptions<ImageOptions> options,
        ImageJobQueue queue,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var (found, allowed) = await StatusIcons.AccessAsync(db, campaignId, statusId, userId, cancellationToken);
        if (found is null)
        {
            return TypedResults.NotFound();
        }

        if (!allowed)
        {
            return TypedResults.Forbid();
        }

        var settings = options.Value;
        var outcome = await TokenImageEndpoints.QueueAsync(db, AssetOwnerType.Status, statusId, userId, null, settings, time, async () =>
        {
            if (!await db.StatusDefinitions.AnyAsync(s => s.Id == statusId && s.CampaignId == campaignId, cancellationToken))
            {
                return TokenImageEndpoints.Check.NotFound;
            }

            return settings.Configured
                ? TokenImageEndpoints.Check.Ok(campaignId)
                : TokenImageEndpoints.Check.Fail(ApiErrorCode.ImagesUnavailable);
        }, cancellationToken);

        return outcome switch
        {
            { Error: { } error } => TypedResults.Conflict(new ApiError(error)),
            { Image: { } image } => TokenImageEndpoints.QueuedAt(queue, $"/api/campaigns/{campaignId}/statuses/{statusId}/icons", image),
            _ => TypedResults.NotFound(),
        };
    }

    // Sets IconAssetId to a Done version of the status, or null for its first letter.
    private static async Task<Results<NoContent, NotFound, ForbidHttpResult, Conflict<ApiError>>> PickIcon(
        Guid campaignId, Guid statusId, PickTokenImageRequest request, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var (status, allowed) = await StatusIcons.AccessAsync(db, campaignId, statusId, user.GetUserId(), cancellationToken);
        if (status is null)
        {
            return TypedResults.NotFound();
        }

        if (!allowed)
        {
            return TypedResults.Forbid();
        }

        if (request.AssetId is { } assetId
            && await TokenImages.FinishedAsync(db, AssetOwnerType.Status, statusId, assetId, cancellationToken) is null)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.ImageNotFound));
        }

        await TokenImages.PickAsync(db, AssetOwnerType.Status, statusId, request.AssetId, cancellationToken);
        return TypedResults.NoContent();
    }

    // The owner of the campaign's character, or null.
    private static Task<Guid?> OwnerAsync(AppDbContext db, Guid campaignId, Guid characterId, CancellationToken cancellationToken) =>
        db.Characters
            .Where(c => c.Id == characterId && c.CampaignId == campaignId)
            .Select(c => (Guid?)c.OwnerUserId)
            .SingleOrDefaultAsync(cancellationToken);

    private static async Task<ApiError?> CheckIdsAsync(
        AppDbContext db, Guid campaignId, List<Guid>? statusIds, CancellationToken cancellationToken)
    {
        if (statusIds is null)
        {
            return new ApiError(ApiErrorCode.StatusNotFound, "statusIds");
        }

        var valid = (await db.StatusDefinitions
                .Where(s => s.CampaignId == null || s.CampaignId == campaignId)
                .Select(s => s.Id)
                .ToListAsync(cancellationToken))
            .ToHashSet();
        var seen = new HashSet<Guid>();
        for (var i = 0; i < statusIds.Count; i++)
        {
            if (!valid.Contains(statusIds[i]) || !seen.Add(statusIds[i]))
            {
                return new ApiError(ApiErrorCode.StatusNotFound, $"statusIds[{i}]");
            }
        }

        return null;
    }

    private static async Task<StatusListResponse> ResponseAsync(
        AppDbContext db, Guid listId, Guid? characterId, bool canEdit, CancellationToken cancellationToken) =>
        new(listId, characterId, (await StatusLists.StatusesAsync(db, [listId], cancellationToken))[listId], canEdit);
}
