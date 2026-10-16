using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Statuses;
using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Encounters;

// Tokens as the board draws them (BoardToken), for the board state and for a restored
// token on the table hub.
public static class BoardTokens
{
    // The tokens with their statuses in the order they were put on, creatures first by
    // label, then characters by name. RemovedAt is set on removed tokens; callers decide
    // where those go. Characters: the fight's characters for ping colours, removed ones
    // included.
    public static async Task<(List<BoardToken> Tokens, List<TablePeople.FightCharacter> Characters)> LoadAsync(
        AppDbContext db, Guid campaignId, IQueryable<Token> tokens, CancellationToken cancellationToken)
    {
        var rows = await tokens.AsNoTracking()
            .OrderBy(t => t.Kind == TokenKind.Creature ? 0 : 1)
            .ThenBy(t => t.Kind == TokenKind.Creature ? t.Label : t.Character!.Name)
            .ThenBy(t => t.Id)
            .Select(t => new
            {
                t.Id,
                t.Kind,
                t.CharacterId,
                t.CreatureTypeId,
                OwnerUserId = (Guid?)t.Character!.OwnerUserId,
                Label = t.Kind == TokenKind.Creature ? t.Label : t.Character!.Name,
                t.X,
                t.Y,
                t.Elevation,
                t.Size,
                t.Version,
                // The picked portrait or icon as it is now (knowledge/features/token-icons.md).
                ImageAssetId = t.Kind == TokenKind.Character ? t.Character!.TokenAssetId : t.CreatureType!.IconAssetId,
                Color = t.Kind == TokenKind.Character ? t.Character!.Color : null,
                t.RemovedAt,
            })
            .ToListAsync(cancellationToken);
        if (rows.Count == 0)
        {
            return ([], []);
        }

        var statuses = await StatusViews.OnTokensAsync(db, tokens.Select(t => t.Id), cancellationToken);
        var colors = await db.CharacterColorIndexesAsync(campaignId, cancellationToken);
        var board = rows.Select(t => new BoardToken(
                t.Id,
                t.Kind,
                t.CharacterId,
                t.CreatureTypeId,
                t.Kind == TokenKind.Character ? t.OwnerUserId : null,
                t.Label ?? "",
                t.X,
                t.Y,
                t.Elevation,
                t.Size,
                t.CharacterId is { } characterId ? colors[characterId] : null,
                t.Version,
                t.ImageAssetId is { } imageId ? MapBackgrounds.Url(imageId) : null,
                t.Color,
                [.. statuses[t.Id]],
                t.RemovedAt))
            .ToList();
        var characters = board
            .Where(t => t is { Kind: TokenKind.Character, OwnerUserId: not null, ColorIndex: not null })
            .Select(t => new TablePeople.FightCharacter(t.OwnerUserId!.Value, t.ColorIndex!.Value, t.Color))
            .ToList();
        return (board, characters);
    }
}
