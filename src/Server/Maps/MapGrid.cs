using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Maps;

// The grid rules shared by imports and starting a fight: sparse cells, walkability,
// footprints and elevation (knowledge/domain/battle-map.md, encounter.md "Placement
// rule"). The frontend twin is src/web/src/board/geometry.ts; both must agree.
public sealed class MapGrid
{
    private readonly Terrain[] _terrain;
    private readonly decimal[] _elevation;
    private readonly LayoutFeature?[] _features;

    public MapGrid(int width, int height, MapLayout layout)
    {
        Width = width;
        Height = height;
        _terrain = new Terrain[width * height];
        _elevation = new decimal[width * height];
        _features = new LayoutFeature?[width * height];

        foreach (var cell in layout.Cells.Where(c => Inside(c.X, c.Y)))
        {
            _terrain[Index(cell.X, cell.Y)] = cell.Terrain;
            _elevation[Index(cell.X, cell.Y)] = cell.Elevation;
        }

        // Later features in the list lie on top of earlier ones.
        foreach (var feature in layout.Features)
        {
            for (var y = feature.Y; y < feature.Y + feature.H; y++)
            {
                for (var x = feature.X; x < feature.X + feature.W; x++)
                {
                    if (Inside(x, y))
                    {
                        _features[Index(x, y)] = feature;
                    }
                }
            }
        }
    }

    public int Width { get; }

    public int Height { get; }

    public bool Inside(int x, int y) => x >= 0 && y >= 0 && x < Width && y < Height;

    // Cells missing from the layout and outside the map are void.
    public Terrain TerrainAt(int x, int y) => Inside(x, y) ? _terrain[Index(x, y)] : Terrain.Void;

    // The topmost feature covering the cell, if any.
    public LayoutFeature? FeatureAt(int x, int y) => Inside(x, y) ? _features[Index(x, y)] : null;

    // Not void or wall and not under a blocking feature. A non-blocking feature (a
    // bridge) makes the cells under it walkable.
    public bool Walkable(int x, int y)
    {
        if (!Inside(x, y))
        {
            return false;
        }

        if (_features[Index(x, y)] is { } feature)
        {
            return !feature.BlocksMovement;
        }

        return _terrain[Index(x, y)] is not (Terrain.Void or Terrain.Wall);
    }

    // Meters: a non-blocking feature's elevation where one covers the cell, else the cell's.
    public decimal ElevationAt(int x, int y)
    {
        if (!Inside(x, y))
        {
            return 0;
        }

        return _features[Index(x, y)] is { BlocksMovement: false } feature ? feature.Elevation : _elevation[Index(x, y)];
    }

    // A placed token's elevation: the highest elevation under its footprint.
    public decimal PlacementElevation(CreatureSize size, int x, int y) =>
        FootprintCells(size, x, y).Max(cell => ElevationAt(cell.X, cell.Y));

    // Every cell a token of this size covers with its top-left corner at (x, y).
    public static IEnumerable<(int X, int Y)> FootprintCells(CreatureSize size, int x, int y)
    {
        var n = size.Footprint();
        for (var dy = 0; dy < n; dy++)
        {
            for (var dx = 0; dx < n; dx++)
            {
                yield return (x + dx, y + dy);
            }
        }
    }

    private int Index(int x, int y) => y * Width + x;
}

// The cells tokens already cover on a grid, for placing several tokens one after
// another: the creatures of an import, then the characters when a fight starts.
public sealed class TokenPlacement(MapGrid grid)
{
    private readonly HashSet<(int X, int Y)> _taken = [];

    // The placement rule: the whole footprint is inside the map on walkable cells and
    // overlaps no token placed so far.
    public bool CanPlace(CreatureSize size, int x, int y) =>
        MapGrid.FootprintCells(size, x, y).All(cell => grid.Walkable(cell.X, cell.Y) && !_taken.Contains(cell));

    // Marks the footprint as taken, without checking: tokens already on the board
    // count even if the map would refuse them now.
    public void Add(CreatureSize size, int x, int y) => _taken.UnionWith(MapGrid.FootprintCells(size, x, y));

    // Places the token if the rule allows it, and returns its elevation.
    public bool TryPlace(CreatureSize size, int x, int y, out decimal elevation)
    {
        elevation = 0;
        if (!CanPlace(size, x, y))
        {
            return false;
        }

        Add(size, x, y);
        elevation = grid.PlacementElevation(size, x, y);
        return true;
    }
}
