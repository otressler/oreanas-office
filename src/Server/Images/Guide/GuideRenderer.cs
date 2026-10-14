using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Images.Guide;

// The colour-coded guide the model repaints (knowledge/features/ai-map-generation.md, step
// 1): a port of .claude/skills/image-assets/scripts/render_guide.py with the same colours,
// legend lines, cell size choice and rule for enclosed void. Lane: guide and prompt.
public static class GuideRenderer
{
    // The model's limits (.claude/skills/image-assets/references/foundry-api.md).
    public const int MaxEdge = 3840;
    public const int MinPixels = 655_360;
    public const int MaxPixels = 8_294_400;
    public const int MaxRatio = 3;

    private record TerrainStyle(Terrain Terrain, (byte R, byte G, byte B) Colour, string Name, string Text);

    // render_guide.py's TERRAIN, in its order: the legend lists the used terrains in this order.
    private static readonly TerrainStyle[] TerrainStyles =
    [
        new(Terrain.Floor, (150, 150, 150), "grey", "walkable ground (floor, path, earth, flagstones as fits the scene)"),
        new(Terrain.Difficult, (170, 150, 60), "ochre", "difficult terrain (rubble, undergrowth, mud, shallow scree)"),
        new(Terrain.Water, (40, 90, 200), "blue", "water"),
        new(Terrain.Wall, (0, 0, 0), "black", "solid walls or impassable rock"),
        new(Terrain.Void, (90, 40, 110), "dark purple", "outside the play area, where nobody can stand: scenery that fits (cliff drop, solid bedrock, darkness, dense forest), never open water or walkable floor"),
    ];

    // Well-known feature kinds get a fixed colour; the others take the spares in order of
    // first appearance and then yellow.
    private static readonly Dictionary<string, ((byte R, byte G, byte B) Colour, string Name)> FeatureColours = new()
    {
        ["bridge"] = ((140, 90, 40), "brown"),
        ["door"] = ((230, 120, 20), "orange"),
        ["stairs"] = ((240, 220, 40), "yellow"),
        ["pillar"] = ((255, 255, 255), "white"),
        ["tree"] = ((30, 110, 40), "dark green"),
        ["table"] = ((200, 80, 160), "pink"),
    };

    private static readonly ((byte R, byte G, byte B) Colour, string Name)[] Spare =
    [
        ((220, 40, 40), "red"),
        ((40, 200, 200), "cyan"),
        ((130, 220, 90), "light green"),
        ((120, 70, 200), "violet"),
        ((250, 170, 170), "salmon"),
        ((90, 60, 30), "dark brown"),
    ];

    private static readonly ((byte R, byte G, byte B) Colour, string Name) YellowFallback = ((255, 255, 0), "yellow");
    private static readonly ((byte R, byte G, byte B) Colour, string Name) Entrance = ((255, 0, 255), "magenta");

    // Where the picture lies and how large it is, before anything is drawn: the map padded
    // to 3:1 when wider or taller, centred (an odd extra cell goes after the map), and
    // render_guide.py's cell size for that frame.
    public static GuideFrame Measure(int width, int height, int targetPixels = 1536)
    {
        var (frameX, frameY, frameWidth, frameHeight) = (0, 0, width, height);
        if (width > MaxRatio * height)
        {
            frameHeight = (width + MaxRatio - 1) / MaxRatio;
            frameY = -((frameHeight - height) / 2);
        }
        else if (height > MaxRatio * width)
        {
            frameWidth = (height + MaxRatio - 1) / MaxRatio;
            frameX = -((frameWidth - width) / 2);
        }

        var cell = PickCell(frameWidth, frameHeight, targetPixels);
        return new GuideFrame(frameX, frameY, frameWidth, frameHeight, cell, frameWidth * cell, frameHeight * cell);
    }

    // render_guide.py's pick_cell: aim the long edge at the target in 16 px steps, then grow
    // to the model's minimum and shrink below its maximum.
    private static int PickCell(int cols, int rows, int target)
    {
        var cell = Math.Max(16, target / Math.Max(cols, rows) / 16 * 16);
        while ((long)cols * rows * cell * cell < MinPixels)
        {
            cell += 16;
        }

        while (cell > 16 && (Math.Max(cols, rows) * cell > MaxEdge || (long)cols * rows * cell * cell > MaxPixels))
        {
            cell -= 16;
        }

        return cell;
    }

    // Renders the layout at the measured frame, so the model can be asked for exactly this
    // size. Padding cells are void and stay void, because they touch the frame edge. Cell
    // positions in the legend count from the map's own top-left cell, as in the layout.
    public static MapGuide Render(int width, int height, MapLayout layout, int targetPixels = 1536)
    {
        var frame = Measure(width, height, targetPixels);
        var cols = frame.Width;
        var rows = frame.Height;

        // Cells missing from the layout are void (knowledge/domain/battle-map.md).
        var grid = new Terrain[rows, cols];
        foreach (var cell in layout.Cells)
        {
            var (gx, gy) = (cell.X - frame.X, cell.Y - frame.Y);
            if (gx >= 0 && gx < cols && gy >= 0 && gy < rows)
            {
                grid[gy, gx] = cell.Terrain;
            }
        }

        // Void that can't reach the frame edge through other void cells is enclosed by the
        // map, like the solid rock between a dungeon's corridors. In the outside colour the
        // model paints it as an extra room or pool, so it is drawn as wall
        // (knowledge/decisions/image-generation-approach.md, "T0 run").
        var outside = new bool[rows, cols];
        var todo = new Stack<(int X, int Y)>();
        for (var y = 0; y < rows; y++)
        {
            for (var x = 0; x < cols; x++)
            {
                if (grid[y, x] == Terrain.Void && (x == 0 || x == cols - 1 || y == 0 || y == rows - 1))
                {
                    todo.Push((x, y));
                }
            }
        }

        while (todo.Count > 0)
        {
            var (x, y) = todo.Pop();
            if (outside[y, x])
            {
                continue;
            }

            outside[y, x] = true;
            foreach (var (nx, ny) in new[] { (x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1) })
            {
                if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && grid[ny, nx] == Terrain.Void && !outside[ny, nx])
                {
                    todo.Push((nx, ny));
                }
            }
        }

        var colour = new (byte R, byte G, byte B)[rows, cols];
        var used = new HashSet<Terrain>();
        for (var y = 0; y < rows; y++)
        {
            for (var x = 0; x < cols; x++)
            {
                if (grid[y, x] == Terrain.Void && !outside[y, x])
                {
                    grid[y, x] = Terrain.Wall;
                }

                used.Add(grid[y, x]);
                colour[y, x] = TerrainStyles.First(t => t.Terrain == grid[y, x]).Colour;
            }
        }

        var legend = TerrainStyles.Where(t => used.Contains(t.Terrain)).Select(t => $"{t.Name} = {t.Text}").ToList();

        var spare = 0;
        var kindColour = new Dictionary<string, ((byte R, byte G, byte B) Colour, string Name)>();
        foreach (var f in layout.Features)
        {
            var kind = f.Kind.ToLowerInvariant();
            if (!kindColour.TryGetValue(kind, out var style))
            {
                style = FeatureColours.TryGetValue(kind, out var fixedStyle)
                    ? fixedStyle
                    : spare < Spare.Length ? Spare[spare++] : YellowFallback;
                kindColour[kind] = style;
            }

            // Clipped to the frame, in frame cells.
            var (fx, fy) = (f.X - frame.X, f.Y - frame.Y);
            for (var y = Math.Max(0, fy); y < Math.Min(rows, fy + f.H); y++)
            {
                for (var x = Math.Max(0, fx); x < Math.Min(cols, fx + f.W); x++)
                {
                    colour[y, x] = style.Colour;
                }
            }

            var text = $"{style.Name} at column {Span(f.X, f.W)}, row {Span(f.Y, f.H)} = {f.Kind}";
            if (!string.IsNullOrEmpty(f.Label) && f.Label != f.Kind)
            {
                text += $" (\"{f.Label}\")";
            }

            legend.Add(text);
        }

        // Entrances go over the features.
        foreach (var e in layout.Entrances)
        {
            foreach (var c in e.Cells)
            {
                var (x, y) = (c[0] - frame.X, c[1] - frame.Y);
                if (x >= 0 && x < cols && y >= 0 && y < rows)
                {
                    colour[y, x] = Entrance.Colour;
                }
            }
        }

        if (layout.Entrances.Count > 0)
        {
            var labels = layout.Entrances.Select(e => e.Label ?? e.Kind.ToString().ToLowerInvariant());
            legend.Add($"{Entrance.Name} = openings at the map edge, painted as the path, doorway or stairs that leads away: "
                + string.Join(", ", labels));
        }

        var cellPx = frame.CellPx;
        var png = Png.Encode(frame.PixelWidth, frame.PixelHeight, (px, py) => colour[py / cellPx, px / cellPx]);
        return new MapGuide(
            png, frame.PixelWidth, frame.PixelHeight, cellPx,
            frame.X, frame.Y, frame.Width, frame.Height, legend, frame.Width != width || frame.Height != height);
    }

    // 1-based, a range for more than one cell: "4" or "9-12".
    private static string Span(int start, int size) => size == 1 ? $"{start + 1}" : $"{start + 1}-{start + size}";
}

// The picture's cells relative to the map's top-left cell (X, Y ≤ 0), pixels per cell and the
// picture's size in pixels.
public record GuideFrame(int X, int Y, int Width, int Height, int CellPx, int PixelWidth, int PixelHeight);

// Png: the guide image, Width × Height pixels. CellPx: pixels per cell. FrameX, FrameY,
// FrameWidth, FrameHeight: the picture's cells relative to the map's top-left cell
// (Asset.FrameX…); without padding 0, 0, width, height. Legend: one line per colour, as
// render_guide.py prints it. Padded: the frame is larger than the map.
public record MapGuide(
    byte[] Png,
    int Width,
    int Height,
    int CellPx,
    int FrameX,
    int FrameY,
    int FrameWidth,
    int FrameHeight,
    IReadOnlyList<string> Legend,
    bool Padded);
