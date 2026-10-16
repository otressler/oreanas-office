using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Tests;

// The grid rules and the placement rule (knowledge/domain/encounter.md) on a 4×3 grid;
// src/web/src/board/geometry.ts follows the same rules:
//
//   y\x 0 1 2 3
//   0   . . ~ #      .  floor (0 m)   ~  void, a bridge (2 m) covers (2,0)–(2,1)
//   1   . . ~ W      #  wall          W  water (1 m)
//   2   . P . W      P  a blocking pillar over floor
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class MapGridTests
{
    private static readonly MapGrid Grid = new(4, 3, new MapLayout(
        1,
        [
            new LayoutCell(0, 0, Terrain.Floor, 0),
            new LayoutCell(1, 0, Terrain.Floor, 0),
            new LayoutCell(3, 0, Terrain.Wall, 0),
            new LayoutCell(0, 1, Terrain.Floor, 0),
            new LayoutCell(1, 1, Terrain.Floor, 0),
            new LayoutCell(3, 1, Terrain.Water, 1),
            new LayoutCell(0, 2, Terrain.Floor, 0),
            new LayoutCell(1, 2, Terrain.Floor, 0),
            new LayoutCell(2, 2, Terrain.Floor, 0),
            new LayoutCell(3, 2, Terrain.Water, 1),
        ],
        [
            new LayoutFeature("f1", "bridge", "Brücke", 2, 0, 1, 2, 2, false),
            new LayoutFeature("f2", "pillar", "Säule", 1, 2, 1, 1, 0, true),
        ],
        []));

    [Theory]
    [InlineData(0, 0, true)]
    [InlineData(3, 1, true)]
    [InlineData(2, 0, true)] // void under a bridge
    [InlineData(2, 2, true)]
    [InlineData(3, 0, false)] // wall
    [InlineData(1, 2, false)] // blocking pillar on floor
    [InlineData(-1, 0, false)]
    [InlineData(4, 0, false)]
    [InlineData(0, 3, false)]
    public void Walkable_cells(int x, int y, bool walkable) => Assert.Equal(walkable, Grid.Walkable(x, y));

    [Fact]
    public void Cells_missing_from_the_layout_are_void()
    {
        Assert.Equal(Terrain.Void, Grid.TerrainAt(2, 1));
        Assert.Equal(Terrain.Void, Grid.TerrainAt(9, 9));
        Assert.Equal("f1", Grid.FeatureAt(2, 1)?.Id);
    }

    [Fact]
    public void A_non_blocking_feature_sets_the_elevation_of_its_cells()
    {
        Assert.Equal(2m, Grid.ElevationAt(2, 1));
        Assert.Equal(1m, Grid.ElevationAt(3, 1));
        Assert.Equal(0m, Grid.ElevationAt(0, 0));
    }

    [Fact]
    public void A_later_feature_lies_on_top_of_an_earlier_one()
    {
        var grid = new MapGrid(2, 1, new MapLayout(
            1,
            [new LayoutCell(0, 0, Terrain.Floor, 0), new LayoutCell(1, 0, Terrain.Floor, 0)],
            [
                new LayoutFeature("f1", "rubble", "Geröll", 0, 0, 2, 1, 0, true),
                new LayoutFeature("f2", "stairs", "Treppe", 1, 0, 1, 1, 3, false),
            ],
            []));

        Assert.False(grid.Walkable(0, 0));
        Assert.True(grid.Walkable(1, 0));
        Assert.Equal(3m, grid.ElevationAt(1, 0));
    }

    [Fact]
    public void A_large_footprint_covers_two_by_two_cells()
    {
        Assert.Equal([(1, 1), (2, 1), (1, 2), (2, 2)], MapGrid.FootprintCells(CreatureSize.Large, 1, 1));
        Assert.Equal([(5, 6)], MapGrid.FootprintCells(CreatureSize.Tiny, 5, 6));
        Assert.Equal(16, MapGrid.FootprintCells(CreatureSize.Gargantuan, 0, 0).Count());
    }

    [Fact]
    public void The_whole_footprint_must_be_walkable()
    {
        var placement = new TokenPlacement(Grid);

        Assert.True(placement.CanPlace(CreatureSize.Large, 0, 0));
        Assert.True(placement.CanPlace(CreatureSize.Large, 1, 0)); // half on the bridge
        Assert.False(placement.CanPlace(CreatureSize.Large, 0, 1)); // the pillar
        Assert.False(placement.CanPlace(CreatureSize.Large, 2, 0)); // the wall
        Assert.False(placement.CanPlace(CreatureSize.Large, 3, 1)); // off the map
        Assert.False(placement.CanPlace(CreatureSize.Huge, 0, 0));
    }

    [Fact]
    public void Tokens_do_not_overlap()
    {
        var placement = new TokenPlacement(Grid);

        Assert.True(placement.TryPlace(CreatureSize.Large, 0, 0, out _));
        Assert.False(placement.TryPlace(CreatureSize.Medium, 1, 1, out _));
        Assert.True(placement.TryPlace(CreatureSize.Medium, 2, 1, out _));
        Assert.False(placement.TryPlace(CreatureSize.Medium, 2, 1, out _));
        Assert.True(placement.TryPlace(CreatureSize.Medium, 0, 2, out _));
    }

    [Fact]
    public void A_token_stands_at_the_highest_elevation_under_it()
    {
        var placement = new TokenPlacement(Grid);

        Assert.True(placement.TryPlace(CreatureSize.Large, 1, 0, out var onBridge));
        Assert.True(placement.TryPlace(CreatureSize.Medium, 3, 2, out var inWater));
        Assert.True(placement.TryPlace(CreatureSize.Medium, 0, 2, out var onFloor));

        Assert.Equal((2m, 1m, 0m), (onBridge, inWater, onFloor));
    }
}
