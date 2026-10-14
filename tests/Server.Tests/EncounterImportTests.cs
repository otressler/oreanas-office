using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// POST /encounters/import and the DM's list (knowledge/domain/battle-map.md, "Import
// file"). The rules themselves are in MapImportTests.
[Collection("App")]
public sealed class EncounterImportTests(AppFixture fixture)
{
    // Every sample map the frontend offers imports as it is, and its board matches the
    // frontend's fixture for it: the same layout and creature tokens.
    [Theory]
    [InlineData("crypt")]
    [InlineData("gorge-crossing")]
    [InlineData("open-field")]
    [InlineData("river-ford")]
    public async Task The_sample_maps_import(string sample)
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var campaign = await dm.CreateCampaignAsync();
        var file = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "SampleMaps", $"{sample}.json"));
        var expected = JsonSerializerRead<BoardStateResponse>(
            await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "BoardFixtures", $"{sample}.board.json")));

        var response = await dm.Client.PostAsync(
            $"/api/campaigns/{campaign.Id}/encounters/import", new StringContent(file, Encoding.UTF8, "application/json"));

        var summary = await response.ReadAsync<EncounterSummaryResponse>(HttpStatusCode.Created);
        var board = await (await dm.GetBoardAsync(campaign.Id, summary.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
        var creatures = expected.Tokens.Where(t => t.Kind == TokenKind.Creature).ToList();
        Assert.Equal(
            (expected.Name, EncounterStatus.Ready, expected.Map.Width, expected.Map.Height, creatures.Count, (Guid?)null),
            (summary.Name, summary.Status, summary.Width, summary.Height, summary.CreatureCount, summary.SessionId));
        Assert.Equal(expected.Map.Layout.SchemaVersion, board.Map.Layout.SchemaVersion);
        Assert.Equal(expected.Map.Layout.Cells, board.Map.Layout.Cells);
        Assert.Equal(expected.Map.Layout.Features, board.Map.Layout.Features);
        Assert.Equal(Entrances(expected.Map.Layout), Entrances(board.Map.Layout));
        Assert.Equal(Creatures(creatures), Creatures(board.Tokens));
    }

    [Fact]
    public async Task An_import_creates_a_ready_encounter_named_after_the_map()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var campaign = await dm.CreateCampaignAsync();

        var response = await dm.Client.PostAsJsonAsync($"/api/campaigns/{campaign.Id}/encounters/import", TestMaps.Gorge(), Json);

        var summary = await response.ReadAsync<EncounterSummaryResponse>(HttpStatusCode.Created);
        Assert.Equal(
            $"/api/campaigns/{campaign.Id}/encounters/{summary.Id}/board", response.Headers.Location?.OriginalString);
        Assert.Equal(
            new EncounterSummaryResponse(
                summary.Id, "Klamm", EncounterStatus.Ready, summary.BattleMapId, 8, 5, 3, null, summary.CreatedAt),
            summary);

        await using var scope = fixture.App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var map = await db.BattleMaps.SingleAsync(m => m.Id == summary.BattleMapId);
        Assert.Equal(
            (campaign.Id, "Klamm", "Seilbrücke über einer Schlucht", "angespannt", "Dämmerung", 30),
            (map.CampaignId, map.Name, map.Scene, map.Vibe, map.Lighting, map.Layout.Cells.Count));
        Assert.Equal(
            [("Goblin", CreatureSize.Small), ("Oger", CreatureSize.Large)],
            await db.CreatureTypes
                .Where(t => t.CampaignId == campaign.Id)
                .OrderBy(t => t.Name)
                .Select(t => ValueTuple.Create(t.Name, t.Size))
                .ToListAsync());
    }

    // A file that breaks a rule leaves nothing behind, not even the creature types its
    // valid entries would have created.
    [Fact]
    public async Task A_broken_file_is_refused_as_a_whole()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var campaign = await dm.CreateCampaignAsync();
        var map = TestMaps.Gorge();
        var broken = map with { Creatures = [.. map.Creatures!, new ImportCreature("Wolf", CreatureSize.Medium, 3, 0, null)] };

        var response = await dm.Client.PostAsJsonAsync($"/api/campaigns/{campaign.Id}/encounters/import", broken, Json);

        await response.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.PlacementInvalid, "creatures[3]");
        await using var scope = fixture.App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False(await db.CreatureTypes.AnyAsync(t => t.CampaignId == campaign.Id));
        Assert.False(await db.BattleMaps.AnyAsync(m => m.CampaignId == campaign.Id));
        Assert.False(await db.Encounters.AnyAsync(e => e.CampaignId == campaign.Id));
    }

    [Theory]
    [InlineData("""{"name":"Klamm","width":8,"height":5,"layout":{"schemaVersion":3,"cells":[]}}""", ApiErrorCode.LayoutVersionUnsupported, "layout.schemaVersion")]
    [InlineData("""{"name":"Klamm","width":8,"height":5,"layout":{"cells":[{"x":9,"y":0,"terrain":"floor"}]}}""", ApiErrorCode.CellInvalid, "layout.cells[0]")]
    [InlineData("""{"name":"Klamm","width":8,"height":5}""", ApiErrorCode.CellInvalid, "layout.cells")]
    [InlineData("""{"width":8,"height":5,"layout":{"cells":[]}}""", ApiErrorCode.NameInvalid, "name")]
    [InlineData("""{"name":"Klamm","width":8,"height":5,"layout":{"cells":[{"x":0,"y":0,"terrain":"floor"}]},"creatures":[{"type":"Goblin","x":0,"y":0}]}""", ApiErrorCode.CreatureTypeInvalid, "creatures[0]")]
    public async Task Broken_files_name_the_offending_entry(string file, ApiErrorCode code, string field)
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var campaign = await dm.CreateCampaignAsync();

        var response = await dm.Client.PostAsync(
            $"/api/campaigns/{campaign.Id}/encounters/import", new StringContent(file, Encoding.UTF8, "application/json"));

        await response.AssertErrorAsync(HttpStatusCode.BadRequest, code, field);
    }

    [Fact]
    public async Task A_minimal_file_imports_with_defaults()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var campaign = await dm.CreateCampaignAsync();
        const string file = """{"name":" Raum ","width":2,"height":1,"layout":{"cells":[{"x":0,"y":0,"terrain":"floor"},{"x":1,"y":0,"terrain":"void"}]}}""";

        var response = await dm.Client.PostAsync(
            $"/api/campaigns/{campaign.Id}/encounters/import", new StringContent(file, Encoding.UTF8, "application/json"));

        var summary = await response.ReadAsync<EncounterSummaryResponse>(HttpStatusCode.Created);
        var board = await (await dm.GetBoardAsync(campaign.Id, summary.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
        Assert.Equal(("Raum", 0), (summary.Name, summary.CreatureCount));
        Assert.Equal(1, board.Map.Layout.SchemaVersion);
        Assert.Equal([new LayoutCell(0, 0, Terrain.Floor, 0)], board.Map.Layout.Cells);
        Assert.Empty(board.Map.Layout.Features);
        Assert.Empty(board.Map.Layout.Entrances);
        Assert.Empty(board.Tokens);
    }

    // Types match by name ignoring case and keep what they were created with; a later
    // import numbers its goblins from 1 again.
    [Fact]
    public async Task Later_imports_reuse_the_campaigns_creature_types()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var campaign = await dm.CreateCampaignAsync();
        var first = await dm.ImportMapAsync(campaign.Id);
        var map = TestMaps.Gorge();

        var second = await dm.ImportMapAsync(campaign.Id, map with
        {
            Name = "Zweite Klamm",
            Creatures = [new ImportCreature("gOBLIN", CreatureSize.Huge, 0, 0, null)],
        });

        var firstBoard = await (await dm.GetBoardAsync(campaign.Id, first.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
        var secondBoard = await (await dm.GetBoardAsync(campaign.Id, second.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
        var goblin = Assert.Single(secondBoard.Tokens);
        Assert.Equal(firstBoard.Tokens.Single(t => t.Label == "Goblin 1").CreatureTypeId, goblin.CreatureTypeId);
        Assert.Equal(("Goblin 1", CreatureSize.Small), (goblin.Label, goblin.Size));
        await using var scope = fixture.App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(2, await db.CreatureTypes.CountAsync(t => t.CampaignId == campaign.Id));
    }

    // Each campaign has its own bestiary.
    [Fact]
    public async Task Creature_types_of_another_campaign_are_not_reused()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var here = await dm.CreateCampaignAsync();
        var there = await dm.CreateCampaignAsync("Andere Runde");
        await dm.ImportMapAsync(there.Id);
        var map = TestMaps.Gorge();

        var response = await dm.Client.PostAsJsonAsync(
            $"/api/campaigns/{here.Id}/encounters/import",
            map with { Creatures = [new ImportCreature("Goblin", null, 0, 0, null)] },
            Json);

        await response.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.CreatureTypeInvalid, "creatures[0]");
    }

    // Two imports bringing the same new type at once: the unique index lets one create
    // it, and the other retries and finds it.
    [Fact]
    public async Task Simultaneous_imports_share_a_new_creature_type()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var campaign = await dm.CreateCampaignAsync();

        var results = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => dm.ImportMapAsync(campaign.Id)));

        Assert.All(results, r => Assert.Equal(EncounterStatus.Ready, r.Status));
        await using var scope = fixture.App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.Equal(2, await db.CreatureTypes.CountAsync(t => t.CampaignId == campaign.Id));
    }

    private static T JsonSerializerRead<T>(string json) => System.Text.Json.JsonSerializer.Deserialize<T>(json, Json)!;

    private static IEnumerable<string> Entrances(MapLayout layout) =>
        layout.Entrances.Select(e => $"{e.Id} {e.Kind} {e.Label} {string.Join(";", e.Cells.Select(c => string.Join(",", c)))}");

    private static IEnumerable<(string, int, int, decimal, CreatureSize, int?)> Creatures(IEnumerable<BoardToken> tokens) =>
        tokens
            .Where(t => t.Kind == TokenKind.Creature)
            .OrderBy(t => t.Label, StringComparer.Ordinal)
            .Select(t => (t.Label, t.X, t.Y, t.Elevation, t.Size, t.ColorIndex));
}
