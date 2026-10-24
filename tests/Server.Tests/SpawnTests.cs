using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sync;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests;

// Creature spawn at the table (knowledge/features/creature-spawn.md): the session DM adds
// creatures to a running fight, saved in one step, sent to each group through the fog filter.
public sealed class SpawnTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private AppFactory App => fixture.App;

    private static string Label(JsonElement token) => token.GetProperty("label").GetString()!;

    private static async Task<Guid> TypeOfAsync(RunningFight fight, Guid tokenId) =>
        (await fight.Table.Dm.BoardAsync(fight)).Tokens.Single(t => t.Id == tokenId).CreatureTypeId!.Value;

    [Fact]
    public async Task A_spawn_is_numbered_after_the_highest_saved_and_reaches_both_groups()
    {
        var fight = await App.StartFightAsync();
        var goblin = await TypeOfAsync(fight, fight.Goblin);
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        // Question 34: a type made on the spot with only a name and a size.
        var wolf = Guid.NewGuid();
        var pushed = await fight.Table.Dm.PushOneAsync(CreatureType(fight.CampaignId, wolf, "Wolf", CreatureSize.Medium, appearance: "", notes: ""));
        Assert.Equal(SyncOutcome.Created, pushed.Outcome);

        // Two goblins, one standing on Thorin, and a wolf up on the high ground.
        var result = await dm.SpawnAsync(fight.EncounterId, false, (goblin, 2, 0), (goblin, 0, 0), (wolf, 6, 2));

        Assert.Null(result.Error);
        Assert.Equal(3, result.TokenIds!.Count);
        var added = (await player.WaitForAsync(nameof(ITableClient.TokensAdded)))[0].GetProperty("tokens").EnumerateArray().ToList();
        Assert.Equal(["Goblin 3", "Goblin 4", "Wolf 1"], added.Select(Label));
        Assert.Equal(result.TokenIds, added.Select(t => t.GetProperty("id").GetGuid()));
        Assert.Equal(1m, added[2].GetProperty("elevation").GetDecimal());
        Assert.Equal(
            ["Goblin 3", "Goblin 4", "Wolf 1"],
            (await dm.WaitForAsync(nameof(ITableClient.TokensAdded)))[0].GetProperty("tokens").EnumerateArray().Select(Label));

        // Saved, in the board both groups load; with one EncounterChange for the undo.
        var board = await fight.Table.Player.PlayerBoardAsync(fight);
        Assert.Equal(result.TokenIds.Order(), board.Tokens.Where(t => result.TokenIds.Contains(t.Id)).Select(t => t.Id).Order());
        await using (var scope = App.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var change = await db.EncounterChanges.SingleAsync(c => c.EncounterId == fight.EncounterId);
            Assert.Equal((EncounterChangeKind.Spawn, fight.Table.Dm.Id, (DateTimeOffset?)null), (change.Kind, change.ByUserId, change.UndoneAt));
        }

        // Undo takes all three off every device; their numbers are not given out again.
        Assert.Null((await dm.UndoChangeAsync(fight.EncounterId)).Error);
        Assert.Equal(3, (await player.WaitForAsync(nameof(ITableClient.TokenRemoved), 3)).Count);
        Assert.Equal(3, (await dm.WaitForAsync(nameof(ITableClient.TokenRemoved), 3)).Count);
        var afterUndo = await fight.Table.Player.PlayerBoardAsync(fight);
        Assert.Empty(afterUndo.Tokens.Select(t => t.Id).Intersect(result.TokenIds));
        Assert.Equal(3, (await fight.Table.Dm.BoardAsync(fight)).RemovedTokens.Count);
        Assert.Equal(ApiErrorCode.NothingToUndo, (await dm.UndoChangeAsync(fight.EncounterId)).Error);

        var again = await dm.SpawnAsync(fight.EncounterId, false, (goblin, 2, 1));
        var next = (await player.WaitForAsync(nameof(ITableClient.TokensAdded), 2))[1].GetProperty("tokens").EnumerateArray();
        Assert.Equal(["Goblin 5"], next.Select(Label));
        Assert.Single(again.TokenIds!);
    }

    [Fact]
    public async Task A_hidden_spawn_stays_with_the_DM_until_it_is_revealed_and_does_not_shift_the_numbers()
    {
        var fight = await App.StartFightAsync();
        var goblin = await TypeOfAsync(fight, fight.Goblin);
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        dm.FenceRow = 2;

        var hidden = await dm.SpawnAsync(fight.EncounterId, true, (goblin, 2, 0), (goblin, 2, 1));
        Assert.Null(hidden.Error);
        var visible = await dm.SpawnAsync(fight.EncounterId, false, (goblin, 2, 2));
        Assert.Null(visible.Error);

        // The players' only TokensAdded is the visible one, "Goblin 3": the hidden pair has no number yet.
        await player.FenceAsync(dm, fight.Aria);
        var added = Assert.Single(player.Of(nameof(ITableClient.TokensAdded)));
        Assert.Equal(["Goblin 3"], added.GetProperty("tokens").EnumerateArray().Select(Label));
        foreach (var id in hidden.TokenIds!)
        {
            Assert.DoesNotContain(id.ToString(), player.Everything);
            Assert.DoesNotContain(id, (await fight.Table.Player.PlayerBoardAsync(fight)).Tokens.Select(t => t.Id));
        }

        var dmAdded = (await dm.WaitForAsync(nameof(ITableClient.TokensAdded), 2))[0].GetProperty("tokens").EnumerateArray();
        Assert.Equal(["Goblin", "Goblin"], dmAdded.Select(Label));
        Assert.All(dmAdded, t => Assert.True(t.GetProperty("hidden").GetBoolean()));

        // Revealing them numbers them in the order they were placed.
        Assert.Null((await dm.SetHiddenAsync(fight.EncounterId, false, hidden.TokenIds.Reverse<Guid>().ToArray())).Error);
        var revealed = (await player.WaitForAsync(nameof(ITableClient.TokenRevealed), 2));
        Assert.Equal(
            [(hidden.TokenIds[0], "Goblin 4"), (hidden.TokenIds[1], "Goblin 5")],
            revealed.Select(r => (r.GetProperty("token").GetProperty("id").GetGuid(), Label(r.GetProperty("token")))).OrderBy(t => t.Item2));
    }

    [Fact]
    public async Task Under_fog_a_spawn_reaches_players_only_where_they_can_see_and_is_numbered_at_first_sight()
    {
        var fogged = await App.StartFoggedFightAsync();
        var fight = fogged.Fight;
        var goblin = await TypeOfAsync(fight, fight.Goblin);
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        var result = await dm.SpawnAsync(fight.EncounterId, false, (goblin, 7, 2), (goblin, 2, 0), (goblin, 7, 3));

        Assert.Null(result.Error);
        var added = (await player.WaitForAsync(nameof(ITableClient.TokensAdded)))[0].GetProperty("tokens").EnumerateArray().ToList();
        var open = Assert.Single(added);
        Assert.Equal((result.TokenIds![1], "Goblin 1"), (open.GetProperty("id").GetGuid(), Label(open)));
        Assert.DoesNotContain(result.TokenIds[0].ToString(), player.Everything);
        Assert.DoesNotContain(result.TokenIds[2].ToString(), player.Everything);
        Assert.Equal(
            ["Goblin", "Goblin 1", "Goblin"],
            (await dm.WaitForAsync(nameof(ITableClient.TokensAdded)))[0].GetProperty("tokens").EnumerateArray().Select(Label));

        // Revealing the cells numbers the two in the fog in the order they were spawned.
        Assert.Null((await dm.ChangeFogAsync(fight.EncounterId, true, (7, 3), (7, 2))).Error);
        var appeared = (await player.WaitForAsync(nameof(ITableClient.FogChanged)))[0].GetProperty("appeared").EnumerateArray();
        Assert.Equal(
            [(result.TokenIds[0], "Goblin 2"), (result.TokenIds[2], "Goblin 3")],
            appeared.Select(t => (t.GetProperty("id").GetGuid(), Label(t))).OrderBy(t => t.Item2));
    }

    [Fact]
    public async Task Spawning_is_for_the_session_DM_and_needs_valid_creatures_and_cells()
    {
        var fight = await App.StartFightAsync();
        var goblin = await TypeOfAsync(fight, fight.Goblin);
        var ogre = await TypeOfAsync(fight, fight.Ogre);
        await using var brom = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var yara = await FogTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        var tokensBefore = (await fight.Table.Dm.BoardAsync(fight)).Tokens.Count;

        Assert.Equal(ApiErrorCode.NotSessionDm, (await brom.SpawnAsync(fight.EncounterId, false, (goblin, 2, 0))).Error);
        Assert.Equal(ApiErrorCode.NotSessionDm, (await yara.SpawnAsync(fight.EncounterId, false, (goblin, 2, 0))).Error);
        Assert.Equal(ApiErrorCode.SpawnInvalid, (await dm.SpawnAsync(fight.EncounterId, false)).Error);
        Assert.Equal(ApiErrorCode.SpawnInvalid, (await dm.SpawnAsync(fight.EncounterId, false, Enumerable.Repeat((goblin, 2, 0), TableSpawns.MaxCreatures + 1).ToArray())).Error);
        Assert.Equal(ApiErrorCode.SpawnInvalid, (await dm.SpawnAsync(fight.EncounterId, false, (Guid.NewGuid(), 2, 0))).Error);
        Assert.Equal(ApiErrorCode.SpawnInvalid, (await dm.SpawnAsync(fight.EncounterId, false, (goblin, 2, 0), (Guid.NewGuid(), 2, 1))).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await dm.SpawnAsync(Guid.NewGuid(), false, (goblin, 2, 0))).Error);

        // Wall, void, a hole in the map, the pillar, off the map, and a Large one half off it.
        foreach (var (type, x, y) in new[] { (goblin, 7, 0), (goblin, 3, 0), (goblin, 4, 4), (goblin, 6, 3), (goblin, 8, 0), (goblin, 0, -1), (ogre, 7, 3), (ogre, 6, 0) })
        {
            Assert.Equal(new SpawnResult(ApiErrorCode.TargetInvalid, null), await dm.SpawnAsync(fight.EncounterId, false, (goblin, 2, 0), (type, x, y)));
        }

        // Nothing was saved, not even the valid first creature of each request.
        Assert.Equal(tokensBefore, (await fight.Table.Dm.BoardAsync(fight)).Tokens.Count);

        // The biggest spawn is fine; creatures may stand on each other.
        var many = await dm.SpawnAsync(fight.EncounterId, false, Enumerable.Repeat((goblin, 2, 0), TableSpawns.MaxCreatures).ToArray());
        Assert.Equal(TableSpawns.MaxCreatures, many.TokenIds!.Count);

        // Not in a fight that is over.
        Assert.Equal(HttpStatusCode.OK, (await fight.Table.Dm.EndEncounterAsync(fight.CampaignId, fight.Table.Session.Id, fight.EncounterId)).StatusCode);
        Assert.Equal(ApiErrorCode.EncounterNotActive, (await dm.SpawnAsync(fight.EncounterId, false, (goblin, 2, 0))).Error);
    }
}
