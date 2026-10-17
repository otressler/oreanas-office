using OreanasOffice.Server.Api;
using OreanasOffice.Server.Bestiary;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Encounters;

// Checks an import file (MapFile.cs, knowledge/domain/battle-map.md "Import file") and
// turns it into a battle map, a Ready encounter with its creature tokens and the
// creature types the campaign doesn't have yet. The first broken rule wins; nothing
// is saved here.
public static class MapImport
{
    // Tokens store elevation as decimal(6,1); a map's heights stay well inside it.
    public const decimal MaxElevation = 10000;

    // Feature kinds, labels and ids, entrance labels and ids, and creature labels: as
    // long as a token's label, since the board shows them the same way.
    public const int TextMaxLength = Token.LabelMaxLength;

    public sealed record Result(BattleMap Map, Encounter Encounter, List<CreatureType> NewTypes);

    public static ApiError? Build(
        ImportMapRequest request,
        Guid campaignId,
        Guid sessionId,
        IEnumerable<CreatureType> campaignTypes,
        DateTimeOffset now,
        Guid? userId,
        out Result? result)
    {
        result = null;

        var name = request.Name?.Trim() ?? "";
        if (name.Length is 0 or > BattleMap.NameMaxLength)
        {
            return new ApiError(ApiErrorCode.NameInvalid, "name");
        }

        if (request.Width is < 1 or > BattleMap.MaxSize)
        {
            return new ApiError(ApiErrorCode.MapSizeInvalid, "width");
        }

        if (request.Height is < 1 or > BattleMap.MaxSize)
        {
            return new ApiError(ApiErrorCode.MapSizeInvalid, "height");
        }

        if (Description(request.Scene, "scene", out var scene) is { } sceneError)
        {
            return sceneError;
        }

        if (Description(request.Vibe, "vibe", out var vibe) is { } vibeError)
        {
            return vibeError;
        }

        if (Description(request.Lighting, "lighting", out var lighting) is { } lightingError)
        {
            return lightingError;
        }

        if (Layout(request.Layout, request.Width, request.Height, out var layout) is { } layoutError)
        {
            return layoutError;
        }

        // The shared layout rules catch what the parsing above lets through: overlapping
        // features, entrance cells that aren't walkable or that two entrances share.
        if (MapChecks.Check(name, request.Width, request.Height, layout, scene, vibe, lighting) is [var problem, ..])
        {
            return ToError(problem);
        }

        var map = new BattleMap
        {
            CampaignId = campaignId,
            Name = name,
            Width = request.Width,
            Height = request.Height,
            Layout = layout,
            Scene = scene,
            Vibe = vibe,
            Lighting = lighting,
            CreatedAt = now,
            UpdatedAt = now,
            UpdatedByUserId = userId,
        };
        var encounter = new Encounter
        {
            CampaignId = campaignId,
            SessionId = sessionId,
            BattleMap = map,
            Name = name,
            Status = EncounterStatus.Ready,
            CreatedAt = now,
            UpdatedAt = now,
            UpdatedByUserId = userId,
        };

        var newTypes = new List<CreatureType>();
        if (Creatures(request.Creatures ?? [], new MapGrid(map.Width, map.Height, layout), campaignTypes, encounter, newTypes, now, userId)
            is { } creatureError)
        {
            return creatureError;
        }

        result = new Result(map, encounter, newTypes);
        return null;
    }

    // Meters, one decimal; a missing elevation is 0.
    public static bool TryElevation(decimal? meters, out decimal elevation)
    {
        elevation = Math.Round(meters ?? 0, 1, MidpointRounding.AwayFromZero);
        return Math.Abs(elevation) < MaxElevation;
    }

    // The import's error code and JSON path for the first problem of the shared checks.
    // The parsing above has caught most rules already; what reaches this is mostly
    // overlapping features and entrance cells that aren't walkable or are shared.
    private static ApiError ToError(LayoutProblem problem)
    {
        var index = problem.Item.Index;
        var path = problem.Item.Kind switch
        {
            LayoutItemKind.Cell => $"layout.cells[{index}]",
            LayoutItemKind.Feature => $"layout.features[{index}]",
            LayoutItemKind.Entrance => $"layout.entrances[{index}]",
            _ => problem.Field?.ToString().ToLowerInvariant(),
        };
        return (problem.Code, problem.Item.Kind) switch
        {
            (LayoutProblemCode.TextTooLong, _) => new ApiError(ApiErrorCode.TextTooLong, path),
            (_, LayoutItemKind.Cell) => new ApiError(ApiErrorCode.CellInvalid, path),
            (_, LayoutItemKind.Feature) => new ApiError(ApiErrorCode.FeatureInvalid, path),
            (_, LayoutItemKind.Entrance) => new ApiError(ApiErrorCode.EntranceInvalid, path),
            (LayoutProblemCode.MapSizeInvalid, _) => new ApiError(ApiErrorCode.MapSizeInvalid, "width"),
            (LayoutProblemCode.LayoutVersionUnsupported, _) => new ApiError(ApiErrorCode.LayoutVersionUnsupported, "layout.schemaVersion"),
            _ => new ApiError(ApiErrorCode.NameInvalid, "name"),
        };
    }

    private static ApiError? Description(string? text, string field, out string value)
    {
        value = text?.Trim() ?? "";
        return value.Length > BattleMap.DescriptionMaxLength ? new ApiError(ApiErrorCode.TextTooLong, field) : null;
    }

    private static ApiError? Layout(MapLayoutFile? file, int width, int height, out MapLayout layout)
    {
        layout = null!;
        if (file is null)
        {
            return new ApiError(ApiErrorCode.CellInvalid, "layout.cells");
        }

        if ((file.SchemaVersion ?? MapLayout.CurrentSchemaVersion) != MapLayout.CurrentSchemaVersion)
        {
            return new ApiError(ApiErrorCode.LayoutVersionUnsupported, "layout.schemaVersion");
        }

        if (Cells(file.Cells, width, height, out var cells) is { } cellError)
        {
            return cellError;
        }

        if (Features(file.Features ?? [], width, height, out var features) is { } featureError)
        {
            return featureError;
        }

        if (Entrances(file.Entrances ?? [], width, height, out var entrances) is { } entranceError)
        {
            return entranceError;
        }

        layout = new MapLayout(MapLayout.CurrentSchemaVersion, cells, features, entrances);
        return null;
    }

    // Listed void cells are dropped: a missing cell is void anyway. Stored by row.
    private static ApiError? Cells(List<LayoutCellFile>? file, int width, int height, out List<LayoutCell> cells)
    {
        cells = [];
        if (file is null)
        {
            return new ApiError(ApiErrorCode.CellInvalid, "layout.cells");
        }

        var seen = new HashSet<(int, int)>();
        for (var i = 0; i < file.Count; i++)
        {
            var cell = file[i];
            if (cell is null
                || !Inside(cell.X, cell.Y, width, height)
                || !seen.Add((cell.X, cell.Y))
                || !TryElevation(cell.Elevation, out var elevation))
            {
                return new ApiError(ApiErrorCode.CellInvalid, $"layout.cells[{i}]");
            }

            if (cell.Terrain != Terrain.Void)
            {
                cells.Add(new LayoutCell(cell.X, cell.Y, cell.Terrain, elevation));
            }
        }

        cells = [.. cells.OrderBy(c => c.Y).ThenBy(c => c.X)];
        return null;
    }

    private static ApiError? Features(List<LayoutFeatureFile> file, int width, int height, out List<LayoutFeature> features)
    {
        features = [];
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var checkedFeatures = new List<(LayoutFeatureFile Feature, string? Id, string Kind, string Label, decimal Elevation)>();
        for (var i = 0; i < file.Count; i++)
        {
            var field = $"layout.features[{i}]";
            var feature = file[i];
            var kind = feature?.Kind?.Trim() ?? "";
            if (feature is null || kind.Length == 0)
            {
                return new ApiError(ApiErrorCode.FeatureInvalid, field);
            }

            var id = NullIfEmpty(feature.Id);
            var label = NullIfEmpty(feature.Label) ?? kind;
            if (kind.Length > TextMaxLength || label.Length > TextMaxLength || id?.Length > TextMaxLength)
            {
                return new ApiError(ApiErrorCode.TextTooLong, field);
            }

            if (feature.W < 1
                || feature.H < 1
                || !Inside(feature.X, feature.Y, width, height)
                || feature.W > width - feature.X
                || feature.H > height - feature.Y
                || (id is not null && !ids.Add(id))
                || !TryElevation(feature.Elevation, out var elevation))
            {
                return new ApiError(ApiErrorCode.FeatureInvalid, field);
            }

            checkedFeatures.Add((feature, id, kind, label, elevation));
        }

        var next = 0;
        foreach (var (feature, id, kind, label, elevation) in checkedFeatures)
        {
            features.Add(new LayoutFeature(
                id ?? NextFreeId("f", ids, ref next),
                kind,
                label,
                feature.X,
                feature.Y,
                feature.W,
                feature.H,
                elevation,
                feature.BlocksMovement ?? false));
        }

        return null;
    }

    private static ApiError? Entrances(List<LayoutEntranceFile> file, int width, int height, out List<LayoutEntrance> entrances)
    {
        entrances = [];
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var checkedEntrances = new List<(LayoutEntranceFile Entrance, string? Id, string Label)>();
        for (var i = 0; i < file.Count; i++)
        {
            var field = $"layout.entrances[{i}]";
            var entrance = file[i];
            if (entrance is null)
            {
                return new ApiError(ApiErrorCode.EntranceInvalid, field);
            }

            var id = NullIfEmpty(entrance.Id);
            // No label stays empty: the board names the kind in German itself.
            var label = NullIfEmpty(entrance.Label) ?? "";
            if (label.Length > TextMaxLength || id?.Length > TextMaxLength)
            {
                return new ApiError(ApiErrorCode.TextTooLong, field);
            }

            if (entrance.Cells is not { Count: > 0 }
                || !entrance.Cells.All(cell => cell is [var x, var y] && OnEdge(x, y, width, height))
                || (id is not null && !ids.Add(id)))
            {
                return new ApiError(ApiErrorCode.EntranceInvalid, field);
            }

            checkedEntrances.Add((entrance, id, label));
        }

        var next = 0;
        foreach (var (entrance, id, label) in checkedEntrances)
        {
            entrances.Add(new LayoutEntrance(
                id ?? NextFreeId("e", ids, ref next),
                entrance.Kind,
                label,
                [.. entrance.Cells.Select(cell => new[] { cell[0], cell[1] })]));
        }

        return null;
    }

    // Types match by name ignoring case, like the database's unique index. Unlabeled
    // tokens are numbered per type in file order: "Goblin 1", "Goblin 2".
    private static ApiError? Creatures(
        List<ImportCreature> file,
        MapGrid grid,
        IEnumerable<CreatureType> campaignTypes,
        Encounter encounter,
        List<CreatureType> newTypes,
        DateTimeOffset now,
        Guid? userId)
    {
        var types = new Dictionary<string, CreatureType>(StringComparer.OrdinalIgnoreCase);
        foreach (var type in campaignTypes)
        {
            types.TryAdd(type.Name, type);
        }

        var numbers = new Dictionary<CreatureType, int>();
        var placement = new TokenPlacement(grid);
        for (var i = 0; i < file.Count; i++)
        {
            var field = $"creatures[{i}]";
            var creature = file[i];
            var typeName = creature?.Type?.Trim() ?? "";
            if (creature is null || typeName.Length is 0 or > CreatureType.NameMaxLength)
            {
                return new ApiError(ApiErrorCode.CreatureTypeInvalid, field);
            }

            if (!types.TryGetValue(typeName, out var type))
            {
                if (creature.Size is not { } size)
                {
                    return new ApiError(ApiErrorCode.CreatureTypeInvalid, field);
                }

                type = new CreatureType
                {
                    CampaignId = encounter.CampaignId,
                    Name = typeName,
                    Size = size,
                    CreatedAt = now,
                    UpdatedAt = now,
                    UpdatedByUserId = userId,
                };
                types.Add(typeName, type);
                newTypes.Add(type);
            }

            var label = NullIfEmpty(creature.Label);
            if (label?.Length > TextMaxLength)
            {
                return new ApiError(ApiErrorCode.TextTooLong, field);
            }

            if (!placement.TryPlace(type.Size, creature.X, creature.Y, out var elevation))
            {
                return new ApiError(ApiErrorCode.PlacementInvalid, field);
            }

            int? number = null;
            if (label is null)
            {
                numbers[type] = numbers.GetValueOrDefault(type) + 1;
                number = numbers[type];
            }
            else
            {
                (number, label) = CreatureLabels.Split(type.Name, label);
            }

            encounter.Tokens.Add(new Token
            {
                Kind = TokenKind.Creature,
                CreatureType = type,
                Size = type.Size,
                Number = number,
                Label = label,
                X = creature.X,
                Y = creature.Y,
                Elevation = elevation,
                CreatedAt = now.AddTicks(i),
            });
        }

        return null;
    }

    private static string NextFreeId(string prefix, HashSet<string> taken, ref int next)
    {
        string id;
        do
        {
            id = $"{prefix}{++next}";
        }
        while (!taken.Add(id));

        return id;
    }

    private static string? NullIfEmpty(string? text) => string.IsNullOrWhiteSpace(text) ? null : text.Trim();

    private static bool Inside(int x, int y, int width, int height) => x >= 0 && y >= 0 && x < width && y < height;

    private static bool OnEdge(int x, int y, int width, int height) =>
        Inside(x, y, width, height) && (x == 0 || y == 0 || x == width - 1 || y == height - 1);
}
