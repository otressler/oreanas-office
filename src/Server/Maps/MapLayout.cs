namespace OreanasOffice.Server.Maps;

// knowledge/domain/battle-map.md, "Layout document": the grid of a battle map as one
// JSON document. This is the stored and served form: every field set, cells sparse
// (a cell missing from Cells is Void), each cell at most once. Import files are more
// lenient (MapFile.cs) and are normalised into this.
public record MapLayout(
    int SchemaVersion,
    List<LayoutCell> Cells,
    List<LayoutFeature> Features,
    List<LayoutEntrance> Entrances)
{
    // Older layouts are upgraded when loaded (knowledge/decisions/backward-compatibility.md).
    public const int CurrentSchemaVersion = 1;
}

// Elevation in meters relative to the map's base level, one decimal.
public record LayoutCell(int X, int Y, Terrain Terrain, decimal Elevation);

// An important object with a rectangular footprint in cells. Kind is free text
// ("bridge", "pillar") that also feeds the image prompt. A feature that doesn't
// block movement makes the cells under it walkable, whatever their terrain.
public record LayoutFeature(
    string Id,
    string Kind,
    string Label,
    int X,
    int Y,
    int W,
    int H,
    decimal Elevation,
    bool BlocksMovement);

// Cells are [x, y] pairs on the map's edge.
public record LayoutEntrance(string Id, EntranceKind Kind, string Label, List<int[]> Cells);

// The walkable area is everything that isn't Void or Wall.
public enum Terrain
{
    Void,
    Floor,
    Difficult,
    Water,
    Wall,
}

public enum EntranceKind
{
    Entrance,
    Exit,
    Both,
}
