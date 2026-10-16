using OreanasOffice.Server.Images.Guide;
using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Tests.Images;

// The guide renderer is a port of render_guide.py; the golden files are that script's
// output for the sample maps. Pure code: no database, no Docker.
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class GuideRendererTests
{
    private static readonly (byte, byte, byte) Void = (90, 40, 110);
    private static readonly (byte, byte, byte) Wall = (0, 0, 0);
    private static readonly (byte, byte, byte) Floor = (150, 150, 150);

    public static TheoryData<string> Samples() => GuideSamples.Theory();

    [Theory]
    [MemberData(nameof(Samples))]
    public void Sample_maps_render_like_render_guide_py(string name)
    {
        var sample = GuideSamples.Load(name);
        var golden = GuideSamples.LoadGolden(name);

        var guide = GuideRenderer.Render(sample.Width, sample.Height, sample.Layout);

        Assert.Equal(golden.Size, $"{guide.Width}x{guide.Height}");
        Assert.Equal(golden.CellPx, guide.CellPx);
        Assert.Equal(golden.Legend, guide.Legend);
        var image = TestPng.Decode(guide.Png);
        Assert.Equal(golden.Image.Width, image.Width);
        Assert.Equal(golden.Image.Height, image.Height);
        Assert.True(golden.Image.Rgb.AsSpan().SequenceEqual(image.Rgb), "pixels differ from the golden picture");
    }

    [Fact]
    public void A_wide_map_is_padded_top_and_bottom_with_void()
    {
        var guide = GuideRenderer.Render(40, 10, GuideSamples.Floor(40, 10));

        // 40 / 3 rounded up = 14 rows, 4 of them padding: 2 above, 2 below.
        Assert.True(guide.Padded);
        Assert.Equal((0, -2, 40, 14), (guide.FrameX, guide.FrameY, guide.FrameWidth, guide.FrameHeight));
        AssertWithinModelLimits(guide);
        var image = TestPng.Decode(guide.Png);
        Assert.Equal(Void, TestPng.PixelAt(image, 0, 0));
        Assert.Equal(Void, TestPng.PixelAt(image, guide.Width - 1, 2 * guide.CellPx - 1));
        Assert.Equal(Floor, TestPng.PixelAt(image, 0, 2 * guide.CellPx));
        Assert.Equal(Floor, TestPng.PixelAt(image, guide.Width - 1, 12 * guide.CellPx - 1));
        Assert.Equal(Void, TestPng.PixelAt(image, 0, 12 * guide.CellPx));
        Assert.Equal(Void, TestPng.PixelAt(image, guide.Width - 1, guide.Height - 1));
    }

    [Fact]
    public void A_tall_map_is_padded_left_and_right_with_void()
    {
        var guide = GuideRenderer.Render(10, 40, GuideSamples.Floor(10, 40));

        Assert.True(guide.Padded);
        Assert.Equal((-2, 0, 14, 40), (guide.FrameX, guide.FrameY, guide.FrameWidth, guide.FrameHeight));
        AssertWithinModelLimits(guide);
        var image = TestPng.Decode(guide.Png);
        Assert.Equal(Void, TestPng.PixelAt(image, 0, 0));
        Assert.Equal(Void, TestPng.PixelAt(image, 2 * guide.CellPx - 1, guide.Height - 1));
        Assert.Equal(Floor, TestPng.PixelAt(image, 2 * guide.CellPx, 0));
        Assert.Equal(Floor, TestPng.PixelAt(image, 12 * guide.CellPx - 1, guide.Height - 1));
        Assert.Equal(Void, TestPng.PixelAt(image, 12 * guide.CellPx, 0));
        Assert.Contains(guide.Legend, l => l.StartsWith("dark purple = ", StringComparison.Ordinal));
    }

    [Fact]
    public void An_odd_extra_cell_goes_after_the_map()
    {
        var guide = GuideRenderer.Render(31, 10, GuideSamples.Floor(31, 10));

        // 31 / 3 rounds up to 11 rows: one padding row, and it goes below the map.
        Assert.Equal((0, 0, 31, 11), (guide.FrameX, guide.FrameY, guide.FrameWidth, guide.FrameHeight));
        Assert.True(guide.Padded);
        var image = TestPng.Decode(guide.Png);
        Assert.Equal(Floor, TestPng.PixelAt(image, 0, 0));
        Assert.Equal(Void, TestPng.PixelAt(image, 0, guide.Height - 1));
    }

    [Fact]
    public void A_map_within_the_ratio_is_not_padded()
    {
        var guide = GuideRenderer.Render(30, 10, GuideSamples.Floor(30, 10));

        Assert.False(guide.Padded);
        Assert.Equal((0, 0, 30, 10), (guide.FrameX, guide.FrameY, guide.FrameWidth, guide.FrameHeight));
    }

    [Fact]
    public void A_one_by_one_map_grows_to_the_models_minimum_size()
    {
        var guide = GuideRenderer.Render(1, 1, GuideSamples.Floor(1, 1));

        Assert.False(guide.Padded);
        Assert.True(guide.CellPx % 16 == 0);
        Assert.Equal(guide.CellPx, guide.Width);
        AssertWithinModelLimits(guide);
        var image = TestPng.Decode(guide.Png);
        Assert.Equal(Floor, TestPng.PixelAt(image, 0, 0));
        Assert.Equal(Floor, TestPng.PixelAt(image, guide.Width - 1, guide.Height - 1));
        Assert.Equal(["grey = walkable ground (floor, path, earth, flagstones as fits the scene)"], guide.Legend);
    }

    [Fact]
    public void Void_enclosed_by_the_map_becomes_wall_but_void_at_the_edge_stays()
    {
        // 5×5 of floor with a void at (2,2) (enclosed), a void at (0,0) (edge) and
        // a void at (2,0) joined to nothing else but the edge.
        var cells = Enumerable.Range(0, 25)
            .Select(i => (X: i % 5, Y: i / 5))
            .Where(c => c is not ((2, 2) or (0, 0) or (2, 0)))
            .Select(c => new LayoutCell(c.X, c.Y, Terrain.Floor, 0m))
            .ToList();
        var layout = new MapLayout(1, cells, [], []);

        var guide = GuideRenderer.Render(5, 5, layout);

        var image = TestPng.Decode(guide.Png);
        var cell = guide.CellPx;
        Assert.Equal(Wall, TestPng.PixelAt(image, 2 * cell, 2 * cell));
        Assert.Equal(Void, TestPng.PixelAt(image, 0, 0));
        Assert.Equal(Void, TestPng.PixelAt(image, 2 * cell, 0));
        Assert.Contains("black = solid walls or impassable rock", guide.Legend);
    }

    [Fact]
    public void Void_reaching_the_edge_through_other_void_stays_void()
    {
        // A void channel from the top edge down to (2,2).
        var cells = Enumerable.Range(0, 25)
            .Select(i => (X: i % 5, Y: i / 5))
            .Where(c => !(c.X == 2 && c.Y <= 2))
            .Select(c => new LayoutCell(c.X, c.Y, Terrain.Floor, 0m))
            .ToList();

        var guide = GuideRenderer.Render(5, 5, new MapLayout(1, cells, [], []));

        var image = TestPng.Decode(guide.Png);
        Assert.Equal(Void, TestPng.PixelAt(image, 2 * guide.CellPx, 2 * guide.CellPx));
        Assert.DoesNotContain(guide.Legend, l => l.StartsWith("black", StringComparison.Ordinal));
    }

    [Fact]
    public void Padding_makes_void_inside_a_wide_map_count_as_outside()
    {
        // The map's own first row touches the padding above it, which is void, so a void
        // cell there is connected to the outside and stays void.
        var cells = Enumerable.Range(0, 40 * 10)
            .Select(i => (X: i % 40, Y: i / 40))
            .Where(c => c != (5, 0))
            .Select(c => new LayoutCell(c.X, c.Y, Terrain.Floor, 0m))
            .ToList();

        var guide = GuideRenderer.Render(40, 10, new MapLayout(1, cells, [], []));

        var image = TestPng.Decode(guide.Png);
        Assert.Equal(Void, TestPng.PixelAt(image, 5 * guide.CellPx, 2 * guide.CellPx));
    }

    [Fact]
    public void Legend_positions_count_in_the_padded_picture()
    {
        // 40 × 10 is padded to 40 × 14 with two rows above the map: the model sees the map's
        // first row as row 3 of the picture.
        var layout = new MapLayout(1, [], [new LayoutFeature("f1", "bridge", "bridge", 4, 0, 3, 1, 0m, false)], []);

        var guide = GuideRenderer.Render(40, 10, layout);

        Assert.Contains("brown at column 5-7, row 3 = bridge", guide.Legend);
    }

    [Fact]
    public void Feature_colours_run_through_the_spares_then_fall_back_to_yellow()
    {
        string[] kinds = ["a", "b", "c", "d", "e", "f", "g", "h"];
        var features = kinds
            .Select((k, i) => new LayoutFeature($"f{i}", k, k, i, 0, 1, 1, 0m, false))
            .ToList();
        var layout = GuideSamples.Floor(8, 3) with { Features = features };

        var guide = GuideRenderer.Render(8, 3, layout);

        string[] names = ["red", "cyan", "light green", "violet", "salmon", "dark brown", "yellow", "yellow"];
        for (var i = 0; i < 8; i++)
        {
            Assert.Equal($"{names[i]} at column {i + 1}, row 1 = {kinds[i]}", guide.Legend[i + 1]);
        }

        var image = TestPng.Decode(guide.Png);
        var pixels = Enumerable.Range(0, 8).Select(i => TestPng.PixelAt(image, i * guide.CellPx, 0)).ToArray();
        Assert.Equal<(byte, byte, byte)[]>(
            [(220, 40, 40), (40, 200, 200), (130, 220, 90), (120, 70, 200), (250, 170, 170), (90, 60, 30), (255, 255, 0), (255, 255, 0)],
            pixels);
    }

    [Fact]
    public void Kinds_match_case_insensitively_and_share_a_colour()
    {
        var layout = GuideSamples.Floor(4, 2) with
        {
            Features =
            [
                new LayoutFeature("f1", "Tree", "Tree", 0, 0, 1, 1, 0m, true),
                new LayoutFeature("f2", "tree", "Eiche", 2, 0, 1, 2, 0m, true),
            ],
        };

        var guide = GuideRenderer.Render(4, 2, layout);

        Assert.Equal("dark green at column 1, row 1 = Tree", guide.Legend[1]);
        Assert.Equal("dark green at column 3, row 1-2 = tree (\"Eiche\")", guide.Legend[2]);
    }

    [Fact]
    public void A_label_equal_to_the_kind_is_left_out_and_an_empty_one_too()
    {
        var layout = GuideSamples.Floor(4, 2) with
        {
            Features =
            [
                new LayoutFeature("f1", "table", "table", 0, 0, 2, 1, 0m, true),
                new LayoutFeature("f2", "door", "", 3, 0, 1, 1, 0m, false),
            ],
        };

        var guide = GuideRenderer.Render(4, 2, layout);

        Assert.Equal("pink at column 1-2, row 1 = table", guide.Legend[1]);
        Assert.Equal("orange at column 4, row 1 = door", guide.Legend[2]);
    }

    [Fact]
    public void Entrances_are_drawn_over_features_and_features_are_clipped_to_the_grid()
    {
        var layout = GuideSamples.Floor(3, 2) with
        {
            Features = [new LayoutFeature("f1", "bridge", "bridge", 1, 0, 5, 5, 0m, false)],
            Entrances = [new LayoutEntrance("e1", EntranceKind.Both, "Tor", [[2, 0]])],
        };

        var guide = GuideRenderer.Render(3, 2, layout);

        var image = TestPng.Decode(guide.Png);
        var cell = guide.CellPx;
        Assert.Equal((140, 90, 40), TestPng.PixelAt(image, cell, 0));
        Assert.Equal((255, 0, 255), TestPng.PixelAt(image, 2 * cell, 0));
        Assert.Equal((140, 90, 40), TestPng.PixelAt(image, 2 * cell, cell));
        Assert.Equal("brown at column 2-6, row 1-5 = bridge", guide.Legend[1]);
        Assert.EndsWith(": Tor", guide.Legend[^1]);
    }

    [Fact]
    public void Terrain_lines_follow_the_fixed_order_for_the_terrains_used()
    {
        var layout = new MapLayout(
            1,
            [
                new LayoutCell(0, 0, Terrain.Wall, 0m),
                new LayoutCell(1, 0, Terrain.Water, 0m),
                new LayoutCell(1, 1, Terrain.Difficult, 0m),
                new LayoutCell(0, 1, Terrain.Floor, 0m),
            ],
            [],
            []);

        var guide = GuideRenderer.Render(2, 2, layout);

        Assert.Equal(4, guide.Legend.Count);
        Assert.StartsWith("grey = ", guide.Legend[0], StringComparison.Ordinal);
        Assert.StartsWith("ochre = ", guide.Legend[1], StringComparison.Ordinal);
        Assert.Equal("blue = water", guide.Legend[2]);
        Assert.StartsWith("black = ", guide.Legend[3], StringComparison.Ordinal);
    }

    private static void AssertWithinModelLimits(MapGuide guide)
    {
        Assert.True(guide.Width <= GuideRenderer.MaxEdge && guide.Height <= GuideRenderer.MaxEdge);
        Assert.InRange(guide.Width * guide.Height, GuideRenderer.MinPixels, GuideRenderer.MaxPixels);
        Assert.Equal(0, guide.CellPx % 16);
        Assert.Equal(guide.FrameWidth * guide.CellPx, guide.Width);
        Assert.Equal(guide.FrameHeight * guide.CellPx, guide.Height);
    }
}
