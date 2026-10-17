using System.Net;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Table;
using OreanasOffice.Server.Tests.Images;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.StatusTestApi;

namespace OreanasOffice.Server.Tests;

// Taking tokens off the board and bringing them back (knowledge/features/removing-tokens.md).
// The fight is EncounterTables.StartFightAsync: Oreana runs it.
public sealed class TableRemovalTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private AppFactory App => fixture.App;

    [Fact]
    public async Task The_session_DM_takes_a_token_off_the_board_for_everyone()
    {
        var fight = await App.StartFightAsync();
        var (dm, player) = (fight.Table.Dm, fight.Table.Player);
        await using var dmDevice = await TableTestClient.JoinAsync(App, dm, fight.EncounterId);
        await using var playerDevice = await TableTestClient.JoinAsync(App, player, fight.EncounterId);

        var result = await dmDevice.RemoveTokenAsync(fight.Goblin);

        Assert.Equal(new HubResult(null), result);
        var removed = Assert.IsType<TokenRemovedEvent>(await dmDevice.NextRemovalAsync());
        Assert.Equal((fight.EncounterId, fight.Goblin, dm.Id), (removed.EncounterId, removed.TokenId, removed.ByUserId));
        Assert.InRange(removed.RemovedAt, DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddMinutes(1));
        Assert.Equal(removed, await playerDevice.NextRemovalAsync());

        // Kept, not deleted: the session DM's board lists it apart, everyone else's leaves it out.
        var token = await App.InDbAsync(db => db.Tokens.AsNoTracking().SingleAsync(t => t.Id == fight.Goblin));
        Assert.Equal((removed.RemovedAt, (Guid?)dm.Id, 1), (token.RemovedAt!.Value, token.RemovedByUserId, token.Version));
        var dmBoard = await dm.BoardAsync(fight);
        Assert.DoesNotContain(dmBoard.Tokens, t => t.Id == fight.Goblin);
        var listed = Assert.Single(dmBoard.RemovedTokens);
        Assert.Equal((fight.Goblin, "Goblin 1", 5, 1, (DateTimeOffset?)removed.RemovedAt), (listed.Id, listed.Label, listed.X, listed.Y, listed.RemovedAt));
        Assert.All(dmBoard.Tokens, t => Assert.Null(t.RemovedAt));
        foreach (var person in new[] { player, fight.Table.SecondDm })
        {
            var board = await person.BoardAsync(fight);
            Assert.DoesNotContain(board.Tokens, t => t.Id == fight.Goblin);
            Assert.Empty(board.RemovedTokens);
        }
    }

    [Fact]
    public async Task Only_the_session_DM_removes_and_restores_tokens()
    {
        var fight = await App.StartFightAsync();
        var stranger = await App.CreatePersonAsync("Fremder");
        await using var strangerDevice = await TableTestClient.ConnectAsync(App, stranger);
        await using var player = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var secondDm = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        HubResult[] refused =
        [
            await player.RemoveTokenAsync(fight.Thorin),
            await player.RemoveTokenAsync(fight.Goblin),
            await secondDm.RemoveTokenAsync(fight.Aria),
        ];
        var strangers = await strangerDevice.RemoveTokenAsync(fight.Goblin);
        var notRemoved = await dm.RestoreTokenAsync(fight.Goblin);
        await dm.RemoveTokenAsync(fight.Goblin);
        var twice = await dm.RemoveTokenAsync(fight.Goblin);
        var playerRestores = await player.RestoreTokenAsync(fight.Goblin);
        var strangerRestores = await strangerDevice.RestoreTokenAsync(fight.Goblin);

        Assert.All(refused, r => Assert.Equal(ApiErrorCode.NotSessionDm, r.Error));
        Assert.Equal(ApiErrorCode.TokenNotFound, strangers.Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, notRemoved.Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, twice.Error);
        Assert.Equal(ApiErrorCode.NotSessionDm, playerRestores.Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, strangerRestores.Error);

        // Nothing was broadcast for the refused calls: the first message is the removal.
        Assert.Equal(fight.Goblin, Assert.IsType<TokenRemovedEvent>(await player.NextRemovalAsync()).TokenId);
        Assert.Single((await fight.Table.Dm.BoardAsync(fight)).RemovedTokens);
    }

    [Fact]
    public async Task A_restored_token_comes_back_on_its_cell_with_its_statuses()
    {
        var fight = await App.StartFightAsync();
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await using var player = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await dm.MoveAsync(fight.Goblin, 5, 3);
        await player.AddStatusAsync(fight.Goblin, Prone);
        await dm.AddStatusAsync(fight.Goblin, Exhaustion, 2);
        await dm.RemoveTokenAsync(fight.Goblin);
        await dm.RemoveTokenAsync(fight.Ogre);

        // Newest first; statuses travel with removed tokens, and so do their definitions.
        var whileRemoved = await fight.Table.Dm.BoardAsync(fight);
        Assert.Equal([fight.Ogre, fight.Goblin], whileRemoved.RemovedTokens.Select(t => t.Id));
        Assert.Equal([Prone, Exhaustion], whileRemoved.RemovedTokens[1].Statuses.Select(s => s.StatusId));
        Assert.Equal([Exhaustion, Prone], whileRemoved.Statuses.Select(s => s.Id));
        Assert.Empty((await fight.Table.Player.BoardAsync(fight)).Statuses);

        var result = await dm.RestoreTokenAsync(fight.Goblin);

        Assert.Equal(new HubResult(null), result);
        Assert.IsType<TokenRemovedEvent>(await player.NextRemovalAsync());
        Assert.IsType<TokenRemovedEvent>(await player.NextRemovalAsync());
        var restored = Assert.IsType<TokenRestoredEvent>(await player.NextRemovalAsync());
        Assert.Equal(fight.EncounterId, restored.EncounterId);
        var token = restored.Token;
        Assert.Equal((fight.Goblin, "Goblin 1", 5, 3, 1m, (DateTimeOffset?)null), (token.Id, token.Label, token.X, token.Y, token.Elevation, token.RemovedAt));
        Assert.Equal([Prone, Exhaustion], token.Statuses.Select(s => s.StatusId));
        Assert.Equal([Exhaustion, Prone], restored.Definitions.Select(s => s.Id));
        var dmRestored = await RestoredAsync(dm);
        Assert.Equal(token.Statuses, dmRestored.Token.Statuses);
        Assert.Equal(token, dmRestored.Token with { Statuses = token.Statuses });

        var board = await fight.Table.Player.BoardAsync(fight);
        var back = board.Tokens.Single(t => t.Id == fight.Goblin);
        Assert.Equal(token.Statuses, back.Statuses);
        Assert.Equal(token.Version, back.Version);
        Assert.Equal([fight.Ogre], (await fight.Table.Dm.BoardAsync(fight)).RemovedTokens.Select(t => t.Id));

        // It's on the board again: it moves.
        Assert.Null((await dm.MoveAsync(fight.Goblin, 5, 2)).Error);
    }

    // knowledge/features/removing-tokens.md: "A move preview of the token disappears, and a
    // player's undo of their last move of a removed character is gone."
    [Fact]
    public async Task A_removed_token_is_off_the_table_for_moves_previews_undo_statuses_and_pings()
    {
        var fight = await App.StartFightAsync();
        var player = fight.Table.Player;
        await using var playerDevice = await TableTestClient.JoinAsync(App, player, fight.EncounterId);
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await playerDevice.MoveAsync(fight.Thorin, 1, 0);
        Assert.NotNull((await player.BoardAsync(fight)).UndoableMove);

        await dm.RemoveTokenAsync(fight.Thorin);

        Assert.Equal(ApiErrorCode.TokenNotFound, (await playerDevice.MoveAsync(fight.Thorin, 2, 0)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await dm.MoveAsync(fight.Thorin, 2, 0)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await playerDevice.PreviewAsync(fight.Thorin, 2, 0)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await playerDevice.AddStatusAsync(fight.Thorin, Prone)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await dm.AddStatusAsync(fight.Thorin, Prone)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await playerDevice.PingAsync(new PingRequest(fight.EncounterId, null, fight.Thorin))).Error);
        Assert.Equal(ApiErrorCode.NothingToUndo, (await playerDevice.UndoAsync(fight.EncounterId)).Error);
        Assert.Null((await player.BoardAsync(fight)).UndoableMove);

        // The undo stays gone after the token is back.
        await dm.RestoreTokenAsync(fight.Thorin);
        Assert.Null((await player.BoardAsync(fight)).UndoableMove);
        Assert.Equal(ApiErrorCode.NothingToUndo, (await playerDevice.UndoAsync(fight.EncounterId)).Error);
        Assert.Null((await playerDevice.MoveAsync(fight.Thorin, 2, 0)).Error);
    }

    [Fact]
    public async Task Removing_takes_back_the_tokens_move_previews()
    {
        var fight = await App.StartFightAsync();
        var player = fight.Table.Player;
        await using var playerDevice = await TableTestClient.JoinAsync(App, player, fight.EncounterId);
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await using var watcher = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        await playerDevice.PreviewAsync(fight.Thorin, 1, 0);
        Assert.IsType<MovePreviewEvent>(await dm.NextPreviewAsync());
        Assert.IsType<MovePreviewEvent>(await watcher.NextPreviewAsync());

        await dm.RemoveTokenAsync(fight.Thorin);

        var cleared = new MovePreviewClearedEvent(fight.EncounterId, fight.Thorin, player.Id);
        Assert.Equal(cleared, await dm.NextPreviewAsync());
        Assert.Equal(cleared, await watcher.NextPreviewAsync());
        Assert.IsType<TokenRemovedEvent>(await watcher.NextRemovalAsync());

        // The previewing device hears the removal, not its own preview going; a device that
        // joins now sees no preview of the token.
        await dm.PreviewAsync(fight.Goblin, 5, 2);
        Assert.IsType<TokenRemovedEvent>(await playerDevice.NextRemovalAsync());
        Assert.Equal(new MovePreviewEvent(fight.EncounterId, fight.Goblin, 5, 2, fight.Table.Dm.Id), await playerDevice.NextPreviewAsync());
        await using var late = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        Assert.Equal(new MovePreviewEvent(fight.EncounterId, fight.Goblin, 5, 2, fight.Table.Dm.Id), await late.NextPreviewAsync());
        Assert.False(late.HasPendingPreview);
    }

    // knowledge/features/removing-tokens.md: removed tokens stay removed when the fight ends,
    // and when an interrupted fight is continued; statuses stay with the tokens.
    [Fact]
    public async Task Removed_tokens_and_statuses_survive_an_interrupted_fight()
    {
        var fight = await App.StartFightAsync();
        var table = fight.Table;
        await using (var dm = await TableTestClient.JoinAsync(App, table.Dm, fight.EncounterId))
        {
            await dm.RemoveTokenAsync(fight.Goblin);
            await dm.AddStatusAsync(fight.Ogre, Prone);
        }

        var ended = await table.Dm.Client.PostAsync($"/api/campaigns/{fight.CampaignId}/sessions/{table.Session.Id}/end", null);
        Assert.Equal(HttpStatusCode.OK, ended.StatusCode);
        var endedBoard = await table.Dm.BoardAsync(fight);
        await table.Dm.ActivateSessionAsync(fight.CampaignId, table.Session.Id);
        var board = await table.Dm.BoardAsync(fight);

        Assert.Equal(EncounterStatus.Ended, endedBoard.Status);
        Assert.DoesNotContain(endedBoard.Tokens, t => t.Id == fight.Goblin);
        Assert.Empty(endedBoard.RemovedTokens);
        Assert.Equal(EncounterStatus.Active, board.Status);
        Assert.DoesNotContain(board.Tokens, t => t.Id == fight.Goblin);
        Assert.Equal([fight.Goblin], board.RemovedTokens.Select(t => t.Id));
        Assert.Equal([Prone], board.Tokens.Single(t => t.Id == fight.Ogre).Statuses.Select(s => s.StatusId));
    }

    // The device's next TokenRestored, past any TokenRemoved.
    private static async Task<TokenRestoredEvent> RestoredAsync(TableTestClient device)
    {
        while (true)
        {
            if (await device.NextRemovalAsync() is TokenRestoredEvent restored)
            {
                return restored;
            }
        }
    }
}
