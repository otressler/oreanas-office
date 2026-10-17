using Microsoft.Extensions.Options;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SharedTableTestApi;
using static OreanasOffice.Server.Tests.StatusTestApi;

namespace OreanasOffice.Server.Tests;

// Who is here (knowledge/features/shared-table.md): the row of avatars from the live
// connections, the 10-second grace and the table icon.
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class TablePresenceRulesTests
{
    private static readonly Guid Encounter = Guid.NewGuid();
    private static readonly Guid Dm = Guid.NewGuid();
    private static readonly Guid Brom = Guid.NewGuid();
    private static readonly Guid Yara = Guid.NewGuid();
    private static readonly Guid Kira = Guid.NewGuid();

    private readonly ManualTime _time = new();
    private readonly TableConnections _connections = new();

    private TablePresence Presence => new(_connections, null!, null!, _time, Options.Create(new TableOptions()));

    private void Connect(string id, Guid userId, ConnectionMode mode = ConnectionMode.Player)
    {
        var connection = _connections.Get(id);
        (connection.UserId, connection.Mode, connection.EncounterId) = (userId, mode, Encounter);
    }

    private PresenceState Snapshot(TablePresence presence) =>
        presence.Snapshot(Encounter, Dm, [Brom, Yara], [Dm, Brom, Yara, Kira]);

    [Fact]
    public void The_row_holds_the_session_DM_the_owners_and_everyone_else_connected_once()
    {
        var presence = Presence;
        Connect("dm", Dm);
        Connect("brom-phone", Brom);
        Connect("brom-laptop", Brom);
        Connect("kira", Kira);

        var state = Snapshot(presence);

        Assert.Equal(
            [new PresentPerson(Dm, true, true), new PresentPerson(Brom, true, false), new PresentPerson(Yara, false, false), new PresentPerson(Kira, true, false)],
            state.People);
        Assert.False(state.SharedScreen);
    }

    [Fact]
    public void A_member_who_is_not_connected_and_has_no_character_is_not_in_the_row()
    {
        var state = Snapshot(Presence);

        Assert.Equal([Dm, Brom, Yara], state.People.Select(p => p.UserId));
        Assert.All(state.People, p => Assert.False(p.Connected));
    }

    [Theory]
    [InlineData(ConnectionMode.Spectator)]
    [InlineData(ConnectionMode.SharedScreen)]
    public void A_screen_is_the_table_icon_and_never_the_person(ConnectionMode mode)
    {
        var presence = Presence;
        Connect("tablet", Brom, mode);

        var state = Snapshot(presence);

        Assert.True(state.SharedScreen);
        Assert.False(state.People.Single(p => p.UserId == Brom).Connected);
        Assert.DoesNotContain(state.People, p => p.UserId == Kira);
    }

    [Fact]
    public async Task A_person_who_left_stays_connected_for_ten_seconds()
    {
        var presence = Presence;
        Connect("phone", Brom);
        _connections.Remove("phone");

        await presence.DisconnectedAsync(Encounter, Brom, ConnectionMode.Player);

        _time.Advance(TimeSpan.FromSeconds(9));
        Assert.True(Snapshot(presence).People.Single(p => p.UserId == Brom).Connected);
        _time.Advance(TimeSpan.FromSeconds(1));
        Assert.False(Snapshot(presence).People.Single(p => p.UserId == Brom).Connected);
    }

    [Fact]
    public async Task Another_device_keeps_the_person_connected_after_the_grace()
    {
        var presence = Presence;
        Connect("phone", Brom);
        Connect("laptop", Brom);
        _connections.Remove("phone");

        await presence.DisconnectedAsync(Encounter, Brom, ConnectionMode.Player);

        _time.Advance(TimeSpan.FromMinutes(1));
        Assert.True(Snapshot(presence).People.Single(p => p.UserId == Brom).Connected);
    }

    private sealed class ManualTime : TimeProvider
    {
        private DateTimeOffset _now = new(2026, 10, 17, 20, 0, 0, TimeSpan.Zero);

        public override DateTimeOffset GetUtcNow() => _now;

        public void Advance(TimeSpan by) => _now += by;

        // The grace is judged by the clock; the timer only wakes the server to tell the others.
        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period) => new NoTimer();

        private sealed class NoTimer : ITimer
        {
            public bool Change(TimeSpan dueTime, TimeSpan period) => true;

            public void Dispose()
            {
            }

            public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        }
    }
}

public sealed class TablePresenceTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private AppFactory App => fixture.App;

    [Fact]
    public async Task The_board_and_PresenceChanged_show_who_is_connected()
    {
        var fight = await App.StartFightAsync();
        var (oreana, yara, brom) = (fight.Table.Dm, fight.Table.SecondDm, fight.Table.Player);
        await using var oreanaDevice = await TableTestClient.ConnectAsync(App, oreana);
        var listener = new Listener(oreanaDevice);
        await oreanaDevice.JoinEncounterAsync(fight.EncounterId);

        // Brom and Yara own the characters, so they are in the row before they connect.
        var first = await listener.NextPresenceAsync();
        Assert.Equal(fight.EncounterId, first.EncounterId);
        Assert.Equal(
            [new PresentPerson(oreana.Id, true, true), new PresentPerson(yara.Id, false, false), new PresentPerson(brom.Id, false, false)],
            first.Presence.People);

        await using var bromDevice = await TableTestClient.JoinAsync(App, brom, fight.EncounterId);
        var bromJoined = await listener.PresenceUntilAsync(p => p.People.Single(x => x.UserId == brom.Id).Connected);
        Assert.False(bromJoined.Presence.People.Single(x => x.UserId == yara.Id).Connected);

        await using var yaraDevice = await TableTestClient.JoinAsync(App, yara, fight.EncounterId);
        await listener.PresenceUntilAsync(p => p.People.All(x => x.Connected));

        foreach (var person in new[] { oreana, yara, brom })
        {
            var board = await person.BoardAsync(fight);
            Assert.Equal(3, board.Presence.People.Count);
            Assert.All(board.Presence.People, p => Assert.True(p.Connected));
            Assert.False(board.Presence.SharedScreen);
        }
    }

    [Fact]
    public async Task A_person_with_two_devices_appears_once_and_a_shared_screen_is_the_table_icon()
    {
        var fight = await App.StartFightAsync();
        var brom = fight.Table.Player;
        await fight.LocalModeAsync();
        await using var oreanaDevice = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        var listener = new Listener(oreanaDevice);
        await using var phone = await TableTestClient.JoinAsync(App, brom, fight.EncounterId);
        await using var laptop = await TableTestClient.JoinAsync(App, brom, fight.EncounterId);
        await using var tablet = await App.JoinSharedScreenAsync(brom, fight.EncounterId);
        await using var spectator = await App.JoinAsAsync(fight.Table.SecondDm, fight.EncounterId, ConnectionMode.Spectator);

        var withScreen = await listener.PresenceUntilAsync(p => p.SharedScreen);

        Assert.Single(withScreen.Presence.People, p => p.UserId == brom.Id);
        var board = await brom.BoardAsync(fight);
        Assert.True(board.Presence.SharedScreen);
        Assert.Single(board.Presence.People, p => p.UserId == brom.Id);
        // Yara watches on the spectator screen only, so she is not connected as a person.
        Assert.False(board.Presence.People.Single(p => p.UserId == fight.Table.SecondDm.Id).Connected);

        await tablet.DisposeAsync();
        await spectator.DisposeAsync();
        await listener.PresenceUntilAsync(p => !p.SharedScreen);
    }

    // Real time: the grace is shortened to one second for this app.
    [Fact]
    [Trait(TestCategory.Name, TestCategory.Slow)]
    public async Task A_person_greys_out_after_the_grace_and_a_quick_reconnect_does_not_flicker()
    {
        await using var app = fixture.CreateApp(configuration: new Dictionary<string, string?> { ["Table:PresenceGrace"] = "00:00:01" });
        var fight = await app.StartFightAsync();
        var (oreana, brom, yara) = (fight.Table.Dm, fight.Table.Player, fight.Table.SecondDm);
        await using var oreanaDevice = await TableTestClient.JoinAsync(app, oreana, fight.EncounterId);
        var listener = new Listener(oreanaDevice);
        var bromDevice = await TableTestClient.JoinAsync(app, brom, fight.EncounterId);
        await using var yaraDevice = await TableTestClient.JoinAsync(app, yara, fight.EncounterId);
        await listener.PresenceUntilAsync(p => p.People.All(x => x.Connected));

        // A quick reconnect: no avatar goes grey.
        await bromDevice.DisposeAsync();
        bromDevice = await TableTestClient.JoinAsync(app, brom, fight.EncounterId);
        await Task.Delay(TimeSpan.FromSeconds(2));
        Assert.False(listener.HasPendingPresence);

        await bromDevice.DisposeAsync();
        var grey = await listener.NextPresenceAsync();
        Assert.False(grey.Presence.People.Single(p => p.UserId == brom.Id).Connected);
        Assert.True(grey.Presence.People.Single(p => p.UserId == yara.Id).Connected);
        Assert.False((await brom.BoardAsync(fight.CampaignId, fight.EncounterId)).Presence.People.Single(p => p.UserId == brom.Id).Connected);
    }
}
