namespace OreanasOffice.Server.Encounters;

// Checks and tidies a FogDocument pushed from the editor or changed at the table.
public static class FogCells
{
    public const int AreaNameMaxLength = 40;
    public const int MaxAreas = 100;

    // The field of the first problem (relative to "fog"), or null when the document is fine:
    // cells inside the map, areas with unique ids and names of 1 to AreaNameMaxLength.
    public static string? Check(FogDocument fog, int width, int height)
    {
        if (fog.HiddenCells is null || fog.Areas is null)
        {
            return "fog";
        }

        for (var i = 0; i < fog.HiddenCells.Count; i++)
        {
            if (!Inside(fog.HiddenCells[i], width, height))
            {
                return $"fog.hiddenCells[{i}]";
            }
        }

        if (fog.Areas.Count > MaxAreas)
        {
            return "fog.areas";
        }

        var ids = new HashSet<string>();
        for (var i = 0; i < fog.Areas.Count; i++)
        {
            var area = fog.Areas[i];
            if (area is null
                || string.IsNullOrWhiteSpace(area.Id)
                || !ids.Add(area.Id)
                || (area.Name ?? "").Trim().Length is 0 or > AreaNameMaxLength
                || area.Cells is null)
            {
                return $"fog.areas[{i}]";
            }

            for (var c = 0; c < area.Cells.Count; c++)
            {
                if (!Inside(area.Cells[c], width, height))
                {
                    return $"fog.areas[{i}].cells[{c}]";
                }
            }
        }

        return null;
    }

    // Each cell once, in row order, so equal fog saves as equal JSON.
    public static FogDocument Normalize(FogDocument fog) => new(
        Distinct(fog.HiddenCells),
        [.. fog.Areas.Select(a => new FogArea(a.Id, a.Name.Trim(), Distinct(a.Cells)))]);

    public static HashSet<(int X, int Y)> Set(FogDocument? fog) =>
        fog is null ? [] : [.. fog.HiddenCells.Select(c => (c[0], c[1]))];

    private static List<int[]> Distinct(List<int[]> cells) =>
        [.. cells.Select(c => (X: c[0], Y: c[1])).Distinct().OrderBy(c => c.Y).ThenBy(c => c.X).Select(c => new[] { c.X, c.Y })];

    private static bool Inside(int[]? cell, int width, int height) =>
        cell is { Length: 2 } && cell[0] >= 0 && cell[1] >= 0 && cell[0] < width && cell[1] < height;
}
