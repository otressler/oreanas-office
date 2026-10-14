using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Images.Guide;

// The colour-coded guide the model repaints (knowledge/features/ai-map-generation.md, step
// 1): a port of .claude/skills/image-assets/scripts/render_guide.py with the same colours,
// legend lines, cell size choice and rule for enclosed void. Lane: guide and prompt.
public static class GuideRenderer
{
    // Renders the layout at a cell size in 16 px steps, so the model can be asked for
    // exactly this size. A map wider (or taller) than 3:1 is padded to 3:1 with void
    // around it, centred; the frame says where the picture lies relative to the map.
    public static MapGuide Render(int width, int height, MapLayout layout, int targetPixels = 1536) =>
        throw new NotImplementedException();
}

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
