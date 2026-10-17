using System.Net;
using System.Net.Http.Json;
using System.Threading.Channels;
using Microsoft.AspNetCore.SignalR.Client;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// Shortcuts for the spectator tests: the join endpoints, the spectate endpoints and a
// screen that records the session group's messages.
public static class SpectatorTestApi
{
    public static async Task<string> JoinCodeOfAsync(this Person dm, Guid campaignId) =>
        (await dm.GetCampaignAsync(campaignId)).JoinCode!;

    public static Task<HttpResponseMessage> LookUpAsync(this Person person, string code) =>
        person.Client.GetAsync($"/api/join/{code}");

    public static Task<HttpResponseMessage> JoinAsSpectatorAsync(this Person person, string code, Guid sessionId) =>
        person.Client.PostAsJsonAsync($"/api/join/{code}/spectate", new SpectateSessionRequest(sessionId), Json);

    // Someone outside the campaign who has joined the session as a spectator.
    public static async Task<Person> NewSpectatorAsync(this AppFactory app, EncounterTable table, string name = "Zuschauer")
    {
        var spectator = await app.CreatePersonAsync(name);
        var code = await table.Dm.JoinCodeOfAsync(table.CampaignId);
        await (await spectator.JoinAsSpectatorAsync(code, table.Session.Id)).ReadAsync<SpectateSessionResponse>(HttpStatusCode.OK);
        return spectator;
    }

    public static Task<HttpResponseMessage> GetSpectateAsync(this Person person, Guid sessionId) =>
        person.Client.GetAsync($"/api/sessions/{sessionId}/spectate");

    public static Task<HttpResponseMessage> GetSpectateBoardAsync(this Person person, Guid sessionId) =>
        person.Client.GetAsync($"/api/sessions/{sessionId}/spectate/board");

    public static async Task SetPlayModeOkAsync(this Person dm, Guid campaignId, Guid sessionId, PlayMode mode)
    {
        var response = await dm.Client.PutAsJsonAsync($"/api/campaigns/{campaignId}/sessions/{sessionId}/play-mode", new SetPlayModeRequest(mode), Json);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    public static Task<HttpResponseMessage> EndSessionAsync(this Person dm, Guid campaignId, Guid sessionId) =>
        dm.Client.PostAsync($"/api/campaigns/{campaignId}/sessions/{sessionId}/end", null);

    public static Task<WatchResult> WatchAsync(this TableTestClient device, Guid sessionId, bool sharedScreen = false) =>
        device.Connection.InvokeAsync<WatchResult>(nameof(ITableHub.WatchSession), new WatchSessionRequest(sessionId, sharedScreen));

    // Records the session group's messages of one device: call before WatchAsync.
    public static SessionMessages ListenToSession(this TableTestClient device) => new(device.Connection);
}

public sealed class SessionMessages
{
    private readonly Channel<EncounterStartedEvent> _started = Channel.CreateUnbounded<EncounterStartedEvent>();
    private readonly Channel<Guid> _ended = Channel.CreateUnbounded<Guid>();
    private readonly Channel<Guid> _sessionEnded = Channel.CreateUnbounded<Guid>();
    private readonly Channel<PlayModeChangedEvent> _playMode = Channel.CreateUnbounded<PlayModeChangedEvent>();

    public SessionMessages(HubConnection connection)
    {
        connection.On<EncounterStartedEvent>(nameof(ITableClient.EncounterStarted), e => _started.Writer.TryWrite(e));
        connection.On<Guid>(nameof(ITableClient.EncounterEnded), id => _ended.Writer.TryWrite(id));
        connection.On<Guid>(nameof(ITableClient.SessionEnded), id => _sessionEnded.Writer.TryWrite(id));
        connection.On<PlayModeChangedEvent>(nameof(ITableClient.PlayModeChanged), e => _playMode.Writer.TryWrite(e));
    }

    public Task<EncounterStartedEvent> EncounterStartedAsync() => NextAsync(_started);

    public Task<Guid> EncounterEndedAsync() => NextAsync(_ended);

    public Task<Guid> SessionEndedAsync() => NextAsync(_sessionEnded);

    public Task<PlayModeChangedEvent> PlayModeChangedAsync() => NextAsync(_playMode);

    private static async Task<T> NextAsync<T>(Channel<T> channel)
    {
        using var timeout = new CancellationTokenSource(TableTestClient.Wait);
        return await channel.Reader.ReadAsync(timeout.Token);
    }
}
