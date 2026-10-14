using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Tests;

// A small import file for the encounter tests, 8×5 cells:
//
//   y\x 0 1 2 3 4 5 6 7
//   0   . . . ~ ~ + + #      .  floor, elevation 0
//   1   . . . = = + + +      +  floor, elevation 1
//   2   . . . = = + + +      ~  void (the gorge); (3,0) is listed as void, the rest missing
//   3   . . . ~ ~ + P +      =  rope bridge over the gorge, elevation 0.5, not blocking
//   4   . . . ~ ~ + + +      #  wall;  P  a blocking pillar
//
// Cells are listed column by column, so the import has to sort them. Entrance on the
// west edge. Creatures: two goblins on the east side and an ogre (Large) in the west.
public static class TestMaps
{
    public static ImportMapRequest Gorge() => new(
        "Klamm",
        8,
        5,
        "Seilbrücke über einer Schlucht",
        "angespannt",
        "Dämmerung",
        new MapLayoutFile(
            null,
            GorgeCells(),
            [
                new LayoutFeatureFile(null, "bridge", "Seilbrücke", 3, 1, 2, 2, 0.5m, false),
                new LayoutFeatureFile(null, "pillar", null, 6, 3, 1, 1, null, true),
            ],
            [new LayoutEntranceFile(null, EntranceKind.Entrance, "Waldweg", [[0, 1], [0, 2]])]),
        [
            new ImportCreature("Goblin", CreatureSize.Small, 5, 1, null),
            new ImportCreature("Goblin", null, 6, 1, null),
            new ImportCreature("Oger", CreatureSize.Large, 1, 3, null),
        ]);

    private static List<LayoutCellFile> GorgeCells()
    {
        var cells = new List<LayoutCellFile> { new(3, 0, Terrain.Void, null) };
        for (var x = 0; x < 8; x++)
        {
            if (x is 3 or 4)
            {
                continue;
            }

            for (var y = 0; y < 5; y++)
            {
                var terrain = (x, y) == (7, 0) ? Terrain.Wall : Terrain.Floor;
                cells.Add(new LayoutCellFile(x, y, terrain, x >= 5 ? 1m : null));
            }
        }

        return cells;
    }
}
