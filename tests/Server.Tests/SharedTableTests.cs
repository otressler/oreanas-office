using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SharedTableTestApi;
using static OreanasOffice.Server.Tests.StatusTestApi;

namespace OreanasOffice.Server.Tests;

// Local mode (knowledge/features/shared-table.md): a shared screen opened by a member moves
// every character but no creature, points in white as "Tisch", puts statuses on and keeps
// its own undo apart from the same account's phone. The fight is EncounterTables.StartFightAsync:
// Oreana runs it, Brom plays Thorin, Yara plays Aria; Brom's tablet is the shared screen.
public sealed class SharedTableTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private AppFactory App => fixture.App;

    [Fact]
    public async Task A_shared_screen_moves_every_character_but_no_creature_and_marks_the_moves()
    {
        var fight = await App.StartFightAsync();
        await fight.LocalModeAsync();
        await using var oreana = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await using var tablet = await App.JoinSharedScreenAsync(fight.Table.Player, fight.EncounterId);

        var thorin = await tablet.MoveAsync(fight.Thorin, 1, 0);
        var aria = await tablet.MoveAsync(fight.Aria, 1, 2);
        MoveResult[] refused = [await tablet.MoveAsync(fight.Goblin, 5, 2), await tablet.MoveAsync(fight.Ogre, 1, 3)];

        Assert.Null(thorin.Error);
        Assert.Null(aria.Error);
        Assert.All(refused, r => Assert.Equal(new MoveResult(ApiErrorCode.NotYourToken, null), r));
        Assert.Equal(thorin.Move, await oreana.NextMoveAsync());
        Assert.Equal(aria.Move, await oreana.NextMoveAsync());

        await using var scope = App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var moves = await db.TokenMoves.Where(m => m.EncounterId == fight.EncounterId).ToListAsync();
        Assert.Equal(2, moves.Count);
        Assert.All(moves, m => Assert.True(m.FromSharedScreen));
        Assert.All(moves, m => Assert.Equal(fight.Table.Player.Id, m.ByUserId));
    }

    [Fact]
    public async Task A_player_connection_keeps_its_rules_in_local_mode_and_its_moves_are_not_marked()
    {
        var fight = await App.StartFightAsync();
        await fight.LocalModeAsync();
        await using var phone = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);

        var own = await phone.MoveAsync(fight.Thorin, 1, 0);
        var other = await phone.MoveAsync(fight.Aria, 1, 2);

        Assert.Null(own.Error);
        Assert.Equal(ApiErrorCode.NotYourToken, other.Error);
        await using var scope = App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        Assert.False((await db.TokenMoves.SingleAsync(m => m.EncounterId == fight.EncounterId)).FromSharedScreen);
    }

    [Fact]
    public async Task A_shared_screen_previews_characters_but_not_creatures()
    {
        var fight = await App.StartFightAsync();
        await fight.LocalModeAsync();
        await using var oreana = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await using var tablet = await App.JoinSharedScreenAsync(fight.Table.Player, fight.EncounterId);

        Assert.Null((await tablet.PreviewAsync(fight.Aria, 2, 2)).Error);
        Assert.Equal(ApiErrorCode.NotYourToken, (await tablet.PreviewAsync(fight.Goblin, 5, 2)).Error);

        var preview = Assert.IsType<MovePreviewEvent>(await oreana.NextPreviewAsync());
        Assert.Equal((fight.Aria, 2, 2), (preview.TokenId, preview.X, preview.Y));
        // The rejected preview takes the shown one back.
        Assert.IsType<MovePreviewClearedEvent>(await oreana.NextPreviewAsync());
    }

    [Fact]
    public async Task The_phones_undo_and_the_tablets_undo_are_independent_for_the_same_account()
    {
        var fight = await App.StartFightAsync();
        await fight.LocalModeAsync();
        var brom = fight.Table.Player;
        await using var phone = await TableTestClient.JoinAsync(App, brom, fight.EncounterId);
        await using var tablet = await App.JoinSharedScreenAsync(brom, fight.EncounterId);

        // The tablet's move alone: the phone has nothing of its own to undo.
        var tabletMove = await tablet.MoveAsync(fight.Aria, 1, 2);
        Assert.Equal(ApiErrorCode.NothingToUndo, (await phone.UndoAsync(fight.EncounterId)).Error);
        var tabletBoard = await brom.SharedScreenBoardAsync(fight);
        Assert.Equal(new UndoableMove(fight.Aria, tabletMove.Move!.Version), tabletBoard.UndoableMove);
        Assert.Null((await brom.BoardAsync(fight)).UndoableMove);

        var phoneMove = await phone.MoveAsync(fight.Thorin, 1, 0);
        Assert.Equal(new UndoableMove(fight.Thorin, phoneMove.Move!.Version), (await brom.BoardAsync(fight)).UndoableMove);
        Assert.Equal(fight.Aria, (await brom.SharedScreenBoardAsync(fight)).UndoableMove!.TokenId);

        // Each undoes its own.
        var phoneUndo = await phone.UndoAsync(fight.EncounterId);
        Assert.Equal((fight.Thorin, 0, 0, true), (phoneUndo.Move!.TokenId, phoneUndo.Move.X, phoneUndo.Move.Y, phoneUndo.Move.Undo));
        var tabletUndo = await tablet.UndoAsync(fight.EncounterId);
        Assert.Equal((fight.Aria, 0, 2, true), (tabletUndo.Move!.TokenId, tabletUndo.Move.X, tabletUndo.Move.Y, tabletUndo.Move.Undo));
        Assert.Equal(ApiErrorCode.NothingToUndo, (await tablet.UndoAsync(fight.EncounterId)).Error);
    }

    [Fact]
    public async Task A_shared_screen_undoes_a_move_only_while_it_is_still_the_tokens_latest()
    {
        var fight = await App.StartFightAsync();
        await fight.LocalModeAsync();
        await using var tablet = await App.JoinSharedScreenAsync(fight.Table.Player, fight.EncounterId);
        await using var yara = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);

        await tablet.MoveAsync(fight.Aria, 1, 2);
        await yara.MoveAsync(fight.Aria, 2, 2);

        Assert.Equal(ApiErrorCode.NothingToUndo, (await tablet.UndoAsync(fight.EncounterId)).Error);
    }

    [Fact]
    public async Task A_shared_screen_pings_and_draws_in_white_as_the_table()
    {
        var fight = await App.StartFightAsync();
        await fight.LocalModeAsync();
        await using var oreana = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await using var tablet = await App.JoinSharedScreenAsync(fight.Table.Player, fight.EncounterId);

        Assert.Null((await tablet.PingCellAsync(fight.EncounterId, 2, 2)).Error);
        Assert.Null((await tablet.ArrowAsync(new DrawArrowRequest(fight.EncounterId, null, fight.Thorin, new BoardCell(3, 3)))).Error);

        Assert.Equal(
            new PingedEvent(fight.EncounterId, fight.Table.Player.Id, "#ffffff", new BoardCell(2, 2), null, true),
            await oreana.NextPingAsync());
        Assert.Equal(
            new ArrowDrawnEvent(fight.EncounterId, fight.Table.Player.Id, "#ffffff", null, fight.Thorin, new BoardCell(3, 3), true),
            await oreana.NextArrowAsync());
    }

    [Fact]
    public async Task A_shared_screen_puts_statuses_on_everything_and_removes_only_its_own()
    {
        var fight = await App.StartFightAsync();
        await fight.LocalModeAsync();
        await using var oreana = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await using var yara = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        await using var tablet = await App.JoinSharedScreenAsync(fight.Table.Player, fight.EncounterId);

        var onAria = await tablet.AddStatusAsync(fight.Aria, Prone);
        var onGoblin = await tablet.AddStatusAsync(fight.Goblin, Prone);
        await yara.AddStatusAsync(fight.Aria, Poisoned);
        await oreana.AddStatusAsync(fight.Goblin, Poisoned);

        Assert.Null(onAria.Error);
        Assert.Null(onGoblin.Error);
        Assert.True(onAria.Change!.Statuses.Single().FromSharedScreen);

        // The marks reach the board.
        var board = await fight.Table.Player.BoardAsync(fight);
        var aria = board.Tokens.Single(t => t.Id == fight.Aria).Statuses;
        Assert.Equal(
            [(Prone, true), (Poisoned, false)],
            aria.OrderBy(s => s.AppliedAt).Select(s => (s.StatusId, s.FromSharedScreen)));

        Assert.Equal(ApiErrorCode.NotYourStatus, (await tablet.RemoveStatusAsync(fight.Aria, Poisoned)).Error);
        Assert.Equal(ApiErrorCode.NotYourStatus, (await tablet.RemoveStatusAsync(fight.Goblin, Poisoned)).Error);
        Assert.Null((await tablet.RemoveStatusAsync(fight.Aria, Prone)).Error);
        Assert.Null((await tablet.RemoveStatusAsync(fight.Goblin, Prone)).Error);
    }

    [Fact]
    public async Task The_session_DM_signed_in_on_a_shared_screen_acts_as_a_shared_screen()
    {
        var fight = await App.StartFightAsync();
        await fight.LocalModeAsync();
        var oreana = fight.Table.Dm;
        await using var phone = await TableTestClient.JoinAsync(App, oreana, fight.EncounterId);
        await using var tablet = await App.JoinSharedScreenAsync(oreana, fight.EncounterId);
        await phone.AddStatusAsync(fight.Aria, Poisoned);

        Assert.Equal(ApiErrorCode.NotYourToken, (await tablet.MoveAsync(fight.Goblin, 5, 2)).Error);
        Assert.Equal(ApiErrorCode.NotYourStatus, (await tablet.RemoveStatusAsync(fight.Aria, Poisoned)).Error);
        Assert.Equal(ApiErrorCode.NotSessionDm, (await tablet.RemoveTokenAsync(fight.Goblin)).Error);
        Assert.Equal(ApiErrorCode.NotSessionDm, (await tablet.RestoreTokenAsync(fight.Goblin)).Error);
        Assert.Null((await phone.RemoveStatusAsync(fight.Aria, Poisoned)).Error);
    }

    [Fact]
    public async Task A_shared_screen_outside_local_mode_only_watches()
    {
        var fight = await App.StartFightAsync();
        await using var tablet = await App.JoinSharedScreenAsync(fight.Table.Player, fight.EncounterId);
        await using var phone = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        var arrow = new DrawArrowRequest(fight.EncounterId, null, fight.Thorin, new BoardCell(3, 3));

        async Task AssertWatchesOnly()
        {
            ApiErrorCode?[] errors =
            [
                (await tablet.MoveAsync(fight.Thorin, 1, 0)).Error,
                (await tablet.PreviewAsync(fight.Thorin, 1, 0)).Error,
                (await tablet.UndoAsync(fight.EncounterId)).Error,
                (await tablet.PingCellAsync(fight.EncounterId, 1, 1)).Error,
                (await tablet.ArrowAsync(arrow)).Error,
                (await tablet.AddStatusAsync(fight.Thorin, Prone)).Error,
            ];
            Assert.All(errors, error => Assert.Equal(ApiErrorCode.ReadOnlyConnection, error));
        }

        await AssertWatchesOnly();

        // Switching on, then back, ends it at the next call.
        await fight.LocalModeAsync();
        Assert.Null((await tablet.MoveAsync(fight.Thorin, 1, 0)).Error);
        await fight.LocalModeAsync(PlayMode.Byod);
        await AssertWatchesOnly();

        // The account's phone is unaffected.
        Assert.Null((await phone.MoveAsync(fight.Thorin, 2, 0)).Error);
    }

    [Fact]
    public async Task Only_the_session_DM_sets_the_play_mode_and_every_screen_of_the_session_hears_it()
    {
        var fight = await App.StartFightAsync();
        var (campaignId, sessionId) = (fight.CampaignId, fight.Table.Session.Id);
        await using var screen = await TableTestClient.ConnectAsync(App, fight.Table.Player);
        var listener = new Listener(screen);
        await App.JoinSessionGroupAsync(screen, sessionId);

        Assert.Equal(HttpStatusCode.Forbidden, (await fight.Table.Player.SetPlayModeAsync(campaignId, sessionId, PlayMode.Local)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await fight.Table.SecondDm.SetPlayModeAsync(campaignId, sessionId, PlayMode.Local)).StatusCode);

        var changed = await fight.Table.Dm.SetPlayModeAsync(campaignId, sessionId, PlayMode.Local);

        Assert.Equal(PlayMode.Local, (await changed.ReadAsync<SessionResponse>(HttpStatusCode.OK)).PlayMode);
        Assert.Equal(new PlayModeChangedEvent(sessionId, PlayMode.Local), await listener.NextPlayModeAsync());
        Assert.Equal(PlayMode.Local, (await fight.Table.Player.BoardAsync(fight)).PlayMode);
    }
}
