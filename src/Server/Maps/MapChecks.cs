namespace OreanasOffice.Server.Maps;

// The layout rules of a battle map, the same as src/web/src/editor/validation.ts and its
// shared cases in validation.cases.json (knowledge/decisions/offline-prep-pwa.md,
// "Rejections"). Reports every problem, not only the first, unlike the import's checks.
// Sync and the map store use it; the contract only fixes the shape, the rules follow.
public static class MapChecks
{
    // Text limit of feature kinds, ids and labels and of entrance ids and labels.
    private const int LayoutTextMax = Encounters.MapImport.TextMaxLength;

    // The problems in a stable order: the map, then cells, features and entrances in list
    // order. While the map size itself is invalid, whether cells, features and entrances
    // lie inside the grid, on its edge or on walkable cells isn't checked; everything else
    // is. Numbers that aren't whole never get here (the JSON reader refuses them), so the
    // TypeScript checks for them have no counterpart.
    public static List<LayoutProblem> Check(
        string? name, int width, int height, MapLayout? layout, string? scene, string? vibe, string? lighting)
    {
        var problems = new List<LayoutProblem>();
        var sizeValid = ValidSide(width) && ValidSide(height);
        var onMap = new LayoutProblemItem(LayoutItemKind.Map);

        if (!sizeValid)
        {
            problems.Add(new LayoutProblem(LayoutProblemCode.MapSizeInvalid, onMap));
        }

        if (layout is null || layout.SchemaVersion != MapLayout.CurrentSchemaVersion)
        {
            problems.Add(new LayoutProblem(LayoutProblemCode.LayoutVersionUnsupported, onMap));
        }

        if ((name ?? "").Trim().Length == 0)
        {
            problems.Add(new LayoutProblem(LayoutProblemCode.NameMissing, onMap));
        }

        if (TooLong(name, BattleMap.NameMaxLength))
        {
            problems.Add(new LayoutProblem(LayoutProblemCode.TextTooLong, onMap, LayoutTextField.Name));
        }

        foreach (var (text, field) in new[]
        {
            (scene, LayoutTextField.Scene), (vibe, LayoutTextField.Vibe), (lighting, LayoutTextField.Lighting),
        })
        {
            if (TooLong(text, BattleMap.DescriptionMaxLength))
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.TextTooLong, onMap, field));
            }
        }

        if (layout is not null)
        {
            CheckCells(layout.Cells ?? [], width, height, sizeValid, problems);
            CheckFeatures(layout.Features ?? [], width, height, sizeValid, problems);
            CheckEntrances(layout, width, height, sizeValid, problems);
        }

        return problems;
    }

    private static void CheckCells(List<LayoutCell> cells, int width, int height, bool sizeValid, List<LayoutProblem> problems)
    {
        var listed = new HashSet<(int, int)>();
        for (var index = 0; index < cells.Count; index++)
        {
            var cell = cells[index];
            if (cell is null)
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.CellOutside, new LayoutProblemItem(LayoutItemKind.Cell, index)));
                continue;
            }

            var item = new LayoutProblemItem(LayoutItemKind.Cell, index, cell.X, cell.Y);
            if (sizeValid && !Inside(cell.X, cell.Y, width, height))
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.CellOutside, item));
            }

            if (!listed.Add((cell.X, cell.Y)))
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.CellDuplicate, item));
            }

            if (!Enum.IsDefined(cell.Terrain))
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.TerrainInvalid, item));
            }

            if (!ValidElevation(cell.Elevation))
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.ElevationInvalid, item));
            }
        }
    }

    private static void CheckFeatures(
        List<LayoutFeature> features, int width, int height, bool sizeValid, List<LayoutProblem> problems)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var footprints = new List<(string Id, long X, long Y, long W, long H)>();
        for (var index = 0; index < features.Count; index++)
        {
            var feature = features[index];
            if (feature is null)
            {
                problems.Add(new LayoutProblem(
                    LayoutProblemCode.FeatureSizeInvalid, new LayoutProblemItem(LayoutItemKind.Feature, index, Id: "")));
                continue;
            }

            var id = feature.Id ?? "";
            var item = new LayoutProblemItem(LayoutItemKind.Feature, index, Id: id);
            if (id.Trim().Length == 0)
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.IdMissing, item, LayoutTextField.Id));
            }
            else if (ids.Contains(id))
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.FeatureIdDuplicate, item));
            }

            ids.Add(id);
            if ((feature.Kind ?? "").Trim().Length == 0)
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.FeatureKindMissing, item));
            }

            TextsTooLong(problems, item, (id, LayoutTextField.Id), (feature.Kind, LayoutTextField.Kind), (feature.Label, LayoutTextField.Label));
            if (!ValidElevation(feature.Elevation))
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.ElevationInvalid, item));
            }

            if (feature.W < 1 || feature.H < 1)
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.FeatureSizeInvalid, item));
                continue;
            }

            // long: a footprint of int.MaxValue must not overflow.
            long x = feature.X, y = feature.Y, w = feature.W, h = feature.H;
            if (sizeValid && (x < 0 || y < 0 || x + w > width || y + h > height))
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.FeatureOutside, item));
            }

            foreach (var other in footprints)
            {
                if (x < other.X + other.W && other.X < x + w && y < other.Y + other.H && other.Y < y + h)
                {
                    problems.Add(new LayoutProblem(LayoutProblemCode.FeatureOverlap, item, OtherId: other.Id));
                }
            }

            footprints.Add((id, x, y, w, h));
        }
    }

    private static void CheckEntrances(MapLayout layout, int width, int height, bool sizeValid, List<LayoutProblem> problems)
    {
        var entrances = layout.Entrances ?? [];
        var grid = sizeValid
            ? new MapGrid(width, height, new MapLayout(
                layout.SchemaVersion,
                [.. (layout.Cells ?? []).Where(c => c is not null)],
                [.. (layout.Features ?? []).Where(f => f is not null)],
                []))
            : null;
        var ids = new HashSet<string>(StringComparer.Ordinal);
        var owner = new Dictionary<(int, int), string>();
        for (var index = 0; index < entrances.Count; index++)
        {
            var entrance = entrances[index];
            if (entrance is null)
            {
                problems.Add(new LayoutProblem(
                    LayoutProblemCode.EntranceEmpty, new LayoutProblemItem(LayoutItemKind.Entrance, index, Id: "")));
                continue;
            }

            var id = entrance.Id ?? "";
            var item = new LayoutProblemItem(LayoutItemKind.Entrance, index, Id: id);
            if (id.Trim().Length == 0)
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.IdMissing, item, LayoutTextField.Id));
            }
            else if (ids.Contains(id))
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.EntranceIdDuplicate, item));
            }

            ids.Add(id);
            if (!Enum.IsDefined(entrance.Kind))
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.EntranceKindInvalid, item));
            }

            TextsTooLong(problems, item, (id, LayoutTextField.Id), (entrance.Label, LayoutTextField.Label));
            var cells = entrance.Cells ?? [];
            if (cells.Count == 0)
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.EntranceEmpty, item));
            }

            var own = new HashSet<(int, int)>();
            foreach (var pair in cells)
            {
                if (pair is not [var x, var y] || (grid is not null && !Inside(x, y, width, height)))
                {
                    // A cell with one or three coordinates has no position to name.
                    problems.Add(new LayoutProblem(
                        LayoutProblemCode.EntranceCellOutside,
                        item,
                        Cell: pair is [var px, var py] ? new LayoutCellRef(px, py) : null));
                    continue;
                }

                var cell = new LayoutCellRef(x, y);
                if (grid is not null)
                {
                    if (!(x == 0 || y == 0 || x == width - 1 || y == height - 1))
                    {
                        problems.Add(new LayoutProblem(LayoutProblemCode.EntranceCellNotOnEdge, item, Cell: cell));
                    }

                    if (!grid.Walkable(x, y))
                    {
                        problems.Add(new LayoutProblem(LayoutProblemCode.EntranceCellNotWalkable, item, Cell: cell));
                    }
                }

                if (!own.Add((x, y)))
                {
                    problems.Add(new LayoutProblem(LayoutProblemCode.EntranceCellDuplicate, item, Cell: cell));
                    continue;
                }

                if (owner.TryGetValue((x, y), out var earlier))
                {
                    problems.Add(new LayoutProblem(LayoutProblemCode.EntranceCellShared, item, Cell: cell, OtherId: earlier));
                }
                else
                {
                    owner[(x, y)] = id;
                }
            }
        }
    }

    private static void TextsTooLong(
        List<LayoutProblem> problems, LayoutProblemItem item, params (string? Text, LayoutTextField Field)[] texts)
    {
        foreach (var (text, field) in texts)
        {
            if (TooLong(text, LayoutTextMax))
            {
                problems.Add(new LayoutProblem(LayoutProblemCode.TextTooLong, item, field));
            }
        }
    }

    private static bool TooLong(string? text, int max) => (text ?? "").Trim().Length > max;

    private static bool ValidSide(int n) => n is >= 1 and <= BattleMap.MaxSize;

    private static bool ValidElevation(decimal meters) => Math.Abs(meters) < Encounters.MapImport.MaxElevation;

    private static bool Inside(int x, int y, int width, int height) => x >= 0 && y >= 0 && x < width && y < height;
}

// Where and why a layout breaks a rule, shaped like LayoutProblem in validation.ts.
// Item: what the problem is on. Field: the text that is too long or the id that is
// missing. Cell: the entrance cell the problem is about. OtherId: the other feature or
// entrance in an overlap or a shared cell.
public record LayoutProblem(
    LayoutProblemCode Code, LayoutProblemItem Item, LayoutTextField? Field = null, LayoutCellRef? Cell = null, string? OtherId = null);

// The TypeScript LayoutItem union, flattened. Index: the position in layout.cells,
// features or entrances. X and Y: set for a cell. Id: set for a feature or entrance.
public record LayoutProblemItem(LayoutItemKind Kind, int? Index = null, int? X = null, int? Y = null, string? Id = null);

public record LayoutCellRef(int X, int Y);

public enum LayoutItemKind
{
    Map,
    Cell,
    Feature,
    Entrance,
}

public enum LayoutTextField
{
    Name,
    Scene,
    Vibe,
    Lighting,
    Id,
    Kind,
    Label,
}

// The same codes as the LayoutProblemCode union in validation.ts, as PascalCase names
// (sent as camelCase).
public enum LayoutProblemCode
{
    MapSizeInvalid,
    LayoutVersionUnsupported,
    NameMissing,
    TextTooLong,
    CellOutside,
    CellDuplicate,
    TerrainInvalid,
    ElevationInvalid,
    IdMissing,
    FeatureIdDuplicate,
    FeatureKindMissing,
    FeatureSizeInvalid,
    FeatureOutside,
    FeatureOverlap,
    EntranceIdDuplicate,
    EntranceKindInvalid,
    EntranceEmpty,
    EntranceCellOutside,
    EntranceCellNotOnEdge,
    EntranceCellNotWalkable,
    EntranceCellDuplicate,
    EntranceCellShared,
}
