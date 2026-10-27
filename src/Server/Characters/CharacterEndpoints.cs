using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Characters;

// knowledge/domain/character.md: players create and edit their own characters;
// `dm` members edit any character in the campaign and give characters to members.
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

    // Owned by the signed-in user, or by the member a `dm` member picked.
    private static async Task<Results<Created<CharacterResponse>, BadRequest<ApiError>, ForbidHttpResult>> CreateCharacter(
        Guid campaignId,
        CharacterRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        if (Validate(request, out var texts) is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        var userId = user.GetUserId();
        var ownerUserId = request.OwnerUserId ?? userId;
        if (ownerUserId != userId)
        {
            if (!await db.IsCampaignDmAsync(campaignId, userId, cancellationToken))
            {
                return TypedResults.Forbid();
            }

            if (!await db.IsCampaignMemberAsync(campaignId, ownerUserId, cancellationToken))
            {
                return TypedResults.BadRequest(new ApiError(ApiErrorCode.NotAMember, "ownerUserId"));
            }
        }

        var character = new Character
        {
            CampaignId = campaignId,
            OwnerUserId = ownerUserId,
            Name = texts.Name,
            Size = request.Size,
            Appearance = texts.Appearance,
            Background = texts.Background,
            Personality = texts.Personality,
            Bonds = texts.Bonds,
            Tagline = texts.Tagline,
            CharacterClass = texts.CharacterClass,
            Species = texts.Species,
            Age = texts.Age,
            Color = texts.Color,
            CreatedAt = time.GetUtcNow(),
        };
        db.Characters.Add(character);
        await db.SaveChangesAsync(cancellationToken);

        var response = await LoadAsync(db, campaignId, character.Id, userId, cancellationToken);
        return TypedResults.Created($"/api/campaigns/{campaignId}/characters/{character.Id}", response);
    }

    // 403 unless the owner or a `dm` member, and for a new owner unless a `dm` member. A new
    // owner plays the character in every session that doesn't hand it to someone else, so
    // a running fight with it reloads its boards.
    private static async Task<Results<Ok<CharacterResponse>, BadRequest<ApiError>, NotFound, ForbidHttpResult>> UpdateCharacter(
        Guid campaignId,
        Guid characterId,
        CharacterRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        [FromServices] TableBroadcaster table,
        CancellationToken cancellationToken)
    {
        var character = await db.Characters
            .SingleOrDefaultAsync(c => c.Id == characterId && c.CampaignId == campaignId, cancellationToken);
        if (character is null)
        {
            return TypedResults.NotFound();
        }

        var userId = user.GetUserId();
        var isDm = await db.IsCampaignDmAsync(campaignId, userId, cancellationToken);
        if (character.OwnerUserId != userId && !isDm)
        {
            return TypedResults.Forbid();
        }

        if (Validate(request, out var texts) is { } error)
        {
            return TypedResults.BadRequest(error);
        }

        var newOwner = request.OwnerUserId is { } ownerUserId && ownerUserId != character.OwnerUserId ? ownerUserId : (Guid?)null;
        if (newOwner is not null)
        {
            if (!isDm)
            {
                return TypedResults.Forbid();
            }

            if (!await db.IsCampaignMemberAsync(campaignId, newOwner.Value, cancellationToken))
            {
                return TypedResults.BadRequest(new ApiError(ApiErrorCode.NotAMember, "ownerUserId"));
            }

            character.OwnerUserId = newOwner.Value;
        }

        character.Name = texts.Name;
        character.Size = request.Size;
        character.Appearance = texts.Appearance;
        character.Background = texts.Background;
        character.Personality = texts.Personality;
        character.Bonds = texts.Bonds;
        character.Tagline = texts.Tagline;
        character.CharacterClass = texts.CharacterClass;
        character.Species = texts.Species;
        character.Age = texts.Age;
        character.Color = texts.Color;
        await db.SaveChangesAsync(cancellationToken);
        if (newOwner is not null)
        {
            await CharacterPlayers.ChangedAsync(
                db.Encounters.Where(e => e.CampaignId == campaignId && e.Tokens.Any(t => t.CharacterId == characterId)),
                table,
                cancellationToken);
        }

        return TypedResults.Ok(await LoadAsync(db, campaignId, character.Id, userId, cancellationToken));
    }

    private static ApiError? Validate(CharacterRequest request, out Texts texts)
    {
        texts = new Texts(
            request.Name?.Trim() ?? "",
            request.Appearance?.Trim() ?? "",
            request.Background?.Trim() ?? "",
            request.Personality?.Trim() ?? "",
            request.Bonds?.Trim() ?? "",
            request.Tagline?.Trim() ?? "",
            request.CharacterClass?.Trim() ?? "",
            request.Species?.Trim() ?? "",
            request.Age?.Trim() ?? "",
            request.Color?.Trim().ToLowerInvariant() is { Length: > 0 } picked ? picked : null);
        if (texts.Name.Length is 0 or > Character.NameMaxLength)
        {
            return new ApiError(ApiErrorCode.NameInvalid, "name");
        }

        foreach (var (text, max, field) in new[]
        {
            (texts.Appearance, Character.AppearanceMaxLength, "appearance"),
            (texts.Background, Character.BackgroundMaxLength, "background"),
            (texts.Personality, Character.PersonalityMaxLength, "personality"),
            (texts.Bonds, Character.BondsMaxLength, "bonds"),
            (texts.Tagline, Character.TaglineMaxLength, "tagline"),
            (texts.CharacterClass, Character.FactMaxLength, "characterClass"),
            (texts.Species, Character.FactMaxLength, "species"),
            (texts.Age, Character.FactMaxLength, "age"),
        })
        {
            if (text.Length > max)
            {
                return new ApiError(ApiErrorCode.TextTooLong, field);
            }
        }

        if (texts.Color is not null && !IsHexColor(texts.Color))
        {
            return new ApiError(ApiErrorCode.ColorInvalid, "color");
        }

        return null;
    }

    // "#" and six hex digits, already in lower case.
    private static bool IsHexColor(string color) =>
        color.Length == Character.ColorLength && color[0] == '#' && color[1..].All(char.IsAsciiHexDigitLower);

    private static async Task<CharacterResponse> LoadAsync(
        AppDbContext db, Guid campaignId, Guid characterId, Guid userId, CancellationToken cancellationToken)
    {
        var isDm = await db.IsCampaignDmAsync(campaignId, userId, cancellationToken);
        var character = await Responses(db.Characters.Where(c => c.Id == characterId), userId, isDm).SingleAsync(cancellationToken);
        return (await WithColorsAsync(db, campaignId, [character], cancellationToken))[0];
    }

    // ColorIndex and PortraitUrl are filled in afterwards (WithColorsAsync): SQL Server
    // would write the asset id in capitals, and the URL must match the board's.
    private static IQueryable<Row> Responses(IQueryable<Character> characters, Guid userId, bool isDm) =>
        characters.Select(c => new Row(
            new CharacterResponse(
                c.Id,
                c.OwnerUserId,
                c.Owner.DisplayName,
                c.Name,
                c.Size,
                isDm || c.OwnerUserId == userId,
                0,
                c.Appearance,
                null,
                c.Color,
                c.Background,
                c.Personality,
                c.Bonds,
                c.Tagline,
                c.CharacterClass,
                c.Species,
                c.Age),
            c.TokenAssetId));

    private static async Task<List<CharacterResponse>> WithColorsAsync(
        AppDbContext db, Guid campaignId, List<Row> characters, CancellationToken cancellationToken)
    {
        var colors = await db.CharacterColorIndexesAsync(campaignId, cancellationToken);
        return
        [
            .. characters.Select(c => c.Response with
            {
                ColorIndex = colors[c.Response.Id],
                PortraitUrl = c.TokenAssetId is { } assetId ? MapBackgrounds.Url(assetId) : null,
            }),
        ];
    }

    private sealed record Texts(
        string Name, string Appearance, string Background, string Personality, string Bonds, string Tagline,
        string CharacterClass, string Species, string Age, string? Color);

    private sealed record Row(CharacterResponse Response, Guid? TokenAssetId);
}
