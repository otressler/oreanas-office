using System.Net;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sync;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests;

// What synced changes mean for starting and running a fight: archived encounters and
// creatures that no longer fit the map don't start, and a fight keeps the map and the
// sizes it began with (knowledge/domain/encounter.md, "Starting" and `layout`).
[Collection("App")]
public sealed class EncounterSyncTests(AppFixture fixture)
{
    // The gorge map with a wall on the small goblin's cell (5, 1).
    private static MapLayout WithWallAtGoblin(MapLayout layout) => layout with
    {
        Cells = [.. layout.Cells.Select(c => (c.X, c.Y) == (5, 1) ? c with { Terrain = Terrain.Wall } : c)],
    };

    private static async Task<SyncItemResult> PushMapLayoutAsync(EncounterTable table, Func<MapLayout, MapLayout> change)
    {
        var encounter = await table.Dm.FetchOneAsync(table.CampaignId, table.Encounter.Id);
        var map = await table.Dm.FetchOneAsync(table.CampaignId, encounter.Encounter!.BattleMapId);
        var result = await table.Dm.PushOneAsync(
            Map(table.CampaignId, map.Id, map.Version, map.Map! with { Layout = change(map.Map.Layout) }));
        Assert.Equal(SyncOutcome.Saved, result.Outcome);
        return result;
    }

    private static async Task<SyncItemResult> PushArchivedAsync(EncounterTable table, DateTimeOffset? archivedAt)
    {
        var current = await table.Dm.FetchOneAsync(table.CampaignId, table.Encounter.Id);
        var data = current.Encounter!;
        var result = await table.Dm.PushOneAsync(
            Encounter(table.CampaignId, data.BattleMapId, current.Id, current.Version, data.Name, data.Status, archivedAt, [.. data.Tokens]));
        Assert.Equal(SyncOutcome.Saved, result.Outcome);
        return result;
    }

    // Starting

    [Fact]
    public async Task An_archived_encounter_does_not_start_until_it_is_brought_back()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        await PushArchivedAsync(table, DateTimeOffset.UtcNow);

        var archived = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        await PushArchivedAsync(table, null);
        var restored = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        await archived.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.EncounterArchived);
        Assert.Equal(EncounterStatus.Active, (await restored.ReadAsync<EncounterSummaryResponse>(HttpStatusCode.OK)).Status);
    }

    [Fact]
    public async Task Starting_an_encounter_whose_creature_no_longer_fits_the_map_is_refused()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var tokens = (await table.Dm.FetchOneAsync(table.CampaignId, table.Encounter.Id)).Encounter!.Tokens;
        await PushMapLayoutAsync(table, WithWallAtGoblin);

        var response = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        var misplaced = tokens.FindIndex(t => (t.X, t.Y) == (5, 1));
        await response.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.CreaturesMisplaced, $"tokens[{misplaced}]");
        var after = await table.Dm.FetchOneAsync(table.CampaignId, table.Encounter.Id);
        Assert.Equal((EncounterStatus.Ready, 1), (after.Encounter!.Status, after.Version));
    }

    [Fact]
    public async Task A_map_change_that_leaves_the_creatures_in_place_starts_on_the_new_layout()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        await PushMapLayoutAsync(table, layout => layout with
        {
            Cells = [.. layout.Cells.Select(c => (c.X, c.Y) == (2, 4) ? c with { Terrain = Terrain.Difficult } : c)],
        });

        var response = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var board = await (await table.Dm.GetBoardAsync(table.CampaignId, table.Encounter.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
        Assert.Equal(Terrain.Difficult, board.Map.Layout.Cells.Single(c => (c.X, c.Y) == (2, 4)).Terrain);
    }

    // A fight keeps what it began with

    [Fact]
    public async Task A_running_and_an_ended_encounter_keep_the_layout_they_started_with()
    {
        var fight = await fixture.App.StartFightAsync();
        var table = fight.Table;
        var before = await (await table.Dm.GetBoardAsync(table.CampaignId, table.Encounter.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);

        await PushMapLayoutAsync(table, WithWallAtGoblin);
        await PushMapLayoutAsync(table, layout => layout with { Cells = [.. layout.Cells.Where(c => c.X < 7)] });
        var whileRunning = await (await table.Player.GetBoardAsync(table.CampaignId, table.Encounter.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
        await table.Dm.EndEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        var ended = await (await table.Dm.GetBoardAsync(table.CampaignId, table.Encounter.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);

        Assert.Equal(ToJson(before.Map), ToJson(whileRunning.Map));
        Assert.Equal(ToJson(before.Map), ToJson(ended.Map));
        Assert.Equal(Terrain.Floor, ended.Map.Layout.Cells.Single(c => (c.X, c.Y) == (5, 1)).Terrain);
        Assert.Contains(ended.Map.Layout.Cells, c => c.X == 7);

        // The prepared map itself did change.
        var current = await table.Dm.FetchOneAsync(table.CampaignId, ended.Map.Id);
        Assert.DoesNotContain(current.Map!.Layout.Cells, c => c.X == 7);
    }

    [Fact]
    public async Task A_token_keeps_its_size_when_its_creature_type_grows()
    {
        var fight = await fixture.App.StartFightAsync();
        var table = fight.Table;
        var board = await (await table.Dm.GetBoardAsync(table.CampaignId, table.Encounter.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
        var goblin = board.Tokens.Single(t => t.Id == fight.Goblin);
        var type = await table.Dm.FetchOneAsync(table.CampaignId, goblin.CreatureTypeId!.Value);
        Assert.Equal(CreatureSize.Small, goblin.Size);

        var grown = await table.Dm.PushOneAsync(CreatureType(
            table.CampaignId, type.Id, type.CreatureType!.Name, CreatureSize.Gargantuan, type.Version));
        var after = await (await table.Dm.GetBoardAsync(table.CampaignId, table.Encounter.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);

        Assert.Equal(SyncOutcome.Saved, grown.Outcome);
        Assert.Equal(
            board.Tokens.Select(t => (t.Id, t.Size)),
            after.Tokens.Select(t => (t.Id, t.Size)));
    }
}
