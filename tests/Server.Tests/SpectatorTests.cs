using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.Images.ImageTestApi;
using static OreanasOffice.Server.Tests.Images.TokenImageTestApi;

namespace OreanasOffice.Server.Tests;

// The spectator lane (knowledge/features/spectator-view.md): WatchSession and who may call
// it, the session group's messages, the join lookup and spectate endpoints, and what a
// session spectator can and cannot read.
public sealed class SpectatorTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private AppFactory App => fixture.App;

    // --- WatchSession ---

    [Fact]
    public async Task A_member_watches_and_learns_the_sessions_state()
    {
        var fight = await App.StartFightAsync();
        await using var screen = await TableTestClient.ConnectAsync(App, fight.Table.Player);

        var result = await screen.WatchAsync(fight.Table.Session.Id);

        Assert.Null(result.Error);
        Assert.Equal(ConnectionMode.Spectator, result.Mode);
        var session = result.Session!;
        Assert.Equal(
            (fight.Table.Session.Id, fight.CampaignId, SessionStatus.Active, PlayMode.Byod, (Guid?)fight.EncounterId),
            (session.SessionId, session.CampaignId, session.Status, session.PlayMode, session.ActiveEncounterId));
        Assert.Equal(fight.Table.Session.Title, session.Title);
        Assert.Equal(["Thorin", "Aria"], session.Characters.Select(c => c.Name));
        Assert.Equal([0, 1], session.Characters.Select(c => c.ColorIndex));
        Assert.All(session.Characters, c => Assert.Matches("^#[0-9a-f]{6}$", c.Color!));
    }

    [Fact]
    public async Task A_stranger_cannot_watch_until_they_join_the_session_as_a_spectator()
    {
        var table = await App.CreateEncounterTableAsync();
        var stranger = await App.CreatePersonAsync("Fremder");
        await using var screen = await TableTestClient.ConnectAsync(App, stranger);

        Assert.Equal(ApiErrorCode.TokenNotFound, (await screen.WatchAsync(table.Session.Id)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await screen.WatchAsync(Guid.NewGuid())).Error);

        await (await stranger.JoinAsSpectatorAsync(await table.Dm.JoinCodeOfAsync(table.CampaignId), table.Session.Id))
            .ReadAsync<SpectateSessionResponse>(HttpStatusCode.OK);
        var result = await screen.WatchAsync(table.Session.Id);

        Assert.Null(result.Error);
        Assert.Equal(ConnectionMode.Spectator, result.Mode);
    }

    [Fact]
    public async Task A_shared_screen_needs_a_member_and_local_mode()
    {
        var table = await App.CreateEncounterTableAsync();
        var spectator = await App.NewSpectatorAsync(table);
        await using var memberScreen = await TableTestClient.ConnectAsync(App, table.Player);
        await using var spectatorScreen = await TableTestClient.ConnectAsync(App, spectator);

        Assert.Equal(ApiErrorCode.NotLocalMode, (await memberScreen.WatchAsync(table.Session.Id, sharedScreen: true)).Error);
        await table.Dm.SetPlayModeOkAsync(table.CampaignId, table.Session.Id, PlayMode.Local);

        var shared = await memberScreen.WatchAsync(table.Session.Id, sharedScreen: true);
        var refused = await spectatorScreen.WatchAsync(table.Session.Id, sharedScreen: true);
        var spectating = await spectatorScreen.WatchAsync(table.Session.Id);

        Assert.Equal((null, ConnectionMode.SharedScreen, PlayMode.Local), (shared.Error, shared.Mode, shared.Session!.PlayMode));
        Assert.Equal(ApiErrorCode.TokenNotFound, refused.Error);
        Assert.Null(spectating.Error);
    }

    [Fact]
    public async Task A_stranger_cannot_open_a_shared_screen_in_local_mode()
    {
        var table = await App.CreateEncounterTableAsync();
        await table.Dm.SetPlayModeOkAsync(table.CampaignId, table.Session.Id, PlayMode.Local);
        await using var screen = await TableTestClient.ConnectAsync(App, await App.CreatePersonAsync("Fremder"));

        Assert.Equal(ApiErrorCode.TokenNotFound, (await screen.WatchAsync(table.Session.Id, sharedScreen: true)).Error);
    }

    [Fact]
    public async Task The_session_group_hears_the_fight_start_and_end_and_the_session_end()
    {
        var table = await App.CreateEncounterTableAsync();
        var spectator = await App.NewSpectatorAsync(table);
        await using var screen = await TableTestClient.ConnectAsync(App, spectator);
        var messages = screen.ListenToSession();
        var waiting = await screen.WatchAsync(table.Session.Id);
        Assert.Null(waiting.Session!.ActiveEncounterId);

        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");
        Assert.Equal(
            HttpStatusCode.OK,
            (await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id, new CharacterPlacement(thorin.Id, 0, 0))).StatusCode);
        Assert.Equal(new EncounterStartedEvent(table.Session.Id, table.Encounter.Id), await messages.EncounterStartedAsync());
        Assert.Null((await screen.JoinEncounterAsync(table.Encounter.Id)).Error);

        Assert.Equal(HttpStatusCode.OK, (await table.Dm.EndEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id)).StatusCode);
        Assert.Equal(table.Encounter.Id, await messages.EncounterEndedAsync());

        await table.Dm.EndSessionAsync(table.CampaignId, table.Session.Id);
        Assert.Equal(table.Session.Id, await messages.SessionEndedAsync());
    }

    [Fact]
    public async Task A_screen_hears_the_play_mode_change()
    {
        var table = await App.CreateEncounterTableAsync();
        await using var screen = await TableTestClient.ConnectAsync(App, table.Player);
        var messages = screen.ListenToSession();
        await screen.WatchAsync(table.Session.Id);

        await table.Dm.SetPlayModeOkAsync(table.CampaignId, table.Session.Id, PlayMode.Local);

        Assert.Equal(new PlayModeChangedEvent(table.Session.Id, PlayMode.Local), await messages.PlayModeChangedAsync());
    }

    // --- Spectator connections: players' group, read only ---

    [Fact]
    public async Task A_spectator_screen_of_the_session_DM_is_in_the_players_group_and_only_watches()
    {
        var fight = await App.StartFightAsync();
        await using var dmDevice = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await using var tablet = await TableTestClient.ConnectAsync(App, fight.Table.Dm);
        Assert.Null((await tablet.WatchAsync(fight.Table.Session.Id)).Error);
        Assert.Null((await tablet.JoinEncounterAsync(fight.EncounterId)).Error);

        var connections = App.Services.GetRequiredService<TableConnections>();
        Assert.False(connections.Find(tablet.Connection.ConnectionId!)!.InDmGroup);
        Assert.True(connections.Find(dmDevice.Connection.ConnectionId!)!.InDmGroup);

        // The DM's tablet is rejected where the DM's phone would succeed ...
        Assert.Equal(ApiErrorCode.ReadOnlyConnection, (await tablet.MoveAsync(fight.Goblin, 5, 2)).Error);
        Assert.Equal(ApiErrorCode.ReadOnlyConnection, (await tablet.PingCellAsync(fight.EncounterId, 1, 1)).Error);
        Assert.Equal(ApiErrorCode.ReadOnlyConnection, (await tablet.RemoveTokenAsync(fight.Goblin)).Error);

        // ... and still hears what the DM's phone does.
        var move = await dmDevice.MoveAsync(fight.Goblin, 5, 2);
        Assert.Equal(move.Move, await tablet.NextMoveAsync());
    }

    [Fact]
    public async Task A_member_spectator_cannot_move_their_own_character()
    {
        var fight = await App.StartFightAsync();
        await using var tablet = await TableTestClient.ConnectAsync(App, fight.Table.Player);
        await tablet.WatchAsync(fight.Table.Session.Id);
        await tablet.JoinEncounterAsync(fight.EncounterId);

        Assert.Equal(ApiErrorCode.ReadOnlyConnection, (await tablet.MoveAsync(fight.Thorin, 1, 0)).Error);
        Assert.Equal(ApiErrorCode.ReadOnlyConnection, (await tablet.UndoAsync(fight.EncounterId)).Error);
    }

    [Fact]
    public async Task A_session_spectator_joins_the_fight_but_not_a_fight_of_another_session()
    {
        var fight = await App.StartFightAsync();
        var spectator = await App.NewSpectatorAsync(fight.Table);
        var otherFight = await App.StartFightAsync();
        await using var tablet = await TableTestClient.ConnectAsync(App, spectator);
        await tablet.WatchAsync(fight.Table.Session.Id);

        Assert.Null((await tablet.JoinEncounterAsync(fight.EncounterId)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await tablet.JoinEncounterAsync(otherFight.EncounterId)).Error);
        Assert.Equal(ApiErrorCode.ReadOnlyConnection, (await tablet.MoveAsync(fight.Thorin, 1, 0)).Error);
    }

    // --- Join lookup and spectate endpoints ---

    [Fact]
    public async Task The_join_lookup_lists_planned_and_running_sessions_by_name_only()
    {
        var table = await App.CreateEncounterTableAsync();
        var planned = await table.Dm.CreateSessionAsync(table.CampaignId, "Der Aufbruch", new DateOnly(2026, 11, 1));
        var ended = await table.Dm.CreateSessionAsync(table.CampaignId, "Alt", new DateOnly(2026, 1, 1));
        await table.Dm.EndSessionAsync(table.CampaignId, ended.Id);
        var stranger = await App.CreatePersonAsync("Fremder");
        var code = await table.Dm.JoinCodeOfAsync(table.CampaignId);

        var lookup = await (await stranger.LookUpAsync(code.ToLowerInvariant())).ReadAsync<JoinLookupResponse>(HttpStatusCode.OK);

        Assert.Equal((table.CampaignId, "Die Gruft", false), (lookup.CampaignId, lookup.CampaignName, lookup.IsMember));
        Assert.Equal(
            [(table.Session.Id, SessionStatus.Active), (planned.Id, SessionStatus.Planned)],
            lookup.Sessions.Select(s => (s.Id, s.Status)));
        Assert.True((await (await table.Player.LookUpAsync(code)).ReadAsync<JoinLookupResponse>(HttpStatusCode.OK)).IsMember);

        // Looking up does not join.
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.Client.GetAsync($"/api/campaigns/{table.CampaignId}")).StatusCode);
        await (await stranger.LookUpAsync("ZZZZZZ")).AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.JoinCodeInvalid, "code");
        await (await stranger.LookUpAsync("abc")).AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.JoinCodeInvalid, "code");
    }

    [Fact]
    public async Task Joining_as_a_spectator_is_idempotent_and_limited_to_planned_and_running_sessions()
    {
        var table = await App.CreateEncounterTableAsync();
        var ended = await table.Dm.CreateSessionAsync(table.CampaignId, "Alt");
        await table.Dm.EndSessionAsync(table.CampaignId, ended.Id);
        var otherCampaign = await App.CreateEncounterTableAsync();
        var stranger = await App.CreatePersonAsync("Fremder");
        var code = await table.Dm.JoinCodeOfAsync(table.CampaignId);

        var first = await (await stranger.JoinAsSpectatorAsync(code, table.Session.Id)).ReadAsync<SpectateSessionResponse>(HttpStatusCode.OK);
        var second = await (await stranger.JoinAsSpectatorAsync(code, table.Session.Id)).ReadAsync<SpectateSessionResponse>(HttpStatusCode.OK);
        var member = await (await table.Player.JoinAsSpectatorAsync(code, table.Session.Id)).ReadAsync<SpectateSessionResponse>(HttpStatusCode.OK);

        Assert.Equal(new SpectateSessionResponse(table.CampaignId, table.Session.Id, false), first);
        Assert.Equal(first, second);
        Assert.True(member.IsMember);
        Assert.Equal(1, await App.InDbAsync(db => db.SessionSpectators.CountAsync(p => p.UserId == stranger.Id)));
        Assert.Equal(0, await App.InDbAsync(db => db.SessionSpectators.CountAsync(p => p.UserId == table.Player.Id)));
        await (await stranger.JoinAsSpectatorAsync(code, ended.Id)).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.SessionEnded);
        await (await stranger.JoinAsSpectatorAsync(code, otherCampaign.Session.Id)).AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.SessionInvalid, "sessionId");
        await (await stranger.JoinAsSpectatorAsync("ZZZZZZ", table.Session.Id)).AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.JoinCodeInvalid, "code");

        // Mitspielen still works for the spectator, and the entry stays harmless.
        var summary = await stranger.JoinAsync(code);
        Assert.Equal(CampaignRole.Player, summary.MyRole);
    }

    [Fact]
    public async Task A_session_spectator_reads_the_players_board_of_that_session_only()
    {
        var fight = await App.StartFightAsync();
        var spectator = await App.NewSpectatorAsync(fight.Table);
        var other = await App.StartFightAsync();

        var waiting = await (await spectator.GetSpectateAsync(fight.Table.Session.Id)).ReadAsync<WatchedSession>(HttpStatusCode.OK);
        var board = await (await spectator.GetSpectateBoardAsync(fight.Table.Session.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);

        Assert.Equal(fight.EncounterId, waiting.ActiveEncounterId);
        Assert.Equal((fight.EncounterId, BoardViewer.Player, false), (board.EncounterId, board.Viewer, board.IsSessionDm));
        Assert.Empty(board.RemovedTokens);
        Assert.Null(board.UndoableMove);

        // Nothing else opens up.
        Assert.Equal(HttpStatusCode.Forbidden, (await spectator.GetSpectateAsync(other.Table.Session.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await spectator.GetSpectateBoardAsync(other.Table.Session.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await spectator.GetBoardAsync(fight.CampaignId, fight.EncounterId)).StatusCode);
        foreach (var path in new[]
        {
            $"/api/campaigns/{fight.CampaignId}",
            $"/api/campaigns/{fight.CampaignId}/sessions",
            $"/api/campaigns/{fight.CampaignId}/sessions/{fight.Table.Session.Id}",
            $"/api/campaigns/{fight.CampaignId}/characters",
        })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await spectator.Client.GetAsync(path)).StatusCode);
        }

        var summaries = await spectator.Client.GetFromJsonAsync<List<CampaignSummaryResponse>>("/api/campaigns", Json);
        Assert.Empty(summaries!);
    }

    [Fact]
    public async Task The_spectator_board_is_the_players_board_even_for_the_session_DM()
    {
        var fight = await App.StartFightAsync();

        var asDm = await (await fight.Table.Dm.GetSpectateBoardAsync(fight.Table.Session.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
        var playersView = await (await fight.Table.Dm.Client.GetAsync(
            $"/api/campaigns/{fight.CampaignId}/encounters/{fight.EncounterId}/board?view=player")).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);

        Assert.Equal((BoardViewer.Player, false), (asDm.Viewer, asDm.IsSessionDm));
        Assert.Equal(playersView.Tokens.Select(t => t.Id), asDm.Tokens.Select(t => t.Id));
    }

    [Fact]
    public async Task Without_a_running_fight_the_spectator_board_is_not_found()
    {
        var table = await App.CreateEncounterTableAsync();
        var spectator = await App.NewSpectatorAsync(table);

        Assert.Equal(HttpStatusCode.NotFound, (await spectator.GetSpectateBoardAsync(table.Session.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await spectator.GetSpectateAsync(table.Session.Id)).StatusCode);
    }

    [Fact]
    public async Task The_join_code_is_shown_to_dm_members_only()
    {
        var table = await App.CreateEncounterTableAsync();

        Assert.NotNull((await table.Dm.GetCampaignAsync(table.CampaignId)).JoinCode);
        Assert.NotNull((await table.SecondDm.GetCampaignAsync(table.CampaignId)).JoinCode);
        Assert.Null((await table.Player.GetCampaignAsync(table.CampaignId)).JoinCode);
    }

    // --- Pictures ---

    [Fact]
    public async Task A_session_spectator_loads_the_picked_portraits_of_the_campaign_and_nothing_else()
    {
        var table = await App.CreateTokenTableAsync();
        var session = await table.Dm.CreateSessionAsync(table.CampaignId);
        var spectator = await App.CreatePersonAsync("Zuschauer");
        await spectator.JoinAsSpectatorAsync(await table.Dm.JoinCodeOfAsync(table.CampaignId), session.Id);
        var older = await table.Player.UploadOkAsync(table.CampaignId, table.CharacterId);
        var picked = await table.Player.UploadOkAsync(table.CampaignId, table.CharacterId);
        var stranger = await App.CreatePersonAsync("Fremder");

        Assert.Equal(HttpStatusCode.OK, (await spectator.GetAssetAsync(picked.Id)).StatusCode);
        // A version that is not the picked portrait is not drawn on any screen.
        Assert.Equal(HttpStatusCode.NotFound, (await spectator.GetAssetAsync(older.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await stranger.GetAssetAsync(picked.Id)).StatusCode);
    }
}
