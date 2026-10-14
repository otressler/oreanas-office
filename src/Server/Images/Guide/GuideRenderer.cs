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
    // size. Padding cells are void. Contract stub: a plain grey picture of the right size and
    // no legend, until the guide and prompt lane ports the drawing.
    public static MapGuide Render(int width, int height, MapLayout layout, int targetPixels = 1536)
    {
        var frame = Measure(width, height, targetPixels);
        var png = Png.Encode(frame.PixelWidth, frame.PixelHeight, (_, _) => (150, 150, 150));
        return new MapGuide(
            png, frame.PixelWidth, frame.PixelHeight, frame.CellPx,
            frame.X, frame.Y, frame.Width, frame.Height, [], frame.Width != width || frame.Height != height);
    }
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
