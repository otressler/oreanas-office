using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Characters;

// knowledge/features/character-import.md: a player takes one of their characters from
// another campaign into this one. The copy is independent of its source from then on:
// texts, facts, size, colour and the picked portrait are copied, nothing else.
public static class CharacterImport
{
    public static void Map(RouteGroupBuilder characters)
    {
        characters.MapGet("/importable", ListImportable);
        characters.MapPost("/import", Import);
    }

    // The signed-in user's characters in their other campaigns, by campaign and name.
    private static async Task<Ok<List<ImportableCharacterResponse>>> ListImportable(
        Guid campaignId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var rows = await Importable(db, campaignId, userId)
            .OrderBy(c => c.Campaign.Name)
            .ThenBy(c => c.Name)
            .Select(c => new
            {
                Response = new ImportableCharacterResponse(
                    c.Id, c.CampaignId, c.Campaign.Name, c.Name, c.Size, c.Tagline, c.CharacterClass, c.Species, c.Color, null),
                c.TokenAssetId,
            })
            .ToListAsync(cancellationToken);

        // The URL is built here, like CharacterEndpoints: SQL Server would write the id in capitals.
        return TypedResults.Ok(rows
            .Select(r => r.Response with
            {
                PortraitUrl = r.TokenAssetId is { } assetId ? MapBackgrounds.Url(assetId) : null,
            })
            .ToList());
    }

    // 404 unless the source is one of the user's characters in another campaign they belong to.
    private static async Task<Results<Created<CharacterResponse>, NotFound>> Import(
        Guid campaignId,
        ImportCharacterRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        IAssetStore store,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var source = await Importable(db, campaignId, userId)
            .AsNoTracking()
            .SingleOrDefaultAsync(c => c.Id == request.CharacterId, cancellationToken);
        if (source is null)
        {
            return TypedResults.NotFound();
        }

        var now = time.GetUtcNow();
        var copy = new Character
        {
            CampaignId = campaignId,
            OwnerUserId = userId,
            Name = source.Name,
            Size = source.Size,
            Appearance = source.Appearance,
            Background = source.Background,
            Personality = source.Personality,
            Bonds = source.Bonds,
            Tagline = source.Tagline,
            CharacterClass = source.CharacterClass,
            Species = source.Species,
            Age = source.Age,
            Color = source.Color,
            CreatedAt = now,
        };
        db.Characters.Add(copy);
        await db.SaveChangesAsync(cancellationToken);

        if (source.TokenAssetId is { } portraitId)
        {
            await CopyPortraitAsync(db, store, portraitId, copy, userId, now, cancellationToken);
        }

        var response = await CharacterEndpoints.LoadAsync(db, campaignId, copy.Id, userId, cancellationToken);
        return TypedResults.Created($"/api/campaigns/{campaignId}/characters/{copy.Id}", response);
    }

    // Owned by the user, in another campaign the user is still a member of.
    private static IQueryable<Character> Importable(AppDbContext db, Guid campaignId, Guid userId) =>
        db.Characters.Where(c =>
            c.OwnerUserId == userId
            && c.CampaignId != campaignId
            && db.CampaignMembers.Any(m => m.CampaignId == c.CampaignId && m.UserId == userId));

    // The picked portrait becomes the copy's only version, picked, with a picture of its
    // own: its source's campaign may be left or deleted later. It costs nothing, so it
    // doesn't count against the monthly limit. A picture that can't be read is skipped;
    // the copy then shows its letter.
    private static async Task CopyPortraitAsync(
        AppDbContext db,
        IAssetStore store,
        Guid portraitId,
        Character copy,
        Guid userId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var portrait = await db.Assets.AsNoTracking()
            .SingleOrDefaultAsync(a => a.Id == portraitId && a.Status == AssetStatus.Done, cancellationToken);
        if (portrait?.BlobName is not { } blobName)
        {
            return;
        }

        byte[] picture;
        await using (var read = await store.OpenReadAsync(blobName, cancellationToken))
        {
            if (read is null)
            {
                return;
            }

            using var buffer = new MemoryStream();
            await read.CopyToAsync(buffer, cancellationToken);
            picture = buffer.ToArray();
        }

        var asset = new Asset
        {
            Id = Guid.NewGuid(),
            Kind = AssetKind.TokenIcon,
            OwnerType = AssetOwnerType.Character,
            OwnerId = copy.Id,
            CampaignId = copy.CampaignId,
            Origin = portrait.Origin,
            Status = AssetStatus.Done,
            Prompt = portrait.Prompt,
            Model = portrait.Model,
            Quality = portrait.Quality,
            ContentType = portrait.ContentType,
            CreatedAt = now,
            CreatedByUserId = userId,
            FinishedAt = now,
        };
        asset.BlobName = TokenImages.BlobName(AssetOwnerType.Character, copy.Id, asset.Id);
        await store.SaveAsync(asset.BlobName, picture, portrait.ContentType ?? TokenPicture.ContentType, cancellationToken);
        db.Assets.Add(asset);
        await db.SaveChangesAsync(cancellationToken);
        await TokenImages.PickAsync(db, AssetOwnerType.Character, copy.Id, asset.Id, cancellationToken);
    }
}
