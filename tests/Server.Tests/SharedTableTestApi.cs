using System.Net;
using System.Net.Http.Json;
using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// Shortcuts for the shared table (knowledge/features/shared-table.md): a device that is a
// shared screen, the play mode, the presence events and the shared screen's board.
public static class SharedTableTestApi
{
    // A device in the given mode, set the way WatchSession does it, before JoinEncounter.
    public static async Task<TableTestClient> JoinAsAsync(
        this AppFactory app, Person person, Guid encounterId, ConnectionMode mode)
    {
        var client = await TableTestClient.ConnectAsync(app, person);
        app.Services.GetRequiredService<TableConnections>().Get(client.Connection.ConnectionId!).Mode = mode;
        Assert.Null((await client.JoinEncounterAsync(encounterId)).Error);
        return client;
    }

    public static Task<TableTestClient> JoinSharedScreenAsync(this AppFactory app, Person person, Guid encounterId) =>
        app.JoinAsAsync(person, encounterId, ConnectionMode.SharedScreen);

    public static Task<HttpResponseMessage> SetPlayModeAsync(this Person person, Guid campaignId, Guid sessionId, PlayMode playMode) =>
        person.Client.PutAsJsonAsync($"/api/campaigns/{campaignId}/sessions/{sessionId}/play-mode", new SetPlayModeRequest(playMode), Json);

    public static async Task LocalModeAsync(this RunningFight fight, PlayMode playMode = PlayMode.Local) =>
        Assert.Equal(HttpStatusCode.OK, (await fight.Table.Dm.SetPlayModeAsync(fight.CampaignId, fight.Table.Session.Id, playMode)).StatusCode);

    // The board as a shared screen loads it.
    public static async Task<BoardStateResponse> SharedScreenBoardAsync(this Person person, RunningFight fight) =>
        await (await person.Client.GetAsync(
            $"/api/campaigns/{fight.CampaignId}/encounters/{fight.EncounterId}/board?view=player&sharedScreen=true"))
            .ReadAsync<BoardStateResponse>(HttpStatusCode.OK);

    public static async Task JoinSessionGroupAsync(this AppFactory app, TableTestClient client, Guid sessionId)
    {
        var hub = app.Services.GetRequiredService<IHubContext<TableHub, ITableClient>>();
        await hub.Groups.AddToGroupAsync(client.Connection.ConnectionId!, TableGroups.Session(sessionId));
    }

    // Records what a device hears about presence and the play mode.
    public sealed class Listener
    {
        private readonly Channel<PresenceChangedEvent> _presence = Channel.CreateUnbounded<PresenceChangedEvent>();
        private readonly Channel<PlayModeChangedEvent> _playMode = Channel.CreateUnbounded<PlayModeChangedEvent>();

        public Listener(TableTestClient client)
        {
            client.Connection.On<PresenceChangedEvent>(nameof(ITableClient.PresenceChanged), e => _presence.Writer.TryWrite(e));
            client.Connection.On<PlayModeChangedEvent>(nameof(ITableClient.PlayModeChanged), e => _playMode.Writer.TryWrite(e));
        }

        public Task<PresenceChangedEvent> NextPresenceAsync() => NextAsync(_presence);

        public Task<PlayModeChangedEvent> NextPlayModeAsync() => NextAsync(_playMode);

        public bool HasPendingPresence => _presence.Reader.TryPeek(out _);

        // Reads presence events until one satisfies the condition.
        public async Task<PresenceChangedEvent> PresenceUntilAsync(Func<PresenceState, bool> condition)
        {
            while (true)
            {
                var next = await NextPresenceAsync();
                if (condition(next.Presence))
                {
                    return next;
                }
            }
        }

        private static async Task<T> NextAsync<T>(Channel<T> channel)
        {
            using var timeout = new CancellationTokenSource(TableTestClient.Wait);
            return await channel.Reader.ReadAsync(timeout.Token);
        }
    }
}
