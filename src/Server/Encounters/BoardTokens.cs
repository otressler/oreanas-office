using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Rules;
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
            .Select(t => new Row
            {
                Id = t.Id,
                Kind = t.Kind,
                CharacterId = t.CharacterId,
                CreatureTypeId = t.CreatureTypeId,
                OwnerUserId = (Guid?)t.Character!.OwnerUserId,
                CharacterName = t.Character!.Name,
                X = t.X,
                Y = t.Y,
                Elevation = t.Elevation,
                Size = t.Size,
                Version = t.Version,
                // The picked portrait or icon as it is now (knowledge/features/token-icons.md).
                ImageAssetId = t.Kind == TokenKind.Character ? t.Character!.TokenAssetId : t.CreatureType!.IconAssetId,
                Color = t.Kind == TokenKind.Character ? t.Character!.Color : null,
                RemovedAt = t.RemovedAt,
                Hidden = t.Hidden,
                Number = t.Number,
                TypeName = t.CreatureType != null ? t.CreatureType.Name : null,
                DmName = t.Label,
            })
            .ToListAsync(cancellationToken);
        if (rows.Count == 0)
        {
            return ([], []);
        }

        var statuses = await StatusViews.OnTokensAsync(db, tokens.Select(t => t.Id), cancellationToken);
        var colors = await db.CharacterColorIndexesAsync(campaignId, cancellationToken);
        var board = rows
            .OrderBy(t => t.Kind == TokenKind.Creature ? 0 : 1)
            .ThenBy(t => LabelOf(t), StringComparer.OrdinalIgnoreCase)
            .ThenBy(t => t.Id)
            .Select(t => new BoardToken(
                t.Id,
                t.Kind,
                t.CharacterId,
                t.CreatureTypeId,
                t.Kind == TokenKind.Character ? t.OwnerUserId : null,
                LabelOf(t),
                t.X,
                t.Y,
                t.Elevation,
                t.Size,
                t.CharacterId is { } characterId ? colors[characterId] : null,
                t.Version,
                t.ImageAssetId is { } imageId ? MapBackgrounds.Url(imageId) : null,
                t.Color,
                [.. statuses[t.Id]],
                t.RemovedAt,
                t.Hidden))
            .ToList();
        var characters = board
            .Where(t => t is { Kind: TokenKind.Character, OwnerUserId: not null, ColorIndex: not null })
            .Select(t => new TablePeople.FightCharacter(t.OwnerUserId!.Value, t.ColorIndex!.Value, t.Color))
            .ToList();
        return (board, characters);
    }

    private static string LabelOf(Row t) => t.Kind == TokenKind.Character
        ? t.CharacterName ?? ""
        : CreatureLabels.Display(t.TypeName ?? "", t.Number, t.DmName);

    private sealed class Row
    {
        public Guid Id { get; init; }

        public TokenKind Kind { get; init; }

        public Guid? CharacterId { get; init; }

        public Guid? CreatureTypeId { get; init; }

        public Guid? OwnerUserId { get; init; }

        public string? CharacterName { get; init; }

        public int X { get; init; }

        public int Y { get; init; }

        public decimal Elevation { get; init; }

        public CreatureSize Size { get; init; }

        public int Version { get; init; }

        public Guid? ImageAssetId { get; init; }

        public string? Color { get; init; }

        public DateTimeOffset? RemovedAt { get; init; }

        public bool Hidden { get; init; }

        public int? Number { get; init; }

        public string? TypeName { get; init; }

        public string? DmName { get; init; }
    }
}
