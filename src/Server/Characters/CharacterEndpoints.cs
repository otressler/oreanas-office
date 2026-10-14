using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Characters;

// knowledge/domain/character.md: players create and edit their own characters;
// `dm` members edit any character in the campaign.
public static class CharacterEndpoints
{
    public static IEndpointRouteBuilder MapCharacterEndpoints(this IEndpointRouteBuilder app)
    {
        var characters = app.MapGroup("/api/campaigns/{campaignId:guid}/characters")
            .WithTags("Characters")
            .RequireAuthorization(Policies.CampaignMember);

        characters.MapGet("/", ListCharacters);
        characters.MapPost("/", CreateCharacter);
        characters.MapPut("/{characterId:guid}", UpdateCharacter);

        return app;
    }

    private static async Task<Ok<List<CharacterResponse>>> ListCharacters(
        Guid campaignId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var isDm = await db.IsCampaignDmAsync(campaignId, userId, cancellationToken);
        var characters = await Responses(
                db.Characters.Where(c => c.CampaignId == campaignId).OrderBy(c => c.Name), userId, isDm)
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(await WithColorsAsync(db, campaignId, characters, cancellationToken));
    }

    // Owned by the signed-in user.
    private static async Task<Results<Created<CharacterResponse>, BadRequest<ApiError>>> CreateCharacter(
        Guid campaignId,
        CharacterRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        if (Validate(request, out var name) is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        var userId = user.GetUserId();
        var character = new Character
        {
            CampaignId = campaignId,
            OwnerUserId = userId,
            Name = name,
            Size = request.Size,
            CreatedAt = time.GetUtcNow(),
        };
        db.Characters.Add(character);
        await db.SaveChangesAsync(cancellationToken);

        var response = await LoadAsync(db, campaignId, character.Id, userId, cancellationToken);
        return TypedResults.Created($"/api/campaigns/{campaignId}/characters/{character.Id}", response);
    }

    // 403 unless the owner or a `dm` member.
    private static async Task<Results<Ok<CharacterResponse>, BadRequest<ApiError>, NotFound, ForbidHttpResult>> UpdateCharacter(
        Guid campaignId,
        Guid characterId,
        CharacterRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        CancellationToken cancellationToken)
    {
        var character = await db.Characters
            .SingleOrDefaultAsync(c => c.Id == characterId && c.CampaignId == campaignId, cancellationToken);
        if (character is null)
        {
            return TypedResults.NotFound();
        }

        var userId = user.GetUserId();
        if (character.OwnerUserId != userId && !await db.IsCampaignDmAsync(campaignId, userId, cancellationToken))
        {
            return TypedResults.Forbid();
        }

        if (Validate(request, out var name) is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        character.Name = name;
        character.Size = request.Size;
        await db.SaveChangesAsync(cancellationToken);

        return TypedResults.Ok(await LoadAsync(db, campaignId, character.Id, userId, cancellationToken));
    }

    private static ApiError? Validate(CharacterRequest request, out string name)
    {
        name = request.Name?.Trim() ?? "";
        if (name.Length is 0 or > Character.NameMaxLength)
        {
            return new ApiError(ApiErrorCode.NameInvalid, "name");
        }

        return null;
    }


    private static async Task<CharacterResponse> LoadAsync(
        AppDbContext db, Guid campaignId, Guid characterId, Guid userId, CancellationToken cancellationToken)
    {
        var isDm = await db.IsCampaignDmAsync(campaignId, userId, cancellationToken);
        var character = await Responses(db.Characters.Where(c => c.Id == characterId), userId, isDm).SingleAsync(cancellationToken);
        return (await WithColorsAsync(db, campaignId, [character], cancellationToken))[0];
    }

    // ColorIndex is filled in afterwards (WithColorsAsync).
    private static IQueryable<CharacterResponse> Responses(IQueryable<Character> characters, Guid userId, bool isDm) =>
        characters.Select(c => new CharacterResponse(
            c.Id,
            c.OwnerUserId,
            c.Owner.DisplayName,
            c.Name,
            c.Size,
            isDm || c.OwnerUserId == userId,
            0));

    private static async Task<List<CharacterResponse>> WithColorsAsync(
        AppDbContext db, Guid campaignId, List<CharacterResponse> characters, CancellationToken cancellationToken)
    {
        var colors = await db.CharacterColorIndexesAsync(campaignId, cancellationToken);
        return [.. characters.Select(c => c with { ColorIndex = colors[c.Id] })];
    }
}
