using Microsoft.AspNetCore.Http.HttpResults;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;

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

    private static Task<Ok<List<CharacterResponse>>> ListCharacters(Guid campaignId) =>
        throw new NotImplementedException();

    // Owned by the signed-in user.
    private static Task<Results<Created<CharacterResponse>, BadRequest<ApiError>>> CreateCharacter(
        Guid campaignId, CharacterRequest request) =>
        throw new NotImplementedException();

    // 403 unless the owner or a `dm` member.
    private static Task<Results<Ok<CharacterResponse>, BadRequest<ApiError>, NotFound, ForbidHttpResult>> UpdateCharacter(
        Guid campaignId, Guid characterId, CharacterRequest request) =>
        throw new NotImplementedException();
}
