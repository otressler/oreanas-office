using System.Text.Json;
using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Tests;

// The server's layout checks against the cases the editor's Vitest test runs too
// (src/web/src/editor/validation.cases.json, linked into this project). Each case lists
// the problem codes the checks must report, in any order, each as often as listed.
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class MapChecksTests
{
    private static readonly JsonSerializerOptions CamelCase = new(JsonSerializerDefaults.Web);

    public static TheoryData<string> CaseNames()
    {
        var names = new TheoryData<string>();
        foreach (var name in Cases().Keys)
        {
            names.Add(name);
        }

        return names;
    }

    [Theory]
    [MemberData(nameof(CaseNames))]
    public void Reports_the_problems_of_the_shared_case(string name)
    {
        var (map, expected) = Cases()[name];

        if (!TryRead(map, out var input))
        {
            // A fractional coordinate or size can't be a C# int: the JSON reader refuses
            // the pushed map before the checks run, so the case has no server counterpart.
            Assert.Throws<JsonException>(() => JsonSerializer.Deserialize<LayoutCell>("""{"x":1.5,"y":0,"terrain":"floor","elevation":0}""", CamelCase));
            return;
        }

        var problems = MapChecks.Check(input.Name, input.Width, input.Height, input.Layout, input.Scene, input.Vibe, input.Lighting);

        Assert.Equal(
            expected.Select(Pascal).Order().ToList(),
            problems.Select(p => p.Code.ToString()).Order().ToList());
    }

    [Fact]
    public void Every_shared_case_runs_except_the_fractional_ones()
    {
        var unreadable = Cases().Where(c => !TryRead(c.Value.Map, out _)).Select(c => c.Key).Order().ToList();

        Assert.Equal(
            ["a cell with a fractional coordinate", "a feature with a fractional height", "a map with a fractional width"],
            unreadable);
    }

    [Fact]
    public void Names_the_later_feature_of_an_overlap_and_the_earlier_one_as_other()
    {
        var layout = Layout(
            features:
            [
                new LayoutFeature("f1", "Säule", "", 0, 0, 2, 1, 0, true),
                new LayoutFeature("f2", "Säule", "", 1, 0, 2, 1, 0, true),
            ]);

        var problems = MapChecks.Check("", 6, 4, layout, "", "", "");

        Assert.Equal(
            [
                new LayoutProblem(LayoutProblemCode.NameMissing, new LayoutProblemItem(LayoutItemKind.Map)),
                new LayoutProblem(LayoutProblemCode.FeatureOverlap, new LayoutProblemItem(LayoutItemKind.Feature, 1, Id: "f2"), OtherId: "f1"),
            ],
            problems);
    }

    [Fact]
    public void Names_the_entrance_cell_and_the_entrance_that_has_it_already()
    {
        var layout = Layout(
            cells: [new LayoutCell(0, 1, Terrain.Floor, 0), new LayoutCell(0, 2, Terrain.Floor, 0)],
            entrances:
            [
                new LayoutEntrance("e1", EntranceKind.Entrance, "", [[0, 1]]),
                new LayoutEntrance("e2", EntranceKind.Exit, "", [[0, 1], [0, 2]]),
            ]);

        var problems = MapChecks.Check("Karte", 6, 4, layout, "", "", "");

        Assert.Equal(
            [
                new LayoutProblem(
                    LayoutProblemCode.EntranceCellShared,
                    new LayoutProblemItem(LayoutItemKind.Entrance, 1, Id: "e2"),
                    Cell: new LayoutCellRef(0, 1),
                    OtherId: "e1"),
            ],
            problems);
    }

    [Fact]
    public void Names_the_text_that_is_too_long_and_points_at_cells_by_position()
    {
        var layout = Layout(cells: [new LayoutCell(7, 1, Terrain.Floor, 0)]);

        var problems = MapChecks.Check("Karte", 6, 4, layout, new string('x', 501), "", "");

        Assert.Equal(
            [
                new LayoutProblem(LayoutProblemCode.TextTooLong, new LayoutProblemItem(LayoutItemKind.Map), LayoutTextField.Scene),
                new LayoutProblem(LayoutProblemCode.CellOutside, new LayoutProblemItem(LayoutItemKind.Cell, 0, 7, 1)),
            ],
            problems);
    }

    [Fact]
    public void A_huge_feature_is_a_problem_not_a_hang()
    {
        var layout = Layout(features: [new LayoutFeature("f1", "Wand", "", 0, 0, int.MaxValue, int.MaxValue, 0, true)]);

        var problems = MapChecks.Check("Karte", 6, 4, layout, "", "", "");

        Assert.Equal([LayoutProblemCode.FeatureOutside], problems.Select(p => p.Code));
    }

    [Fact]
    public void Tolerates_a_layout_with_missing_lists_and_entries()
    {
        var problems = MapChecks.Check("Karte", 6, 4, new MapLayout(1, null!, [null!], [null!]), null, null, null);

        Assert.Equal(
            [LayoutProblemCode.FeatureSizeInvalid, LayoutProblemCode.EntranceEmpty],
            problems.Select(p => p.Code));
        Assert.Equal([LayoutProblemCode.LayoutVersionUnsupported], MapChecks.Check("Karte", 6, 4, null, "", "", "").Select(p => p.Code));
    }

    private static MapLayout Layout(
        List<LayoutCell>? cells = null, List<LayoutFeature>? features = null, List<LayoutEntrance>? entrances = null) =>
        new(MapLayout.CurrentSchemaVersion, cells ?? [], features ?? [], entrances ?? []);

    private static string Pascal(string code) => char.ToUpperInvariant(code[0]) + code[1..];

    private sealed record Input(string Name, int Width, int Height, MapLayout Layout, string Scene, string Vibe, string Lighting);

    private static Dictionary<string, (JsonElement Map, List<string> Expected)> Cases()
    {
        using var file = File.OpenRead(Path.Combine(AppContext.BaseDirectory, "validation.cases.json"));
        var root = JsonDocument.Parse(file).RootElement.Clone();
        return root.GetProperty("cases").EnumerateArray().ToDictionary(
            c => c.GetProperty("name").GetString()!,
            c => (c.GetProperty("map"), c.GetProperty("expected").EnumerateArray().Select(e => e.GetString()!).ToList()));
    }

    // The defaults the cases file names for fields a case leaves out.
    private static bool TryRead(JsonElement map, out Input input)
    {
        input = null!;
        try
        {
            var layout = map.TryGetProperty("layout", out var l) ? l : default;
            input = new Input(
                Text(map, "name", "Testkarte"),
                Int(map, "width"),
                Int(map, "height"),
                new MapLayout(
                    layout.ValueKind == JsonValueKind.Object && layout.TryGetProperty("schemaVersion", out var v) ? v.GetInt32() : 1,
                    Items(layout, "cells", cell => new LayoutCell(
                        Int(cell, "x"), Int(cell, "y"), Named<Terrain>(cell, "terrain"), cell.GetProperty("elevation").GetDecimal())),
                    Items(layout, "features", feature => new LayoutFeature(
                        Text(feature, "id", ""),
                        Text(feature, "kind", ""),
                        Text(feature, "label", ""),
                        Int(feature, "x"),
                        Int(feature, "y"),
                        Int(feature, "w"),
                        Int(feature, "h"),
                        feature.GetProperty("elevation").GetDecimal(),
                        feature.GetProperty("blocksMovement").GetBoolean())),
                    Items(layout, "entrances", entrance => new LayoutEntrance(
                        Text(entrance, "id", ""),
                        Named<EntranceKind>(entrance, "kind"),
                        Text(entrance, "label", ""),
                        [.. entrance.GetProperty("cells").EnumerateArray().Select(pair => pair.EnumerateArray().Select(n => n.GetInt32()).ToArray())]))),
                Text(map, "scene", ""),
                Text(map, "vibe", ""),
                Text(map, "lighting", ""));
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static string Text(JsonElement element, string name, string fallback) =>
        element.TryGetProperty(name, out var value) ? value.GetString()! : fallback;

    private static int Int(JsonElement element, string name) =>
        element.GetProperty(name).TryGetInt32(out var value) ? value : throw new FormatException(name);

    // An unknown name stays undefined, which the checks report as an invalid value.
    private static T Named<T>(JsonElement element, string name)
        where T : struct, System.Enum =>
        System.Enum.TryParse<T>(element.GetProperty(name).GetString(), ignoreCase: true, out var value) ? value : (T)(object)(-1);

    private static List<T> Items<T>(JsonElement layout, string name, Func<JsonElement, T> read) =>
        layout.ValueKind == JsonValueKind.Object && layout.TryGetProperty(name, out var items)
            ? [.. items.EnumerateArray().Select(read)]
            : [];
}
