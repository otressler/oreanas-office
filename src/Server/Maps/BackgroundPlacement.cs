namespace OreanasOffice.Server.Maps;

// Where the DM moved, scaled and turned the picked background in the editor
// (knowledge/domain/battle-map.md, "Background image"). AssetId: the version it was made
// for; while another version is picked, that version's own frame is used. X, Y: the top-left
// corner of the unturned picture, Width and Height its size, all in cells relative to the
// map's top-left cell. Rotation: degrees clockwise around the picture's centre. Part of the
// map's sync item, so it undoes, saves offline and syncs like any other edit.
public record BackgroundPlacement(Guid AssetId, double X, double Y, double Width, double Height, double Rotation)
{
    // Far enough to drag a picture well off the largest map, small enough to stay sane.
    public const double MaxOffset = 400;

    public const double MaxSize = 400;

    public const double MinSize = 0.25;

    public bool IsValid() =>
        double.IsFinite(X) && double.IsFinite(Y) && double.IsFinite(Width) && double.IsFinite(Height) && double.IsFinite(Rotation)
        && Math.Abs(X) <= MaxOffset && Math.Abs(Y) <= MaxOffset
        && Width is >= MinSize and <= MaxSize && Height is >= MinSize and <= MaxSize
        && Rotation is >= -360 and <= 360;
}

// How the app's grid is drawn over a background picture (knowledge/domain/battle-map.md):
// Faint or Hidden for pictures that bring their own grid. Without a picture the board
// always draws the normal grid.
public enum MapGridStyle
{
    Normal,
    Faint,
    Hidden,
}
