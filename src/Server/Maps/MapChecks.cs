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

// Where and why a layout breaks a rule. Field: the text that is too long ("name",
// "scene", "vibe", "lighting", "id", "kind", "label"). Id: the feature or entrance the
// problem is on. OtherId: the other feature or entrance in an overlap or a shared cell.
// X and Y: the listed cell, or the entrance cell, the problem is about.
public record LayoutProblem(
    LayoutProblemCode Code, string? Field = null, string? Id = null, string? OtherId = null, int? X = null, int? Y = null);

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
