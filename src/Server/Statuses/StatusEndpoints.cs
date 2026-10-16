using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Statuses;

// Status lists, custom statuses and their icons (knowledge/features/statuses.md). Statuses
// on tokens go through the table hub instead (TableHub.AddStatus…). Campaign members only;
// 404 for a character, status or encounter that isn't the campaign's.
//
// Contract step of stage 9: the signatures are final, the bodies come with the backend lane.
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

    private static Task<Ok<List<StatusDefinitionView>>> ListStatuses(
        Guid campaignId, AppDbContext db, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    // 201 with the new status, added at the end of the list. 403 when the caller may not
    // edit that list; 404 for a character of another campaign.
    private static Task<Results<Created<StatusDefinitionView>, BadRequest<ApiError>, NotFound, ForbidHttpResult>> CreateStatus(
        Guid campaignId, CreateStatusRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    private static Task<Results<Ok<StatusListResponse>, NotFound>> GetCharacterList(
        Guid campaignId, Guid characterId, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    private static Task<Results<Ok<StatusListResponse>, BadRequest<ApiError>, NotFound, ForbidHttpResult>> SetCharacterList(
        Guid campaignId, Guid characterId, SetStatusListRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    private static Task<Results<Ok<StatusListResponse>, ForbidHttpResult>> GetDmList(
        Guid campaignId, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    private static Task<Results<Ok<StatusListResponse>, BadRequest<ApiError>, ForbidHttpResult>> SetDmList(
        Guid campaignId, SetStatusListRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    private static Task<Results<Ok<StatusPickerResponse>, NotFound>> GetPicker(
        Guid campaignId, Guid encounterId, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    private static Task<Results<Ok<TokenImagesResponse>, NotFound, ForbidHttpResult>> ListIcons(
        Guid campaignId, Guid statusId, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    private static Task<Results<Accepted<TokenImage>, NotFound, ForbidHttpResult, Conflict<ApiError>>> GenerateIcon(
        Guid campaignId, Guid statusId, GenerateTokenImageRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    private static Task<Results<NoContent, NotFound, ForbidHttpResult, Conflict<ApiError>>> PickIcon(
        Guid campaignId, Guid statusId, PickTokenImageRequest request, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken) =>
        throw new NotImplementedException();
}
