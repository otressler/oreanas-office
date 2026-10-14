using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// The live table hub with several devices (knowledge/decisions/realtime-sync.md,
// domain/token.md): permissions, the target check, save before broadcast, undo, and
// the end of a fight. The fight is TestMaps.Gorge, see EncounterTables.StartFightAsync.
[Collection("App")]
public sealed class TableHubTests(AppFixture fixture)
{
    private AppFactory App => fixture.App;

    [Fact]
    public async Task A_move_is_saved_and_reaches_everyone_at_the_table()
    {
        var fight = await App.StartFightAsync();
        var (dm, player) = (fight.Table.Dm, fight.Table.Player);
        await using var playerDevice = await TableTestClient.JoinAsync(App, player, fight.EncounterId);
        await using var dmDevice = await TableTestClient.JoinAsync(App, dm, fight.EncounterId);
        await using var lateDevice = await TableTestClient.ConnectAsync(App, fight.Table.SecondDm);

        var result = await playerDevice.MoveAsync(fight.Thorin, 5, 2);

        var expected = new TokenMovedEvent(fight.EncounterId, fight.Thorin, 5, 2, 1m, 1, player.Id, Undo: false);
        Assert.Equal(new MoveResult(null, expected), result);
        Assert.Equal(expected, await dmDevice.NextMoveAsync());
        Assert.Equal(expected, await playerDevice.NextMoveAsync());

        var token = await TokenAsync(player, fight, fight.Thorin);
        Assert.Equal((5, 2, 1m, 1), (token.X, token.Y, token.Elevation, token.Version));
        var move = Assert.Single(await HistoryAsync(fight.Thorin));
        Assert.Equal(
            (fight.EncounterId, player.Id, 0, 0, 0m, 5, 2, 1m, 1, (DateTimeOffset?)null),
            (move.EncounterId, move.ByUserId, move.FromX, move.FromY, move.FromElevation, move.ToX, move.ToY, move.ToElevation, move.Version, move.UndoneAt));
        Assert.InRange(move.At, DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddMinutes(1));

        // A device hears only the encounters it joined: the late one gets the next move, not the first.
        Assert.Null((await lateDevice.JoinEncounterAsync(fight.EncounterId)).Error);
        var second = await playerDevice.MoveAsync(fight.Thorin, 5, 3);
        Assert.Equal(second.Move, await lateDevice.NextMoveAsync());
    }

    [Fact]
    public async Task Players_move_only_their_own_characters()
    {
        var fight = await App.StartFightAsync();
        await using var player = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var secondDm = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);

        // Yara is a `dm` member of the campaign but doesn't run the session: a player here.
        MoveResult[] rejected =
        [
            await player.MoveAsync(fight.Aria, 1, 0),
            await player.MoveAsync(fight.Goblin, 5, 2),
            await player.MoveAsync(fight.Ogre, 0, 0),
            await secondDm.MoveAsync(fight.Thorin, 1, 0),
            await secondDm.MoveAsync(fight.Goblin, 5, 2),
        ];
        var own = await player.MoveAsync(fight.Thorin, 1, 0);
        var yarasOwn = await secondDm.MoveAsync(fight.Aria, 1, 1);

        Assert.All(rejected, r => Assert.Equal(new MoveResult(ApiErrorCode.NotYourToken, null), r));
        Assert.Null(own.Error);
        Assert.Null(yarasOwn.Error);

        // Rejected moves broadcast nothing: the first message is the first good move.
        Assert.Equal(own.Move, await secondDm.NextMoveAsync());
        Assert.Equal(yarasOwn.Move, await secondDm.NextMoveAsync());
    }

    [Fact]
    public async Task The_session_DM_moves_any_token()
    {
        var fight = await App.StartFightAsync();
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        MoveResult[] results =
        [
            await dm.MoveAsync(fight.Thorin, 1, 0),
            await dm.MoveAsync(fight.Aria, 1, 1),
            await dm.MoveAsync(fight.Goblin, 5, 2),
            await dm.MoveAsync(fight.Ogre, 5, 0),
        ];

        Assert.All(results, r => Assert.Null(r.Error));
        Assert.All(results, r => Assert.Equal(fight.Table.Dm.Id, r.Move!.ByUserId));
    }

    // Roles are read on every call, so a session handed to another DM applies at once.
    // The campaign's default DM is then a player too.
    [Fact]
    public async Task A_new_session_DM_takes_over_at_once()
    {
        var fight = await App.StartFightAsync();
        await using var oreana = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await using var yara = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);

        await HandSessionToAsync(fight, fight.Table.SecondDm);

        Assert.Equal(ApiErrorCode.NotYourToken, (await oreana.MoveAsync(fight.Goblin, 5, 2)).Error);
        Assert.Null((await yara.MoveAsync(fight.Goblin, 5, 2)).Error);
    }

    // knowledge/decisions/realtime-sync.md, "Where a token may go".
    [Theory]
    [InlineData(false, 7, 0)] // in the wall
    [InlineData(false, 3, 0)] // in the gorge, a listed void cell
    [InlineData(false, 4, 4)] // in the gorge, a cell missing from the layout
    [InlineData(false, 6, 3)] // on the pillar
    [InlineData(false, 8, 0)] // off the map
    [InlineData(false, 0, -1)] // off the map
    [InlineData(true, 6, 0)] // the ogre half in the wall
    [InlineData(true, 2, 3)] // the ogre half in the gorge
    [InlineData(true, 7, 1)] // the ogre half off the map
    public async Task A_token_stands_only_on_walkable_cells_inside_the_map(bool ogre, int x, int y)
    {
        var fight = await App.StartFightAsync();
        var tokenId = ogre ? fight.Ogre : fight.Thorin;
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        var result = await dm.MoveAsync(tokenId, x, y);

        Assert.Equal(new MoveResult(ApiErrorCode.TargetInvalid, null), result);
        Assert.Equal(0, (await TokenAsync(fight.Table.Dm, fight, tokenId)).Version);
        Assert.Empty(await HistoryAsync(tokenId));
    }

    // Unlike placement, tokens may overlap; the token takes the highest elevation under it.
    [Fact]
    public async Task Tokens_stand_on_the_bridge_and_on_other_tokens()
    {
        var fight = await App.StartFightAsync();
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        var onBridge = await dm.MoveAsync(fight.Thorin, 3, 1);
        var onGoblin = await dm.MoveAsync(fight.Thorin, 5, 1);
        var ogreHalfOnBridge = await dm.MoveAsync(fight.Ogre, 2, 1);
        var ogreOnAria = await dm.MoveAsync(fight.Ogre, 0, 1);

        Assert.Equal((3, 1, 0.5m), Position(onBridge));
        Assert.Equal((5, 1, 1m), Position(onGoblin));
        Assert.Equal((2, 1, 0.5m), Position(ogreHalfOnBridge));
        Assert.Equal((0, 1, 0m), Position(ogreOnAria));
        var ogre = await TokenAsync(fight.Table.Dm, fight, fight.Ogre);
        Assert.Equal((0, 1, 0m, 2), (ogre.X, ogre.Y, ogre.Elevation, ogre.Version));
    }

    [Fact]
    public async Task Undo_puts_back_the_own_last_move_once()
    {
        var fight = await App.StartFightAsync();
        var player = fight.Table.Player;
        await using var playerDevice = await TableTestClient.JoinAsync(App, player, fight.EncounterId);
        await using var dmDevice = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await playerDevice.MoveAsync(fight.Thorin, 3, 1);
        await playerDevice.MoveAsync(fight.Thorin, 5, 2);
        await dmDevice.NextMoveAsync();
        await dmDevice.NextMoveAsync();

        var before = await BoardAsync(player, fight);
        var dmBefore = await BoardAsync(fight.Table.Dm, fight);
        var undo = await playerDevice.UndoAsync(fight.EncounterId);
        var again = await playerDevice.UndoAsync(fight.EncounterId);

        Assert.Equal(new UndoableMove(fight.Thorin, 2), before.UndoableMove);
        Assert.Null(dmBefore.UndoableMove);
        var expected = new TokenMovedEvent(fight.EncounterId, fight.Thorin, 3, 1, 0.5m, 3, player.Id, Undo: true);
        Assert.Equal(new MoveResult(null, expected), undo);
        Assert.Equal(expected, await dmDevice.NextMoveAsync());

        // Only the last move: the earlier one stays, and a second undo finds nothing.
        Assert.Equal(new MoveResult(ApiErrorCode.NothingToUndo, null), again);
        var after = await BoardAsync(player, fight);
        Assert.Null(after.UndoableMove);
        var token = after.Tokens.Single(t => t.Id == fight.Thorin);
        Assert.Equal((3, 1, 0.5m, 3), (token.X, token.Y, token.Elevation, token.Version));
        var history = await HistoryAsync(fight.Thorin);
        Assert.Equal([false, true], history.Select(m => m.UndoneAt is not null));
    }

    [Fact]
    public async Task Undo_is_gone_once_someone_else_moved_the_token()
    {
        var fight = await App.StartFightAsync();
        await using var player = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await player.MoveAsync(fight.Thorin, 1, 0);
        await dm.MoveAsync(fight.Thorin, 2, 0);

        var playerBoard = await BoardAsync(fight.Table.Player, fight);
        var dmBoard = await BoardAsync(fight.Table.Dm, fight);
        var playerUndo = await player.UndoAsync(fight.EncounterId);
        var dmUndo = await dm.UndoAsync(fight.EncounterId);

        Assert.Null(playerBoard.UndoableMove);
        Assert.Equal(new UndoableMove(fight.Thorin, 2), dmBoard.UndoableMove);
        Assert.Equal(new MoveResult(ApiErrorCode.NothingToUndo, null), playerUndo);
        Assert.Equal((1, 0, 3, true), (dmUndo.Move!.X, dmUndo.Move.Y, dmUndo.Move.Version, dmUndo.Move.Undo));
    }

    // The session DM moves the token back instead (knowledge/decisions/realtime-sync.md, "Undo").
    [Fact]
    public async Task The_session_DM_undoes_only_their_own_moves()
    {
        var fight = await App.StartFightAsync();
        await using var player = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        var nothingYet = await dm.UndoAsync(fight.EncounterId);
        await dm.MoveAsync(fight.Goblin, 5, 2);
        await player.MoveAsync(fight.Thorin, 1, 0);
        var undo = await dm.UndoAsync(fight.EncounterId);

        Assert.Equal(new MoveResult(ApiErrorCode.NothingToUndo, null), nothingYet);
        Assert.Equal((fight.Goblin, 5, 1), (undo.Move!.TokenId, undo.Move.X, undo.Move.Y));
        var thorin = await TokenAsync(fight.Table.Player, fight, fight.Thorin);
        Assert.Equal((1, 0), (thorin.X, thorin.Y));
        Assert.Equal(new UndoableMove(fight.Thorin, 1), (await BoardAsync(fight.Table.Player, fight)).UndoableMove);
    }

    [Fact]
    public async Task Undo_needs_the_right_to_move_the_token_still()
    {
        var fight = await App.StartFightAsync();
        await using var oreana = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await oreana.MoveAsync(fight.Goblin, 5, 2);

        await HandSessionToAsync(fight, fight.Table.SecondDm);
        var board = await BoardAsync(fight.Table.Dm, fight);
        var undo = await oreana.UndoAsync(fight.EncounterId);

        Assert.Null(board.UndoableMove);
        Assert.Equal(new MoveResult(ApiErrorCode.NotYourToken, null), undo);
    }

    // Errors for an encounter or token the caller can't see don't tell them apart.
    [Fact]
    public async Task Only_members_join_and_move()
    {
        var fight = await App.StartFightAsync();
        var stranger = await App.CreatePersonAsync("Fremder");
        await using var strangerDevice = await TableTestClient.ConnectAsync(App, stranger);
        await using var player = await TableTestClient.ConnectAsync(App, fight.Table.Player);
        var ready = await fight.Table.Dm.ImportMapAsync(fight.CampaignId, fight.Table.Session.Id, TestMaps.Gorge() with { Name = "Zweite Klamm" });

        Assert.Equal(ApiErrorCode.TokenNotFound, (await strangerDevice.JoinEncounterAsync(fight.EncounterId)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await strangerDevice.MoveAsync(fight.Thorin, 1, 0)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await strangerDevice.UndoAsync(fight.EncounterId)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await player.JoinEncounterAsync(Guid.NewGuid())).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await player.MoveAsync(Guid.NewGuid(), 1, 0)).Error);
        Assert.Equal(ApiErrorCode.EncounterNotActive, (await player.JoinEncounterAsync(ready.Id)).Error);
        Assert.Null((await player.JoinEncounterAsync(fight.EncounterId)).Error);
    }

    [Fact]
    public async Task Nothing_moves_once_the_fight_has_ended()
    {
        var fight = await App.StartFightAsync();
        var table = fight.Table;
        await using var player = await TableTestClient.JoinAsync(App, table.Player, fight.EncounterId);
        await using var dm = await TableTestClient.JoinAsync(App, table.Dm, fight.EncounterId);
        await player.MoveAsync(fight.Thorin, 1, 0);
        await dm.MoveAsync(fight.Goblin, 5, 2);

        Assert.Equal(HttpStatusCode.OK, (await table.Dm.EndEncounterAsync(fight.CampaignId, table.Session.Id, fight.EncounterId)).StatusCode);

        Assert.Equal(ApiErrorCode.EncounterNotActive, (await player.MoveAsync(fight.Thorin, 2, 0)).Error);
        Assert.Equal(ApiErrorCode.EncounterNotActive, (await player.UndoAsync(fight.EncounterId)).Error);
        Assert.Equal(ApiErrorCode.EncounterNotActive, (await dm.UndoAsync(fight.EncounterId)).Error);
        Assert.Equal(ApiErrorCode.EncounterNotActive, (await dm.JoinEncounterAsync(fight.EncounterId)).Error);
        Assert.Null((await BoardAsync(table.Dm, fight)).UndoableMove);
    }

    [Fact]
    public async Task Everyone_hears_when_the_fight_ends()
    {
        var fight = await App.StartFightAsync();
        var table = fight.Table;
        await using var player = await TableTestClient.JoinAsync(App, table.Player, fight.EncounterId);
        await using var secondDm = await TableTestClient.JoinAsync(App, table.SecondDm, fight.EncounterId);

        await table.Dm.EndEncounterAsync(fight.CampaignId, table.Session.Id, fight.EncounterId);

        Assert.Equal(fight.EncounterId, await player.NextEncounterEndedAsync());
        Assert.Equal(fight.EncounterId, await secondDm.NextEncounterEndedAsync());
    }

    [Fact]
    public async Task Everyone_hears_when_the_session_ends()
    {
        var fight = await App.StartFightAsync();
        var table = fight.Table;
        await using var player = await TableTestClient.JoinAsync(App, table.Player, fight.EncounterId);

        var response = await table.Dm.Client.PostAsync($"/api/campaigns/{fight.CampaignId}/sessions/{table.Session.Id}/end", null);

        Assert.Equal(SessionStatus.Ended, (await response.ReadAsync<SessionResponse>(HttpStatusCode.OK)).Status);
        Assert.Equal(fight.EncounterId, await player.NextEncounterEndedAsync());
    }

    // knowledge/decisions/realtime-sync.md, "Move previews".
    [Fact]
    public async Task A_preview_reaches_the_others_until_the_move()
    {
        var fight = await App.StartFightAsync();
        var player = fight.Table.Player;
        await using var playerDevice = await TableTestClient.JoinAsync(App, player, fight.EncounterId);
        await using var dmDevice = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        var result = await playerDevice.PreviewAsync(fight.Thorin, 5, 2);
        var moved = await playerDevice.MoveAsync(fight.Thorin, 5, 2);

        Assert.Equal(new HubResult(null), result);
        Assert.Equal(new MovePreviewEvent(fight.EncounterId, fight.Thorin, 5, 2, player.Id), await dmDevice.NextPreviewAsync());
        Assert.Equal(moved.Move, await dmDevice.NextMoveAsync());
        Assert.Equal(new MovePreviewClearedEvent(fight.EncounterId, fight.Thorin, player.Id), await dmDevice.NextPreviewAsync());

        // Nothing is saved, and the device that previews sees only its own move.
        Assert.Single(await HistoryAsync(fight.Thorin));
        Assert.Equal(moved.Move, await playerDevice.NextMoveAsync());
        Assert.False(playerDevice.HasPendingPreview);
    }

    [Fact]
    public async Task Previews_follow_the_rules_of_moves()
    {
        var fight = await App.StartFightAsync();
        await using var player = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        HubResult[] rejected =
        [
            await player.PreviewAsync(fight.Aria, 1, 0),
            await player.PreviewAsync(fight.Goblin, 5, 2),
            await player.PreviewAsync(fight.Thorin, 7, 0),
            await player.PreviewAsync(Guid.NewGuid(), 1, 0),
        ];
        await player.PreviewAsync(fight.Thorin, 1, 0);

        Assert.Equal(
            [ApiErrorCode.NotYourToken, ApiErrorCode.NotYourToken, ApiErrorCode.TargetInvalid, ApiErrorCode.TokenNotFound],
            rejected.Select(r => r.Error));
        // Rejected previews send nothing: the first message is the good one.
        Assert.Equal(new MovePreviewEvent(fight.EncounterId, fight.Thorin, 1, 0, fight.Table.Player.Id), await dm.NextPreviewAsync());
    }

    [Fact]
    public async Task A_preview_goes_when_let_go_of_or_its_device_leaves()
    {
        var fight = await App.StartFightAsync();
        var dm = fight.Table.Dm;
        await using var dmDevice = await TableTestClient.JoinAsync(App, dm, fight.EncounterId);
        var playerDevice = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);

        await dmDevice.PreviewAsync(fight.Goblin, 5, 2);
        await dmDevice.PreviewAsync(fight.Goblin, 5, 3);
        await dmDevice.PreviewAsync(fight.Ogre, 5, 0);
        await dmDevice.ClearPreviewAsync();
        await dmDevice.ClearPreviewAsync();

        // A new target for the same token replaces the preview; another token clears the old one first.
        object[] expected =
        [
            new MovePreviewEvent(fight.EncounterId, fight.Goblin, 5, 2, dm.Id),
            new MovePreviewEvent(fight.EncounterId, fight.Goblin, 5, 3, dm.Id),
            new MovePreviewClearedEvent(fight.EncounterId, fight.Goblin, dm.Id),
            new MovePreviewEvent(fight.EncounterId, fight.Ogre, 5, 0, dm.Id),
            new MovePreviewClearedEvent(fight.EncounterId, fight.Ogre, dm.Id),
        ];
        foreach (var message in expected)
        {
            Assert.Equal(message, await playerDevice.NextPreviewAsync());
        }

        await playerDevice.PreviewAsync(fight.Thorin, 1, 0);
        await playerDevice.DisposeAsync();

        Assert.Equal(new MovePreviewEvent(fight.EncounterId, fight.Thorin, 1, 0, fight.Table.Player.Id), await dmDevice.NextPreviewAsync());
        Assert.Equal(new MovePreviewClearedEvent(fight.EncounterId, fight.Thorin, fight.Table.Player.Id), await dmDevice.NextPreviewAsync());
        Assert.False(dmDevice.HasPendingPreview);
    }

    [Fact]
    public async Task A_device_that_joins_sees_the_previews_already_shown()
    {
        var fight = await App.StartFightAsync();
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await dm.PreviewAsync(fight.Goblin, 5, 2);

        await using var player = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);

        Assert.Equal(new MovePreviewEvent(fight.EncounterId, fight.Goblin, 5, 2, fight.Table.Dm.Id), await player.NextPreviewAsync());
    }

    // Two devices moving one token at once: each save needs the version it read, so the
    // moves form one chain and the last one saved wins.
    [Fact]
    public async Task Concurrent_moves_of_one_token_never_interleave()
    {
        const int movesEach = 10;
        var fight = await App.StartFightAsync();
        await using var player = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        (int X, int Y)[] cells = [(1, 0), (2, 0), (1, 1), (2, 1), (0, 1), (2, 2)];

        async Task<List<MoveResult>> MoveManyAsync(TableTestClient device, int offset)
        {
            var results = new List<MoveResult>();
            for (var i = 0; i < movesEach; i++)
            {
                var (x, y) = cells[(i + offset) % cells.Length];
                results.Add(await device.MoveAsync(fight.Thorin, x, y));
            }

            return results;
        }

        var results = await Task.WhenAll(MoveManyAsync(player, 0), MoveManyAsync(dm, 3));

        Assert.All(results.SelectMany(r => r), r => Assert.Null(r.Error));
        var history = await HistoryAsync(fight.Thorin);
        Assert.Equal(Enumerable.Range(1, 2 * movesEach), history.Select(m => m.Version));
        Assert.Equal((0, 0, 0m), (history[0].FromX, history[0].FromY, history[0].FromElevation));
        for (var i = 1; i < history.Count; i++)
        {
            Assert.Equal(
                (history[i - 1].ToX, history[i - 1].ToY, history[i - 1].ToElevation),
                (history[i].FromX, history[i].FromY, history[i].FromElevation));
        }

        var token = await TokenAsync(fight.Table.Player, fight, fight.Thorin);
        var last = history[^1];
        Assert.Equal((last.ToX, last.ToY, last.ToElevation, 2 * movesEach), (token.X, token.Y, token.Elevation, token.Version));
    }

    private static (int X, int Y, decimal Elevation) Position(MoveResult result)
    {
        Assert.Null(result.Error);
        return (result.Move!.X, result.Move.Y, result.Move.Elevation);
    }

    private static async Task HandSessionToAsync(RunningFight fight, Person newDm)
    {
        var response = await fight.Table.Dm.Client.PutAsJsonAsync(
            $"/api/campaigns/{fight.CampaignId}/sessions/{fight.Table.Session.Id}/dm", new ChangeSessionDmRequest(newDm.Id), Json);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    private static async Task<BoardStateResponse> BoardAsync(Person person, RunningFight fight) =>
        await (await person.GetBoardAsync(fight.CampaignId, fight.EncounterId)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);

    private static async Task<BoardToken> TokenAsync(Person person, RunningFight fight, Guid tokenId) =>
        (await BoardAsync(person, fight)).Tokens.Single(t => t.Id == tokenId);

    private async Task<List<TokenMove>> HistoryAsync(Guid tokenId)
    {
        await using var scope = App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.TokenMoves.Where(m => m.TokenId == tokenId).OrderBy(m => m.Id).ToListAsync();
    }
}
