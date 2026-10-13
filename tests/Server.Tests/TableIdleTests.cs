using Microsoft.AspNetCore.SignalR.Client;

namespace OreanasOffice.Server.Tests;

// knowledge/decisions/realtime-sync.md, "Background tabs": the server drops connections
// idle for TableOptions.IdleTimeout. An app of its own with a 2-second timeout.
[Collection("App")]
public sealed class TableIdleTests(AppFixture fixture)
{
    private static readonly Dictionary<string, string?> ShortTimeout = new()
    {
        ["Table:IdleTimeout"] = "00:00:02",
        ["Table:IdleCheckInterval"] = "00:00:00.2",
    };

    [Fact]
    public async Task An_idle_device_is_dropped_while_an_active_one_stays()
    {
        await using var app = fixture.CreateApp(configuration: ShortTimeout);
        await using var idle = await TableTestClient.ConnectAsync(app, await app.CreatePersonAsync("Oreana"));
        await using var active = await TableTestClient.ConnectAsync(app, await app.CreatePersonAsync("Brom"));

        // Past a second timeout after the idle one was dropped, so MarkActive alone kept it.
        await KeepActiveAsync(active, until: async () =>
        {
            await idle.IdleTimeout.WaitAsync(TableTestClient.Wait);
            await idle.Closed.WaitAsync(TableTestClient.Wait);
            await Task.Delay(TimeSpan.FromSeconds(2.5));
        });

        Assert.Equal(HubConnectionState.Disconnected, idle.Connection.State);
        Assert.Equal(HubConnectionState.Connected, active.Connection.State);
        Assert.False(active.IdleTimeout.IsCompleted);
    }

    // Moves the server sends to a device don't count as its activity.
    [Fact]
    public async Task Hearing_moves_does_not_keep_a_device_awake()
    {
        await using var app = fixture.CreateApp(configuration: ShortTimeout);
        var fight = await app.StartFightAsync();
        await using var player = await TableTestClient.JoinAsync(app, fight.Table.Player, fight.EncounterId);
        await using var dm = await TableTestClient.JoinAsync(app, fight.Table.Dm, fight.EncounterId);

        var moves = 0;
        using var stop = new CancellationTokenSource(TableTestClient.Wait);
        while (!player.Closed.IsCompleted && !stop.IsCancellationRequested)
        {
            Assert.Null((await dm.MoveAsync(fight.Goblin, 5, moves++ % 2 == 0 ? 2 : 1)).Error);
            await Task.Delay(200);
        }

        Assert.True(player.IdleTimeout.IsCompleted);
        Assert.True(player.Closed.IsCompleted);
        Assert.True(player.HasPendingMove);
        Assert.Equal(HubConnectionState.Connected, dm.Connection.State);
    }

    private static async Task KeepActiveAsync(TableTestClient device, Func<Task> until)
    {
        using var stop = new CancellationTokenSource();
        var keepAlive = Task.Run(async () =>
        {
            while (!stop.IsCancellationRequested)
            {
                await device.MarkActiveAsync();
                await Task.Delay(200);
            }
        });

        try
        {
            await until();
        }
        finally
        {
            stop.Cancel();
            await keepAlive;
        }
    }
}
