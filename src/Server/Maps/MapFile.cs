using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Maps;

// The import file (knowledge/domain/battle-map.md, "Import file"): what a DM writes
// by hand or picks from the sample maps until the editor exists. Nullable fields may
// be left out of the file; the import fills them in:
//   SchemaVersion → 1, Elevation → 0, Features and Entrances → empty,
//   feature Id → "f1", "f2"…, entrance Id → "e1"…, Label → Kind, BlocksMovement → false.
// Width and Height are 1–40 (MapSizeInvalid). Cells outside the grid or listed twice
// fail with CellInvalid, and so on; the error's Field is the JSON path of the
// offending entry, e.g. "layout.cells[12]" or "creatures[0]".
public record ImportMapRequest(
    string Name,
    int Width,
    int Height,
    string? Scene,
    string? Vibe,
    string? Lighting,
    MapLayoutFile Layout,
    List<ImportCreature>? Creatures);

public record MapLayoutFile(
    int? SchemaVersion,
    List<LayoutCellFile> Cells,
    List<LayoutFeatureFile>? Features,
    List<LayoutEntranceFile>? Entrances);

public record LayoutCellFile(int X, int Y, Terrain Terrain, decimal? Elevation);

public record LayoutFeatureFile(
    string? Id,
    string Kind,
    string? Label,
    int X,
    int Y,
    int W,
    int H,
    decimal? Elevation,
    bool? BlocksMovement);

public record LayoutEntranceFile(string? Id, EntranceKind Kind, string? Label, List<int[]> Cells);

// Type is matched by name against the campaign's creature types, ignoring case. A new
// type takes Size and SpeedMeters from the first entry that names it; both are then
// required (CreatureTypeInvalid). Meters are rounded down to whole squares. Label
// replaces the automatic "Goblin 1". The token must stand on free walkable cells
// (PlacementInvalid).
public record ImportCreature(
    string Type,
    CreatureSize? Size,
    decimal? SpeedMeters,
    int X,
    int Y,
    string? Label);
