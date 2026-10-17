using Microsoft.AspNetCore.SignalR.Client;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// The idle-timeout exemption of spectator and shared screens (knowledge/features/
// spectator-view.md, "Connection and costs").
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class TableScreenKeepAliveDecisionTests
{
    [Theory]
    [InlineData(ConnectionMode.Spectator, SessionStatus.Active, true)]
    [InlineData(ConnectionMode.SharedScreen, SessionStatus.Active, true)]
    [InlineData(ConnectionMode.Spectator, SessionStatus.Planned, false)]
    [InlineData(ConnectionMode.SharedScreen, SessionStatus.Ended, false)]
    [InlineData(ConnectionMode.Player, SessionStatus.Active, false)]
    public void Only_screens_of_an_active_session_are_exempt_from_the_idle_timeout(ConnectionMode mode, SessionStatus status, bool exempt)
    {
        Assert.Equal(exempt, TableScreenKeepAlive.Exempt(mode, status));
        Assert.False(TableScreenKeepAlive.Exempt(mode, null));
    }
}

// An app of its own with a 2-second timeout.
[Trait(TestCategory.Name, TestCategory.Slow)]
public sealed class TableScreenIdleTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private static readonly Dictionary<string, string?> ShortTimeout = new()
    {
        ["Table:IdleTimeout"] = "00:00:02",
        ["Table:IdleCheckInterval"] = "00:00:00.2",
    };

    [Fact]
    public async Task A_screen_of_an_active_session_stays_while_a_planned_sessions_screen_and_a_player_are_dropped()
    {
        await using var app = fixture.CreateApp(configuration: ShortTimeout);
        var table = await app.CreateEncounterTableAsync();
        var planned = await table.Dm.CreateSessionAsync(table.CampaignId, "Später");
        await using var running = await TableTestClient.ConnectAsync(app, table.Player);
        await using var waiting = await TableTestClient.ConnectAsync(app, table.Player);
        await using var player = await TableTestClient.ConnectAsync(app, table.SecondDm);
        Assert.Null((await running.WatchAsync(table.Session.Id)).Error);
        Assert.Null((await waiting.WatchAsync(planned.Id)).Error);

        await waiting.IdleTimeout.WaitAsync(TableTestClient.Wait);
        await waiting.Closed.WaitAsync(TableTestClient.Wait);
        await player.Closed.WaitAsync(TableTestClient.Wait);
        await Task.Delay(TimeSpan.FromSeconds(2.5));

        Assert.Equal(HubConnectionState.Connected, running.Connection.State);
        Assert.False(running.IdleTimeout.IsCompleted);
    }
}
