using OreanasOffice.Server.Api;
using OreanasOffice.Server.Bestiary;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Tests;

// The import file's rules (MapFile.cs, knowledge/domain/battle-map.md "Import file"),
// checked without a database. EncounterImportTests covers the endpoint.
public sealed class MapImportTests
{
    private static readonly Guid CampaignId = Guid.NewGuid();

    private static readonly Guid SessionId = Guid.NewGuid();
    private static readonly DateTimeOffset Now = new(2026, 10, 17, 19, 0, 0, TimeSpan.Zero);

    public static TheoryData<string, ImportMapRequest, ApiErrorCode, string> Broken()
    {
        var map = TestMaps.Gorge();
        var layout = map.Layout;
        var bridge = layout.Features![0];
        var entrance = layout.Entrances![0];
        var goblin = map.Creatures![0];
        var long41 = new string('a', 41);
        return new()
        {
            { "no name", map with { Name = "  " }, ApiErrorCode.NameInvalid, "name" },
            { "name null", map with { Name = null! }, ApiErrorCode.NameInvalid, "name" },
            { "long name", map with { Name = new string('a', 81) }, ApiErrorCode.NameInvalid, "name" },
            { "width 0", map with { Width = 0 }, ApiErrorCode.MapSizeInvalid, "width" },
            { "width 41", map with { Width = 41 }, ApiErrorCode.MapSizeInvalid, "width" },
            { "height 0", map with { Height = 0 }, ApiErrorCode.MapSizeInvalid, "height" },
            { "height 41", map with { Height = 41 }, ApiErrorCode.MapSizeInvalid, "height" },
            { "long scene", map with { Scene = new string('a', 501) }, ApiErrorCode.TextTooLong, "scene" },
            { "long vibe", map with { Vibe = new string('a', 501) }, ApiErrorCode.TextTooLong, "vibe" },
            { "long lighting", map with { Lighting = new string('a', 501) }, ApiErrorCode.TextTooLong, "lighting" },
            { "version 2", map with { Layout = layout with { SchemaVersion = 2 } }, ApiErrorCode.LayoutVersionUnsupported, "layout.schemaVersion" },
            { "version 0", map with { Layout = layout with { SchemaVersion = 0 } }, ApiErrorCode.LayoutVersionUnsupported, "layout.schemaVersion" },
            { "no layout", map with { Layout = null! }, ApiErrorCode.CellInvalid, "layout.cells" },
            { "no cells", map with { Layout = layout with { Cells = null! } }, ApiErrorCode.CellInvalid, "layout.cells" },
            { "cell outside", WithCell(map, new LayoutCellFile(8, 0, Terrain.Floor, null)), ApiErrorCode.CellInvalid, "layout.cells[1]" },
            { "cell negative", WithCell(map, new LayoutCellFile(0, -1, Terrain.Floor, null)), ApiErrorCode.CellInvalid, "layout.cells[1]" },
            { "cell twice", WithCell(map, new LayoutCellFile(0, 0, Terrain.Water, null)), ApiErrorCode.CellInvalid, "layout.cells[2]" },
            { "void cell twice", WithCell(map, new LayoutCellFile(3, 0, Terrain.Void, null)), ApiErrorCode.CellInvalid, "layout.cells[1]" },
            { "cell too high", WithCell(map, new LayoutCellFile(3, 1, Terrain.Floor, 10000m)), ApiErrorCode.CellInvalid, "layout.cells[1]" },
            { "cell too deep", WithCell(map, new LayoutCellFile(3, 1, Terrain.Floor, -9999.96m)), ApiErrorCode.CellInvalid, "layout.cells[1]" },
            { "no kind", WithFeature(map, bridge with { Kind = " " }), ApiErrorCode.FeatureInvalid, "layout.features[1]" },
            { "kind null", WithFeature(map, bridge with { Kind = null! }), ApiErrorCode.FeatureInvalid, "layout.features[1]" },
            { "long kind", WithFeature(map, bridge with { Kind = long41 }), ApiErrorCode.TextTooLong, "layout.features[1]" },
            { "long feature label", WithFeature(map, bridge with { Label = long41 }), ApiErrorCode.TextTooLong, "layout.features[1]" },
            { "width 0 feature", WithFeature(map, bridge with { W = 0 }), ApiErrorCode.FeatureInvalid, "layout.features[1]" },
            { "height 0 feature", WithFeature(map, bridge with { H = 0 }), ApiErrorCode.FeatureInvalid, "layout.features[1]" },
            { "feature off the map", WithFeature(map, bridge with { X = 7 }), ApiErrorCode.FeatureInvalid, "layout.features[1]" },
            { "feature negative", WithFeature(map, bridge with { Y = -1 }), ApiErrorCode.FeatureInvalid, "layout.features[1]" },
            { "feature too tall", WithFeature(map, bridge with { H = 5 }), ApiErrorCode.FeatureInvalid, "layout.features[1]" },
            { "feature too high", WithFeature(map, bridge with { Elevation = 10000m }), ApiErrorCode.FeatureInvalid, "layout.features[1]" },
            { "feature id twice", WithFeatures(map, bridge with { Id = "f1" }, bridge with { Id = "f1", X = 0 }), ApiErrorCode.FeatureInvalid, "layout.features[1]" },
            { "entrance without cells", WithEntrance(map, entrance with { Cells = [] }), ApiErrorCode.EntranceInvalid, "layout.entrances[1]" },
            { "entrance cells null", WithEntrance(map, entrance with { Cells = null! }), ApiErrorCode.EntranceInvalid, "layout.entrances[1]" },
            { "entrance inside", WithEntrance(map, entrance with { Cells = [[0, 1], [1, 1]] }), ApiErrorCode.EntranceInvalid, "layout.entrances[1]" },
            { "entrance off the map", WithEntrance(map, entrance with { Cells = [[8, 1]] }), ApiErrorCode.EntranceInvalid, "layout.entrances[1]" },
            { "entrance cell not a pair", WithEntrance(map, entrance with { Cells = [[0, 1, 2]] }), ApiErrorCode.EntranceInvalid, "layout.entrances[1]" },
            { "entrance id twice", WithEntrances(map, entrance with { Id = "e1" }, entrance with { Id = "e1" }), ApiErrorCode.EntranceInvalid, "layout.entrances[1]" },
            // The shared layout checks (MapChecks) catch what the parsing lets through.
            { "overlapping features", WithFeatures(map, bridge, bridge with { X = 4 }), ApiErrorCode.FeatureInvalid, "layout.features[1]" },
            { "entrance in the gorge", WithEntrance(map, entrance with { Cells = [[3, 0]] }), ApiErrorCode.EntranceInvalid, "layout.entrances[1]" },
            { "entrance in the wall", WithEntrance(map, entrance with { Cells = [[7, 0]] }), ApiErrorCode.EntranceInvalid, "layout.entrances[1]" },
            { "entrance cell in two entrances", WithEntrance(map, entrance with { Id = "e9", Cells = [[0, 2]] }), ApiErrorCode.EntranceInvalid, "layout.entrances[1]" },
            { "entrance cell twice", WithEntrance(map, entrance with { Cells = [[0, 1], [0, 1]] }), ApiErrorCode.EntranceInvalid, "layout.entrances[1]" },
            { "long entrance label", WithEntrance(map, entrance with { Label = long41 }), ApiErrorCode.TextTooLong, "layout.entrances[1]" },
            { "no type", WithCreature(map, goblin with { Type = " " }), ApiErrorCode.CreatureTypeInvalid, "creatures[3]" },
            { "type null", WithCreature(map, goblin with { Type = null! }), ApiErrorCode.CreatureTypeInvalid, "creatures[3]" },
            { "long type", WithCreature(map, goblin with { Type = long41 }), ApiErrorCode.CreatureTypeInvalid, "creatures[3]" },
            { "new type without size", WithCreature(map, goblin with { Type = "Wolf", Size = null }), ApiErrorCode.CreatureTypeInvalid, "creatures[3]" },
            { "long label", WithCreature(map, goblin with { X = 0, Y = 0, Label = long41 }), ApiErrorCode.TextTooLong, "creatures[3]" },
            { "on a goblin", WithCreature(map, goblin with { X = 6, Y = 1 }), ApiErrorCode.PlacementInvalid, "creatures[3]" },
            { "on the ogre", WithCreature(map, goblin with { X = 2, Y = 4 }), ApiErrorCode.PlacementInvalid, "creatures[3]" },
            { "in the gorge", WithCreature(map, goblin with { X = 3, Y = 0 }), ApiErrorCode.PlacementInvalid, "creatures[3]" },
            { "in the wall", WithCreature(map, goblin with { X = 7, Y = 0 }), ApiErrorCode.PlacementInvalid, "creatures[3]" },
            { "on the pillar", WithCreature(map, goblin with { X = 6, Y = 3 }), ApiErrorCode.PlacementInvalid, "creatures[3]" },
            { "off the map", WithCreature(map, goblin with { X = 8, Y = 0 }), ApiErrorCode.PlacementInvalid, "creatures[3]" },
            { "large half in the gorge", WithCreature(map, goblin with { Type = "Bär", Size = CreatureSize.Large, X = 2, Y = 0 }), ApiErrorCode.PlacementInvalid, "creatures[3]" },
            { "large overlapping a goblin", WithCreature(map, goblin with { Type = "Bär", Size = CreatureSize.Large, X = 5, Y = 0 }), ApiErrorCode.PlacementInvalid, "creatures[3]" },
            { "large off the edge", WithCreature(map, goblin with { Type = "Bär", Size = CreatureSize.Large, X = 7, Y = 1 }), ApiErrorCode.PlacementInvalid, "creatures[3]" },
        };
    }

    [Theory]
    [MemberData(nameof(Broken))]
    public void A_broken_file_is_refused_with_the_offending_entry(
        string because, ImportMapRequest request, ApiErrorCode code, string field)
    {
        var error = MapImport.Build(request, CampaignId, SessionId, [], Now, null, out var result);

        Assert.True(error == new ApiError(code, field), $"{because}: {error}");
        Assert.Null(result);
    }

    [Fact]
    public void Missing_values_are_filled_in()
    {
        var import = Build(TestMaps.Gorge() with
        {
            Name = "  Klamm  ",
            Scene = null,
            Vibe = "  windig  ",
            Lighting = null,
            Layout = TestMaps.Gorge().Layout with
            {
                Features =
                [
                    new LayoutFeatureFile(null, " pillar ", " ", 0, 0, 1, 1, null, null),
                    new LayoutFeatureFile("f1", "bridge", "Seilbrücke", 3, 1, 2, 2, 0.45m, false),
                    new LayoutFeatureFile("  ", "rock", null, 1, 0, 1, 1, 1.25m, true),
                ],
                Entrances =
                [
                    new LayoutEntranceFile(null, EntranceKind.Both, null, [[0, 4]]),
                    new LayoutEntranceFile("e1", EntranceKind.Exit, " Pfad ", [[7, 2]]),
                ],
            },
            Creatures = [],
        });

        var map = import.Map;
        Assert.Equal(("Klamm", "", "windig", ""), (map.Name, map.Scene, map.Vibe, map.Lighting));
        Assert.Equal(MapLayout.CurrentSchemaVersion, map.Layout.SchemaVersion);
        Assert.Equal(
            [
                new LayoutFeature("f2", "pillar", "pillar", 0, 0, 1, 1, 0, false),
                new LayoutFeature("f1", "bridge", "Seilbrücke", 3, 1, 2, 2, 0.5m, false),
                new LayoutFeature("f3", "rock", "rock", 1, 0, 1, 1, 1.3m, true),
            ],
            map.Layout.Features);
        Assert.Equal(
            [("e2", EntranceKind.Both, ""), ("e1", EntranceKind.Exit, "Pfad")],
            map.Layout.Entrances.Select(e => (e.Id, e.Kind, e.Label)));
        Assert.Equal([0, 4], map.Layout.Entrances[0].Cells.Single());
    }

    [Fact]
    public void Cells_are_stored_by_row_without_void_cells()
    {
        var import = Build(TestMaps.Gorge());

        var cells = import.Map.Layout.Cells;
        Assert.Equal(30, cells.Count);
        Assert.DoesNotContain(cells, c => c.Terrain == Terrain.Void);
        Assert.Equal(cells.OrderBy(c => c.Y).ThenBy(c => c.X), cells);
        Assert.Equal(new LayoutCell(0, 0, Terrain.Floor, 0), cells[0]);
        Assert.Equal(new LayoutCell(7, 0, Terrain.Wall, 1), cells[5]);
    }

    [Fact]
    public void The_encounter_is_ready_and_named_after_the_map()
    {
        var import = Build(TestMaps.Gorge());

        Assert.Equal(("Klamm", EncounterStatus.Ready, CampaignId, Now), (import.Encounter.Name, import.Encounter.Status, import.Encounter.CampaignId, import.Encounter.CreatedAt));
        Assert.Same(import.Map, import.Encounter.BattleMap);
        Assert.Equal((8, 5, CampaignId), (import.Map.Width, import.Map.Height, import.Map.CampaignId));
    }

    [Fact]
    public void New_creature_types_come_from_the_first_entry_naming_them()
    {
        var map = TestMaps.Gorge();
        var import = Build(map with
        {
            Creatures =
            [
                .. map.Creatures!,
                new ImportCreature("GOBLIN", CreatureSize.Huge, 0, 0, null),
                new ImportCreature("Wolf", CreatureSize.Medium, 0, 1, null),
            ],
        });

        Assert.Equal(
            [("Goblin", CreatureSize.Small), ("Oger", CreatureSize.Large), ("Wolf", CreatureSize.Medium)],
            import.NewTypes.Select(t => (t.Name, t.Size)));
        Assert.All(import.NewTypes, t => Assert.Equal((CampaignId, Now), (t.CampaignId, t.CreatedAt)));
        Assert.Equal(
            ["Goblin 1", "Goblin 2", "Oger 1", "Goblin 3", "Wolf 1"],
            import.Encounter.Tokens.Select(t => t.Label));
        Assert.Same(import.NewTypes[0], import.Encounter.Tokens[3].CreatureType);
    }

    [Fact]
    public void Existing_creature_types_keep_their_name_and_size()
    {
        var goblin = new CreatureType { CampaignId = CampaignId, Name = "Goblin", Size = CreatureSize.Medium };
        var map = TestMaps.Gorge();

        var error = MapImport.Build(
            map with { Creatures = [new ImportCreature(" goblin ", CreatureSize.Huge, 0, 0, null)] },
            CampaignId,
            SessionId,
            [goblin],
            Now,
            null,
            out var import);

        Assert.Null(error);
        Assert.Empty(import!.NewTypes);
        var token = Assert.Single(import.Encounter.Tokens);
        Assert.Same(goblin, token.CreatureType);
        Assert.Equal("Goblin 1", token.Label);
    }

    [Fact]
    public void Labelled_creatures_are_left_out_of_the_numbering()
    {
        var map = TestMaps.Gorge();
        var import = Build(map with
        {
            Creatures =
            [
                new ImportCreature("Goblin", CreatureSize.Small, 0, 0, "  Anführer  "),
                new ImportCreature("Goblin", null, 1, 0, " "),
                new ImportCreature("Goblin", null, 2, 0, null),
            ],
        });

        Assert.Equal(["Anführer", "Goblin 1", "Goblin 2"], import.Encounter.Tokens.Select(t => t.Label));
    }

    [Fact]
    public void A_long_type_name_is_shortened_so_the_number_fits()
    {
        var name = new string('x', 39) + "y";
        var map = TestMaps.Gorge();
        var import = Build(map with { Creatures = [new ImportCreature(name, CreatureSize.Small, 0, 0, null)] });

        Assert.Equal(new string('x', 38) + " 1", import.Encounter.Tokens.Single().Label);
    }

    [Fact]
    public void Tokens_stand_at_the_highest_elevation_under_them()
    {
        var map = TestMaps.Gorge();
        var import = Build(map with
        {
            Creatures =
            [
                .. map.Creatures!,
                new ImportCreature("Bär", CreatureSize.Large, 2, 1, null),
                new ImportCreature("Ratte", CreatureSize.Tiny, 4, 1, null),
            ],
        });

        Assert.Equal(
            [(5, 1, 1m), (6, 1, 1m), (1, 3, 0m), (2, 1, 0.5m), (4, 1, 0.5m)],
            import.Encounter.Tokens.Select(t => (t.X, t.Y, t.Elevation)));
        Assert.All(import.Encounter.Tokens, t => Assert.Equal((TokenKind.Creature, Now), (t.Kind, t.CreatedAt)));
    }

    [Fact]
    public void A_file_without_creatures_is_fine()
    {
        var import = Build(TestMaps.Gorge() with { Creatures = null });

        Assert.Empty(import.Encounter.Tokens);
        Assert.Empty(import.NewTypes);
    }

    private static MapImport.Result Build(ImportMapRequest request)
    {
        var error = MapImport.Build(request, CampaignId, SessionId, [], Now, null, out var result);
        Assert.Null(error);
        return result!;
    }

    private static ImportMapRequest WithCell(ImportMapRequest map, LayoutCellFile cell) =>
        map with { Layout = map.Layout with { Cells = [map.Layout.Cells[0], cell, .. map.Layout.Cells[1..]] } };

    private static ImportMapRequest WithFeature(ImportMapRequest map, LayoutFeatureFile feature) =>
        WithFeatures(map, map.Layout.Features![1], feature);

    private static ImportMapRequest WithFeatures(ImportMapRequest map, params LayoutFeatureFile[] features) =>
        map with { Layout = map.Layout with { Features = [.. features] } };

    private static ImportMapRequest WithEntrance(ImportMapRequest map, LayoutEntranceFile entrance) =>
        WithEntrances(map, map.Layout.Entrances![0], entrance);

    private static ImportMapRequest WithEntrances(ImportMapRequest map, params LayoutEntranceFile[] entrances) =>
        map with { Layout = map.Layout with { Entrances = [.. entrances] } };

    private static ImportMapRequest WithCreature(ImportMapRequest map, ImportCreature creature) =>
        map with { Creatures = [.. map.Creatures!, creature] };
}
