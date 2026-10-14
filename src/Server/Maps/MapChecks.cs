namespace OreanasOffice.Server.Maps;

// The layout rules of a battle map, the same as src/web/src/editor/validation.ts and its
// shared cases in validation.cases.json (knowledge/decisions/offline-prep-pwa.md,
// "Rejections"). Reports every problem, not only the first, unlike the import's checks.
// Sync and the map store use it; the contract only fixes the shape, the rules follow.
public static class MapChecks
{
    public static List<LayoutProblem> Check(
        string? name, int width, int height, MapLayout? layout, string? scene, string? vibe, string? lighting) => [];
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
