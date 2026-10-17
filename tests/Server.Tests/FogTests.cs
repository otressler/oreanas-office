using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// A fight on the gorge map (TestMaps.Gorge) with fog on (knowledge/features/fog-of-war.md):
// the east side from x = 5 and the rope bridge are hidden. Thorin (0,0), Aria (0,2) and the
// Large ogre (1,3) stand in the open; the goblins at (5,1) (A) and (6,1) (B) are in the fog.
public sealed record FoggedFight(RunningFight Fight, Guid GoblinA, Guid GoblinB)
{
    public Guid EncounterId => Fight.EncounterId;
}

public static class FogFights
{
    public static IEnumerable<(int X, int Y)> EastAndBridge()
    {
        for (var x = 3; x < 8; x++)
        {
            for (var y = 0; y < 5; y++)
            {
                if (x >= 5 || y is 1 or 2)
                {
                    yield return (x, y);
                }
            }
        }
    }

    // Fog and the hidden flags are set while the encounter is Ready, so the start numbers
    // the creatures the way a fight with fog does.
    public static async Task<FoggedFight> StartFoggedFightAsync(this AppFactory app, bool hideOgre = false)
    {
        var table = await app.CreateEncounterTableAsync();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var encounter = await db.Encounters.SingleAsync(e => e.Id == table.Encounter.Id);
            var hidden = EastAndBridge().Select(c => new[] { c.X, c.Y }).ToList();
            encounter.Fog = new FogDocument(hidden, [new FogArea("a1", "Ost", [.. hidden.Where(c => c[0] >= 5)])]);
            if (hideOgre)
            {
                (await db.Tokens.SingleAsync(t => t.EncounterId == encounter.Id && t.X == 1 && t.Y == 3)).Hidden = true;
            }

            await db.SaveChangesAsync();
        }

        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");
        var aria = await table.SecondDm.CreateCharacterAsync(table.CampaignId, "Aria");
        var started = await table.Dm.StartEncounterAsync(
            table.CampaignId, table.Session.Id, table.Encounter.Id, new CharacterPlacement(thorin.Id, 0, 0), new CharacterPlacement(aria.Id, 0, 2));
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        var board = await table.Dm.BoardAsync(table.CampaignId, table.Encounter.Id);
        var fight = new RunningFight(
            table,
            board.Tokens.Single(t => t.CharacterId == thorin.Id).Id,
            board.Tokens.Single(t => t.CharacterId == aria.Id).Id,
            board.Tokens.Single(t => (t.X, t.Y) == (5, 1)).Id,
            board.Tokens.Single(t => (t.X, t.Y) == (1, 3)).Id);
        return new FoggedFight(fight, fight.Goblin, board.Tokens.Single(t => (t.X, t.Y) == (6, 1)).Id);
    }

    public static async Task<string> PlayerBoardJsonAsync(this Person person, RunningFight fight) =>
        await person.Client.GetStringAsync($"/api/campaigns/{fight.CampaignId}/encounters/{fight.EncounterId}/board?view=player");

    public static async Task<BoardStateResponse> PlayerBoardAsync(this Person person, RunningFight fight) =>
        await (await person.Client.GetAsync($"/api/campaigns/{fight.CampaignId}/encounters/{fight.EncounterId}/board?view=player"))
            .ReadAsync<BoardStateResponse>(HttpStatusCode.OK);

    public static async Task<Token> TokenRowAsync(this AppFactory app, Guid tokenId)
    {
        await using var scope = app.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().Tokens.AsNoTracking().SingleAsync(t => t.Id == tokenId);
    }

    public static async Task<Encounter> EncounterRowAsync(this AppFactory app, Guid encounterId)
    {
        await using var scope = app.Services.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<AppDbContext>().Encounters.AsNoTracking().SingleAsync(e => e.Id == encounterId);
    }
}

// Fog, hidden creatures and numbers at first sight at the table: what each group receives.
public sealed class FogTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private AppFactory App => fixture.App;

    private static string Label(JsonElement token) => token.GetProperty("label").GetString()!;

    private static Guid Id(JsonElement element, string property = "tokenId") => element.GetProperty(property).GetGuid();

    [Fact]
    public async Task Players_never_get_hidden_creatures_or_the_layout_of_hidden_cells()
    {
        var fogged = await App.StartFoggedFightAsync(hideOgre: true);
        var fight = fogged.Fight;
        var (dm, player) = (fight.Table.Dm, fight.Table.Player);
        await using var playerDevice = await FogTestClient.JoinAsync(App, player, fight.EncounterId);

        // Players: their characters only; the creatures in the fog and the hidden ogre are gone.
        var playerJson = await player.PlayerBoardJsonAsync(fight);
        var asPlayer = await player.PlayerBoardAsync(fight);
        Assert.Equal(new[] { fight.Thorin, fight.Aria }.Order(), asPlayer.Tokens.Select(t => t.Id).Order());
        foreach (var secret in new[] { fogged.GoblinA, fogged.GoblinB, fight.Ogre })
        {
            Assert.DoesNotContain(secret.ToString(), playerJson);
        }

        Assert.All(asPlayer.Map.Layout.Cells, c => Assert.True(c.X <= 2));
        Assert.Empty(asPlayer.Map.Layout.Features);
        Assert.Equal([(0, 1), (0, 2)], asPlayer.Map.Layout.Entrances.Single().Cells.Select(c => (c[0], c[1])));
        Assert.Equal(FogFights.EastAndBridge().Count(), asPlayer.Fog!.HiddenCells.Count);
        Assert.Empty(asPlayer.Fog.Areas);
        Assert.False(asPlayer.IsSessionDm);

        // The session DM asking for the players' view gets exactly that, the DM's own board everything.
        var dmAsPlayer = await dm.PlayerBoardAsync(fight);
        Assert.Equal(asPlayer.Tokens.Select(t => t.Id).Order(), dmAsPlayer.Tokens.Select(t => t.Id).Order());
        Assert.Equal(asPlayer.Map.Layout.Cells.Count, dmAsPlayer.Map.Layout.Cells.Count);
        Assert.Empty(dmAsPlayer.Fog!.Areas);
        var dmBoard = await dm.BoardAsync(fight);
        Assert.Equal(5, dmBoard.Tokens.Count);
        Assert.Single(dmBoard.Fog!.Areas);

        // Unseen creatures have no number on the DM's board; the ogre stands in the open but is hidden.
        Assert.Equal(["Goblin", "Goblin", "Oger"], dmBoard.Tokens.Where(t => t.Kind == TokenKind.Creature).Select(t => t.Label).Order());
        Assert.True(dmBoard.Tokens.Single(t => t.Id == fight.Ogre).Hidden);

        // The DM's messages about them stay with the DM group.
        await using var dmDevice = await FogTestClient.JoinAsync(App, dm, fight.EncounterId);
        dmDevice.FenceRow = 2;
        Assert.Null((await dmDevice.MoveAsync(fogged.GoblinA, 6, 2)).Error);
        Assert.Null((await dmDevice.MoveAsync(fight.Ogre, 0, 3)).Error);
        Assert.Null((await dmDevice.PreviewAsync(fight.Ogre, 0, 3)).Error);
        await playerDevice.FenceAsync(dmDevice, fight.Aria);

        Assert.Equal(
            [nameof(ITableClient.TokenMoved)],
            playerDevice.Messages.Select(m => m.Method).Distinct());
        foreach (var secret in new[] { fogged.GoblinA, fogged.GoblinB, fight.Ogre })
        {
            Assert.DoesNotContain(secret.ToString(), playerDevice.Everything);
        }
    }

    [Fact]
    public async Task A_creature_crossing_the_fog_boundary_appears_and_disappears_and_keeps_its_number()
    {
        var fogged = await App.StartFoggedFightAsync();
        var fight = fogged.Fight;
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        dm.FenceRow = 2;

        // Fog to fog: nothing for the players.
        Assert.Null((await dm.MoveAsync(fogged.GoblinA, 6, 2)).Error);
        await player.FenceAsync(dm, fight.Aria);
        Assert.Empty(player.Of(nameof(ITableClient.TokenRevealed)));

        // Into the open: a TokenRevealed with the first number, instead of a TokenMoved.
        Assert.Null((await dm.MoveAsync(fogged.GoblinA, 2, 1)).Error);
        var revealed = (await player.WaitForAsync(nameof(ITableClient.TokenRevealed)))[0];
        Assert.Equal((fogged.GoblinA, "Goblin 1", 2, 1), (Id(revealed.GetProperty("token"), "id"), Label(revealed.GetProperty("token")), revealed.GetProperty("token").GetProperty("x").GetInt32(), revealed.GetProperty("token").GetProperty("y").GetInt32()));
        Assert.Equal(1, (await App.TokenRowAsync(fogged.GoblinA)).Number);

        // The DM hears the move and the number.
        await dm.WaitForAsync(nameof(ITableClient.TokenRevealed));
        Assert.Equal("Goblin 1", Label(dm.Of(nameof(ITableClient.TokenRevealed))[0].GetProperty("token")));

        // Back into the fog: the players see it fade out where it stood.
        Assert.Null((await dm.MoveAsync(fogged.GoblinA, 6, 2)).Error);
        var hidden = (await player.WaitForAsync(nameof(ITableClient.TokenHidden)))[0];
        Assert.Equal(fogged.GoblinA, Id(hidden));

        // And out again: the same number.
        Assert.Null((await dm.MoveAsync(fogged.GoblinA, 2, 2)).Error);
        var again = (await player.WaitForAsync(nameof(ITableClient.TokenRevealed), 2))[1];
        Assert.Equal("Goblin 1", Label(again.GetProperty("token")));

        // Moving inside the open is an ordinary TokenMoved.
        var moved = await dm.MoveAsync(fogged.GoblinA, 2, 0);
        await player.FenceAsync(dm, fight.Aria);
        Assert.Contains(player.Of(nameof(ITableClient.TokenMoved)), m => Id(m) == fogged.GoblinA && m.GetProperty("version").GetInt32() == moved.Move!.Version);

        // The second creature to be seen is Goblin 2, whichever was placed first.
        Assert.Null((await dm.MoveAsync(fogged.GoblinB, 1, 1)).Error);
        var second = (await player.WaitForAsync(nameof(ITableClient.TokenRevealed), 3))[2];
        Assert.Equal("Goblin 2", Label(second.GetProperty("token")));
    }

    [Fact]
    public async Task A_player_cannot_choose_fog_as_a_target_and_the_answer_is_the_same_as_for_a_wall()
    {
        var fogged = await App.StartFoggedFightAsync();
        var fight = fogged.Fight;
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        var invalid = new MoveResult(ApiErrorCode.TargetInvalid, null);

        // A floor cell in the fog, a wall, a void cell and a hidden bridge cell: one answer.
        foreach (var (x, y) in new[] { (5, 2), (7, 0), (3, 0), (3, 1) })
        {
            Assert.Equal(invalid, await player.MoveAsync(fight.Thorin, x, y));
            Assert.Equal(new HubResult(ApiErrorCode.TargetInvalid), await player.PreviewAsync(fight.Thorin, x, y));
        }

        Assert.Equal(0, (await App.TokenRowAsync(fight.Thorin)).Version);
        Assert.Null((await player.MoveAsync(fight.Thorin, 2, 2)).Error);

        // The session DM moves anything anywhere; a character in the fog moves out, not deeper in.
        Assert.Null((await dm.MoveAsync(fight.Thorin, 5, 2)).Error);
        Assert.Equal(invalid, await player.MoveAsync(fight.Thorin, 6, 2));
        Assert.Null((await player.MoveAsync(fight.Thorin, 2, 2)).Error);

        // A character may stand half in the fog? No: the whole footprint must be revealed.
        Assert.Equal(invalid, await player.MoveAsync(fight.Thorin, 4, 2));
    }

    [Fact]
    public async Task Revealing_cells_sends_the_layout_and_the_creatures_in_placement_order_with_numbers()
    {
        var fogged = await App.StartFoggedFightAsync();
        var fight = fogged.Fight;
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        // The ogre in the open is numbered at the start, the goblins in the fog are not.
        var before = await fight.Table.Dm.BoardAsync(fight);
        Assert.Equal("Oger 1", before.Tokens.Single(t => t.Id == fight.Ogre).Label);

        // Only goblin B: it is the first the players see, so "Goblin 1".
        Assert.Null((await dm.ChangeFogAsync(fight.EncounterId, reveal: true, (6, 1), (6, 1))).Error);
        var playerEvent = (await player.WaitForAsync(nameof(ITableClient.FogChanged)))[0];
        Assert.Equal((1, true), (playerEvent.GetProperty("version").GetInt32(), playerEvent.GetProperty("reveal").GetBoolean()));
        Assert.Equal([(6, 1)], playerEvent.GetProperty("cells").EnumerateArray().Select(c => (c.GetProperty("x").GetInt32(), c.GetProperty("y").GetInt32())));
        var layout = playerEvent.GetProperty("revealedLayout");
        var layoutCell = Assert.Single(layout.GetProperty("cells").EnumerateArray());
        Assert.Equal((6, 1), (layoutCell.GetProperty("x").GetInt32(), layoutCell.GetProperty("y").GetInt32()));
        var appeared = Assert.Single(playerEvent.GetProperty("appeared").EnumerateArray());
        Assert.Equal((fogged.GoblinB, "Goblin 1"), (Id(appeared, "id"), Label(appeared)));
        Assert.Empty(playerEvent.GetProperty("disappeared").EnumerateArray());

        // The DM's event is the plain change plus the numbers given.
        var dmEvent = (await dm.WaitForAsync(nameof(ITableClient.FogChanged)))[0];
        Assert.Equal(JsonValueKind.Null, dmEvent.GetProperty("revealedLayout").ValueKind);
        Assert.Empty(dmEvent.GetProperty("appeared").EnumerateArray());
        var numbered = Assert.Single(dmEvent.GetProperty("numbered").EnumerateArray());
        Assert.Equal((fogged.GoblinB, 1, "Goblin 1"), (Id(numbered), numbered.GetProperty("number").GetInt32(), numbered.GetProperty("label").GetString()));

        // A hidden bridge cell revealed sends the whole bridge, and no other hidden cell.
        Assert.Null((await dm.ChangeFogAsync(fight.EncounterId, reveal: true, (4, 1))).Error);
        var bridge = (await player.WaitForAsync(nameof(ITableClient.FogChanged), 2))[1].GetProperty("revealedLayout");
        var feature = Assert.Single(bridge.GetProperty("features").EnumerateArray());
        Assert.Equal(("bridge", 2, 2), (feature.GetProperty("kind").GetString(), feature.GetProperty("w").GetInt32(), feature.GetProperty("h").GetInt32()));
        Assert.Empty(bridge.GetProperty("cells").EnumerateArray());

        // Then goblin A: "Goblin 2".
        Assert.Null((await dm.ChangeFogAsync(fight.EncounterId, reveal: true, (5, 1))).Error);
        var third = (await player.WaitForAsync(nameof(ITableClient.FogChanged), 3))[2];
        Assert.Equal("Goblin 2", Label(Assert.Single(third.GetProperty("appeared").EnumerateArray())));
        Assert.Equal(3, third.GetProperty("version").GetInt32());

        // Saved: both boards show the cells open and the fog one version higher per change.
        var board = await fight.Table.Player.PlayerBoardAsync(fight);
        Assert.DoesNotContain(board.Fog!.HiddenCells, c => (c.X, c.Y) is (6, 1) or (4, 1) or (5, 1));
        Assert.Equal(3, board.Fog.Version);
        Assert.Equal(["Goblin 1", "Goblin 2"], board.Tokens.Where(t => t.Kind == TokenKind.Creature && t.Id != fight.Ogre).Select(t => t.Label).Order());
        Assert.Equal(3, (await App.EncounterRowAsync(fight.EncounterId)).FogVersion);

        // Two creatures at once are numbered in placement order: a fresh fight, one reveal.
        var other = await App.StartFoggedFightAsync();
        await using var otherDm = await FogTestClient.JoinAsync(App, other.Fight.Table.Dm, other.EncounterId);
        await using var otherPlayer = await FogTestClient.JoinAsync(App, other.Fight.Table.Player, other.EncounterId);
        Assert.Null((await otherDm.ChangeFogAsync(other.EncounterId, true, (6, 1), (5, 1))).Error);
        var both = (await otherPlayer.WaitForAsync(nameof(ITableClient.FogChanged)))[0].GetProperty("appeared").EnumerateArray();
        // (An import gives all its creatures one CreatedAt, so the ids settle the order.)
        var rows = new[] { await App.TokenRowAsync(other.GoblinA), await App.TokenRowAsync(other.GoblinB) };
        var placed = rows.OrderBy(t => t.CreatedAt).ThenBy(t => t.Id).Select(t => t.Id).ToList();
        Assert.Equal([(placed[0], "Goblin 1"), (placed[1], "Goblin 2")], both.Select(t => (Id(t, "id"), Label(t))).OrderBy(t => t.Item2));
    }

    [Fact]
    public async Task Hiding_cells_removes_creatures_and_UndoChange_takes_the_change_back()
    {
        var fogged = await App.StartFoggedFightAsync();
        var fight = fogged.Fight;
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        Assert.Equal(ApiErrorCode.NothingToUndo, (await dm.UndoChangeAsync(fight.EncounterId)).Error);
        Assert.Null((await dm.ChangeFogAsync(fight.EncounterId, true, (5, 1), (6, 1))).Error);
        Assert.Null((await dm.ChangeFogAsync(fight.EncounterId, false, (5, 1), (6, 1))).Error);
        var hide = (await player.WaitForAsync(nameof(ITableClient.FogChanged), 2))[1];
        Assert.False(hide.GetProperty("reveal").GetBoolean());
        Assert.Equal(new[] { fogged.GoblinA, fogged.GoblinB }.Order(), hide.GetProperty("disappeared").EnumerateArray().Select(e => e.GetGuid()).Order());
        Assert.Equal(JsonValueKind.Null, hide.GetProperty("revealedLayout").ValueKind);

        // Undo puts the reveal back; the creatures are the same, with their numbers.
        Assert.Null((await dm.UndoChangeAsync(fight.EncounterId)).Error);
        var undone = (await player.WaitForAsync(nameof(ITableClient.FogChanged), 3))[2];
        Assert.True(undone.GetProperty("reveal").GetBoolean());
        Assert.Equal(["Goblin 1", "Goblin 2"], undone.GetProperty("appeared").EnumerateArray().Select(Label).Order());
        Assert.Equal(3, (await App.EncounterRowAsync(fight.EncounterId)).FogVersion);

        // The undone change stays the latest, so a second undo finds nothing (as for moves).
        Assert.Equal(ApiErrorCode.NothingToUndo, (await dm.UndoChangeAsync(fight.EncounterId)).Error);

        // Undoing a reveal hides the cells again; the numbers stay.
        var fresh = await App.StartFoggedFightAsync();
        await using var freshDm = await FogTestClient.JoinAsync(App, fresh.Fight.Table.Dm, fresh.EncounterId);
        await using var freshPlayer = await FogTestClient.JoinAsync(App, fresh.Fight.Table.Player, fresh.EncounterId);
        Assert.Null((await freshDm.ChangeFogAsync(fresh.EncounterId, true, (6, 1))).Error);
        Assert.Null((await freshDm.UndoChangeAsync(fresh.EncounterId)).Error);
        var hidden = (await freshPlayer.WaitForAsync(nameof(ITableClient.FogChanged), 2))[1];
        Assert.Equal([fresh.GoblinB], hidden.GetProperty("disappeared").EnumerateArray().Select(e => e.GetGuid()));
        Assert.Equal(1, (await App.TokenRowAsync(fresh.GoblinB)).Number);
        Assert.DoesNotContain(
            (await fresh.Fight.Table.Player.PlayerBoardAsync(fresh.Fight)).Tokens,
            t => t.Id == fresh.GoblinB);
    }

    [Fact]
    public async Task Only_the_session_DM_changes_fog_and_the_cells_must_be_inside_a_map_with_fog()
    {
        var fogged = await App.StartFoggedFightAsync();
        var fight = fogged.Fight;
        await using var brom = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var yara = await FogTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        dm.FenceRow = 2;

        foreach (var device in new[] { brom, yara })
        {
            Assert.Equal(ApiErrorCode.NotSessionDm, (await device.ChangeFogAsync(fight.EncounterId, true, (5, 1))).Error);
            Assert.Equal(ApiErrorCode.NotSessionDm, (await device.SetHiddenAsync(fight.EncounterId, true, fight.Ogre)).Error);
            Assert.Equal(ApiErrorCode.NotSessionDm, (await device.UndoChangeAsync(fight.EncounterId)).Error);
        }

        Assert.Equal(ApiErrorCode.FogInvalid, (await dm.ChangeFogAsync(fight.EncounterId, true, (8, 0))).Error);
        Assert.Equal(ApiErrorCode.FogInvalid, (await dm.ChangeFogAsync(fight.EncounterId, true, (0, -1))).Error);
        Assert.Equal(ApiErrorCode.FogInvalid, (await dm.ChangeFogAsync(fight.EncounterId, true)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await dm.ChangeFogAsync(Guid.NewGuid(), true, (1, 1))).Error);

        // A change that changes nothing succeeds and sends nothing.
        Assert.Null((await dm.ChangeFogAsync(fight.EncounterId, true, (0, 0), (1, 1))).Error);
        await brom.FenceAsync(dm, fight.Aria);
        Assert.Empty(brom.Of(nameof(ITableClient.FogChanged)));
        Assert.Empty(dm.Of(nameof(ITableClient.FogChanged)));
        Assert.Equal(0, (await App.EncounterRowAsync(fight.EncounterId)).FogVersion);

        // A fight without fog has nothing to change.
        var plain = await App.StartFightAsync();
        await using var plainDm = await FogTestClient.JoinAsync(App, plain.Table.Dm, plain.EncounterId);
        Assert.Equal(ApiErrorCode.FogInvalid, (await plainDm.ChangeFogAsync(plain.EncounterId, true, (1, 1))).Error);

        // Someone outside the campaign gets nothing to see either.
        var outsider = await App.CreatePersonAsync("Fremder");
        await using var stranger = await TableTestClient.ConnectAsync(App, outsider);
        Assert.Equal(
            ApiErrorCode.TokenNotFound,
            (await stranger.Connection.InvokeAsync<HubResult>(nameof(ITableHub.ChangeFog), new ChangeFogRequest(fight.EncounterId, [new BoardCell(5, 1)], true))).Error);
    }

    [Fact]
    public async Task SetTokensHidden_hides_and_reveals_creatures_and_numbers_them_at_first_sight()
    {
        var fogged = await App.StartFoggedFightAsync(hideOgre: true);
        var fight = fogged.Fight;
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        dm.FenceRow = 2;
        Assert.Null((await App.TokenRowAsync(fight.Ogre)).Number);

        // The ogre stands in the open, hidden. Revealing it numbers it.
        Assert.Null((await dm.SetHiddenAsync(fight.EncounterId, false, fight.Ogre)).Error);
        var revealed = (await player.WaitForAsync(nameof(ITableClient.TokenRevealed)))[0].GetProperty("token");
        Assert.Equal((fight.Ogre, "Oger 1"), (Id(revealed, "id"), Label(revealed)));
        Assert.Equal("Oger 1", Label((await dm.WaitForAsync(nameof(ITableClient.TokenRevealed)))[0].GetProperty("token")));

        // Hiding again: both get TokenHidden; the number stays, and comes back with it.
        Assert.Null((await dm.SetHiddenAsync(fight.EncounterId, true, fight.Ogre)).Error);
        Assert.Equal(fight.Ogre, Id((await player.WaitForAsync(nameof(ITableClient.TokenHidden)))[0]));
        Assert.Equal(fight.Ogre, Id((await dm.WaitForAsync(nameof(ITableClient.TokenHidden)))[0]));
        Assert.True((await App.TokenRowAsync(fight.Ogre)).Hidden);
        Assert.Null((await dm.UndoChangeAsync(fight.EncounterId)).Error);
        Assert.Equal("Oger 1", Label((await player.WaitForAsync(nameof(ITableClient.TokenRevealed), 2))[1].GetProperty("token")));
        Assert.Equal(ApiErrorCode.NothingToUndo, (await dm.UndoChangeAsync(fight.EncounterId)).Error);

        // A creature already hidden changes nothing and sends nothing; a hidden one in the fog
        // that is revealed stays invisible and gets no number.
        Assert.Null((await dm.SetHiddenAsync(fight.EncounterId, true, fight.Ogre)).Error);
        await player.FenceAsync(dm, fight.Aria);
        var before = player.Messages.Count;
        Assert.Null((await dm.SetHiddenAsync(fight.EncounterId, true, fight.Ogre)).Error);
        Assert.Null((await dm.SetHiddenAsync(fight.EncounterId, true, fogged.GoblinA)).Error);
        Assert.Null((await dm.SetHiddenAsync(fight.EncounterId, false, fogged.GoblinA)).Error);
        await player.FenceAsync(dm, fight.Aria);
        Assert.All(player.Messages.Skip(before), m => Assert.Equal(nameof(ITableClient.TokenMoved), m.Method));
        Assert.DoesNotContain(fogged.GoblinA.ToString(), player.Everything);
        Assert.Null((await App.TokenRowAsync(fogged.GoblinA)).Number);

        // Errors.
        Assert.Equal(ApiErrorCode.TokenNotFound, (await dm.SetHiddenAsync(fight.EncounterId, true, fight.Thorin)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await dm.SetHiddenAsync(fight.EncounterId, true, Guid.NewGuid())).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await dm.SetHiddenAsync(fight.EncounterId, true)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await dm.SetHiddenAsync(fight.EncounterId, true, fight.Ogre, Guid.NewGuid())).Error);
    }

    [Fact]
    public async Task Without_fog_a_hidden_creature_is_numbered_when_it_is_revealed_and_the_editor_labels_stay()
    {
        var fight = await App.StartFightAsync();
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        var board = await fight.Table.Dm.BoardAsync(fight);
        Assert.Equal(["Goblin 1", "Goblin 2", "Oger 1"], board.Tokens.Where(t => t.Kind == TokenKind.Creature).Select(t => t.Label).Order());

        // Hide and reveal a numbered goblin: it keeps "Goblin 1".
        var goblin = board.Tokens.Single(t => t.Label == "Goblin 1").Id;
        Assert.Null((await dm.SetHiddenAsync(fight.EncounterId, true, goblin)).Error);
        Assert.Equal(goblin, Id((await player.WaitForAsync(nameof(ITableClient.TokenHidden)))[0]));
        Assert.DoesNotContain(goblin, (await fight.Table.Player.PlayerBoardAsync(fight)).Tokens.Select(t => t.Id));
        Assert.Null((await dm.SetHiddenAsync(fight.EncounterId, false, goblin)).Error);
        Assert.Equal("Goblin 1", Label((await player.WaitForAsync(nameof(ITableClient.TokenRevealed)))[0].GetProperty("token")));

        // An unnumbered hidden ogre gets the next number once revealed.
        await using (var scope = App.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var ogre = await db.Tokens.SingleAsync(t => t.Id == fight.Ogre);
            (ogre.Hidden, ogre.Number) = (true, null);
            await db.SaveChangesAsync();
        }

        Assert.Null((await dm.SetHiddenAsync(fight.EncounterId, false, fight.Ogre)).Error);
        Assert.Equal("Oger 1", Label((await player.WaitForAsync(nameof(ITableClient.TokenRevealed), 2))[1].GetProperty("token")));
    }
}
