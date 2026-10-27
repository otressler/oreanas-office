using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Sync;
using OreanasOffice.Server.Table;
using OreanasOffice.Server.Tests.Images;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests;

// Hit points and the dead mark (knowledge/features/hit-points.md): the session DM notes them
// on the table hub; hit points reach the session DM alone, the dead mark everyone.
public sealed class HitPointsTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private AppFactory App => fixture.App;

    // The goblins' type gets 7 hit points, and the ogre its own 59, before the fight starts.
    private static async Task PrepareAsync(EncounterTable table)
    {
        var encounter = await table.Dm.FetchOneAsync(table.CampaignId, table.Encounter.Id);
        var data = encounter.Encounter!;
        var goblin = data.Tokens.Single(t => (t.X, t.Y) == (5, 1));
        var type = await table.Dm.FetchOneAsync(table.CampaignId, goblin.CreatureTypeId);
        var typed = await table.Dm.PushOneAsync(CreatureType(
            table.CampaignId, type.Id, type.CreatureType!.Name, type.CreatureType.Size, type.Version, hitPoints: 7));
        Assert.Equal(SyncOutcome.Saved, typed.Outcome);

        var tokens = data.Tokens
            .Select(t => (t.X, t.Y) == (1, 3) ? t with { MaxHitPoints = 59 } : t)
            .ToArray();
        var pushed = await table.Dm.PushOneAsync(Encounter(
            table.CampaignId, table.Session.Id, data.BattleMapId, encounter.Id, encounter.Version, data.Name, data.Status, data.ArchivedAt, tokens));
        Assert.Equal(SyncOutcome.Saved, pushed.Outcome);
    }

    private static Task<HitPointsResult> SetAsync(FogTestClient device, Guid tokenId, int hitPoints, int maxHitPoints) =>
        device.InvokeAsync<HitPointsResult>(nameof(ITableHub.SetHitPoints), new SetHitPointsRequest(tokenId, hitPoints, maxHitPoints));

    private static Task<DeadResult> DeadAsync(FogTestClient device, Guid tokenId, bool dead) =>
        device.InvokeAsync<DeadResult>(nameof(ITableHub.SetTokenDead), new SetTokenDeadRequest(tokenId, dead));

    [Fact]
    public async Task Creatures_start_with_their_own_hit_points_or_their_type_s_on_the_DM_s_board_only()
    {
        var fight = await App.StartFightAsync(PrepareAsync);

        var board = await fight.Table.Dm.BoardAsync(fight);
        var goblin = board.Tokens.Single(t => t.Id == fight.Goblin);
        var ogre = board.Tokens.Single(t => t.Id == fight.Ogre);
        Assert.Equal((7, 7), (goblin.HitPoints, goblin.MaxHitPoints));
        Assert.Equal((59, 59), (ogre.HitPoints, ogre.MaxHitPoints));
        Assert.All(board.Tokens.Where(t => t.Kind == Encounters.TokenKind.Character), t => Assert.Null(t.MaxHitPoints));

        // Nobody else gets them, not even another `dm` member or the session DM's players' view.
        foreach (var other in new[]
                 {
                     await fight.Table.Player.BoardAsync(fight),
                     await fight.Table.SecondDm.BoardAsync(fight),
                     await fight.Table.Dm.PlayerBoardAsync(fight),
                 })
        {
            Assert.All(other.Tokens, t => Assert.Equal((null, null), (t.HitPoints, t.MaxHitPoints)));
        }
    }

    [Fact]
    public async Task Noted_hit_points_reach_the_session_DM_alone()
    {
        var fight = await App.StartFightAsync(PrepareAsync);
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        dm.FenceRow = 2;

        var result = await SetAsync(dm, fight.Goblin, 3, 9);

        Assert.Equal(new HitPointsResult(null, new TokenHitPointsChangedEvent(fight.EncounterId, fight.Goblin, 3, 9)), result);
        var changed = Assert.Single(await dm.WaitForAsync(nameof(ITableClient.TokenHitPointsChanged)));
        Assert.Equal(3, changed.GetProperty("hitPoints").GetInt32());
        var goblin = (await fight.Table.Dm.BoardAsync(fight)).Tokens.Single(t => t.Id == fight.Goblin);
        Assert.Equal((3, 9), (goblin.HitPoints, goblin.MaxHitPoints));
        var saved = await App.InDbAsync(db => db.Tokens.AsNoTracking().SingleAsync(t => t.Id == fight.Goblin));
        Assert.Equal((3, 9, 0), (saved.HitPoints, saved.MaxHitPoints, saved.Version));

        await player.FenceAsync(dm, fight.Aria);
        Assert.Empty(player.Of(nameof(ITableClient.TokenHitPointsChanged)));
        Assert.Null((await fight.Table.Player.BoardAsync(fight)).Tokens.Single(t => t.Id == fight.Goblin).HitPoints);

        // A goblin brought back after being taken off doesn't carry them to players either.
        await dm.InvokeAsync<HubResult>(nameof(ITableHub.RemoveToken), fight.Goblin);
        await dm.InvokeAsync<HubResult>(nameof(ITableHub.RestoreToken), fight.Goblin);
        var restored = Assert.Single(await player.WaitForAsync(nameof(ITableClient.TokenRestored)));
        Assert.Equal(JsonValueKind.Null, restored.GetProperty("token").GetProperty("hitPoints").ValueKind);
        Assert.Equal(JsonValueKind.Null, restored.GetProperty("token").GetProperty("maxHitPoints").ValueKind);
        var dmRestored = Assert.Single(await dm.WaitForAsync(nameof(ITableClient.TokenRestored)));
        Assert.Equal(3, dmRestored.GetProperty("token").GetProperty("hitPoints").GetInt32());
    }

    [Fact]
    public async Task Hit_points_out_of_range_on_characters_or_from_others_are_refused()
    {
        var fight = await App.StartFightAsync(PrepareAsync);
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var secondDm = await FogTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        foreach (var (left, max) in new[] { (8, 7), (-1, 7), (0, 0), (5, HitPointRulesMax + 1) })
        {
            Assert.Equal(ApiErrorCode.HitPointsInvalid, (await SetAsync(dm, fight.Goblin, left, max)).Error);
        }

        Assert.Equal(ApiErrorCode.TokenNotFound, (await SetAsync(dm, fight.Thorin, 5, 10)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await DeadAsync(dm, fight.Aria, true)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await SetAsync(dm, Guid.NewGuid(), 5, 10)).Error);
        Assert.Equal(ApiErrorCode.NotSessionDm, (await SetAsync(player, fight.Goblin, 5, 10)).Error);
        Assert.Equal(ApiErrorCode.NotSessionDm, (await SetAsync(secondDm, fight.Goblin, 5, 10)).Error);
        Assert.Equal(ApiErrorCode.NotSessionDm, (await DeadAsync(player, fight.Goblin, true)).Error);

        await dm.InvokeAsync<HubResult>(nameof(ITableHub.RemoveToken), fight.Ogre);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await SetAsync(dm, fight.Ogre, 5, 10)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await DeadAsync(dm, fight.Ogre, true)).Error);

        Assert.Empty(dm.Of(nameof(ITableClient.TokenHitPointsChanged)));
        Assert.Empty(dm.Of(nameof(ITableClient.TokenDeadChanged)));
        var goblin = (await fight.Table.Dm.BoardAsync(fight)).Tokens.Single(t => t.Id == fight.Goblin);
        Assert.Equal((7, 7, false), (goblin.HitPoints, goblin.MaxHitPoints, goblin.Dead));
    }

    [Fact]
    public async Task Everyone_sees_a_creature_marked_dead_and_it_still_moves()
    {
        var fight = await App.StartFightAsync();
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        var result = await DeadAsync(dm, fight.Goblin, true);

        Assert.Equal(new DeadResult(null, new TokenDeadChangedEvent(fight.EncounterId, fight.Goblin, true)), result);
        var seen = Assert.Single(await player.WaitForAsync(nameof(ITableClient.TokenDeadChanged)));
        Assert.True(seen.GetProperty("dead").GetBoolean());
        Assert.Single(await dm.WaitForAsync(nameof(ITableClient.TokenDeadChanged)));
        Assert.True((await fight.Table.Player.BoardAsync(fight)).Tokens.Single(t => t.Id == fight.Goblin).Dead);
        Assert.True((await fight.Table.Dm.BoardAsync(fight)).Tokens.Single(t => t.Id == fight.Goblin).Dead);

        // Only a mark: the dead goblin moves like any creature.
        Assert.Null((await dm.MoveAsync(fight.Goblin, 5, 2)).Error);

        Assert.Null((await DeadAsync(dm, fight.Goblin, false)).Error);
        Assert.Equal(2, (await player.WaitForAsync(nameof(ITableClient.TokenDeadChanged), 2)).Count);
        Assert.False((await fight.Table.Player.BoardAsync(fight)).Tokens.Single(t => t.Id == fight.Goblin).Dead);
    }

    [Fact]
    public async Task Hit_points_of_types_and_tokens_sync_and_are_checked()
    {
        var table = await App.CreateEncounterTableAsync();
        var type = await table.Dm.PushOneAsync(CreatureType(table.CampaignId, name: "Troll", hitPoints: 84));
        Assert.Equal(SyncOutcome.Created, type.Outcome);
        Assert.Equal(84, (await table.Dm.FetchOneAsync(table.CampaignId, type.Id)).CreatureType!.HitPoints);

        foreach (var hitPoints in new[] { 0, HitPointRulesMax + 1 })
        {
            var rejected = await table.Dm.PushOneAsync(CreatureType(table.CampaignId, name: $"Troll {hitPoints}", hitPoints: hitPoints));
            Assert.Equal((SyncOutcome.Rejected, ApiErrorCode.CreatureTypeInvalid, "hitPoints"), (rejected.Outcome, rejected.Error!.Code, rejected.Error.Field));
        }

        var encounter = await table.Dm.FetchOneAsync(table.CampaignId, table.Encounter.Id);
        var data = encounter.Encounter!;
        var none = await table.Dm.PushOneAsync(Encounter(
            table.CampaignId, table.Session.Id, data.BattleMapId, encounter.Id, encounter.Version, data.Name, data.Status, data.ArchivedAt,
            [.. data.Tokens.Select((t, i) => i == 0 ? t with { MaxHitPoints = 0 } : t)]));
        Assert.Equal((SyncOutcome.Rejected, ApiErrorCode.TokenInvalid), (none.Outcome, none.Error!.Code));
    }

    private const int HitPointRulesMax = Encounters.HitPointRules.MaxMax;
}
