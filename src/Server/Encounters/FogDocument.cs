namespace OreanasOffice.Server.Encounters;

// knowledge/features/fog-of-war.md, "Data": the encounter's fog. Cells are [x, y] pairs;
// hiddenCells is the truth and areas are only shortcuts for picking. Cells outside the map
// or void aren't listed.
public record FogDocument(List<int[]> HiddenCells, List<FogArea> Areas);

public record FogArea(string Id, string Name, List<int[]> Cells);
