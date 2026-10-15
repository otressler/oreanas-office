using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Images;

// Token icons for creature types and portraits for characters
// (knowledge/features/token-icons.md). Creature icons: `dm` members only. Portraits: the
// character's owner and every `dm` member (knowledge/domain/character.md); 403 for anyone
// else in the campaign. 404 for an owner that isn't in the campaign.
//
// Uploads send the picture as the raw request body with its Content-Type (image/jpeg,
// image/png or image/webp), not as a form, so a cross-site page can't post one without a
// CORS preflight. The server checks the type and size, turns it the right way up, crops the
// middle square, shrinks it to ImageOptions.TokenPixels and saves it as WebP, which drops
// the photo's metadata.
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
        icons.MapPut("/{creatureTypeId:guid}/icon", PickIcon);

        var portraits = app.MapGroup("/api/campaigns/{campaignId:guid}/characters/{characterId:guid}")
            .WithTags("Images")
            .RequireAuthorization(Policies.CampaignMember);
        portraits.MapGet("/portraits", ListPortraits);
        portraits.MapPost("/portraits", GeneratePortrait);
        portraits.MapPost("/portraits/upload", UploadPortrait)
            .Accepts<byte[]>("image/jpeg", "image/png", "image/webp");
        portraits.MapPut("/portrait", PickPortrait);

        return app;
    }

    // The picked icon of every type of the campaign that has one.
    private static Task<Ok<List<CreatureTypeIcon>>> ListCreatureTypeIcons(
        Guid campaignId, AppDbContext db, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    private static Task<Results<Ok<TokenImagesResponse>, NotFound>> ListIcons(
        Guid campaignId, Guid creatureTypeId, AppDbContext db, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    // 202 with the queued version. 404 for an archived type.
    private static Task<Results<Accepted<TokenImage>, NotFound, Conflict<ApiError>>> GenerateIcon(
        Guid campaignId,
        Guid creatureTypeId,
        GenerateTokenImageRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    private static Task<Results<NoContent, NotFound, Conflict<ApiError>>> PickIcon(
        Guid campaignId,
        Guid creatureTypeId,
        PickTokenImageRequest request,
        AppDbContext db,
        CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    private static Task<Results<Ok<TokenImagesResponse>, NotFound, ForbidHttpResult>> ListPortraits(
        Guid campaignId, Guid characterId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    // 202 with the queued version.
    private static Task<Results<Accepted<TokenImage>, NotFound, ForbidHttpResult, Conflict<ApiError>>> GeneratePortrait(
        Guid campaignId,
        Guid characterId,
        GenerateTokenImageRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    // 201 with the new version, already Done and picked. Errors (400): UploadInvalid,
    // UploadTooLarge.
    private static Task<Results<Created<TokenImage>, NotFound, ForbidHttpResult, BadRequest<ApiError>>> UploadPortrait(
        Guid campaignId,
        Guid characterId,
        HttpRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    private static Task<Results<NoContent, NotFound, ForbidHttpResult, Conflict<ApiError>>> PickPortrait(
        Guid campaignId,
        Guid characterId,
        PickTokenImageRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        CancellationToken cancellationToken) =>
        throw new NotImplementedException();
}
