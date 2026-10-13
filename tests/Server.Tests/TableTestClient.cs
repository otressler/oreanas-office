using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// One device at the live table: a SignalR connection to the test server as a person,
// with the API's JSON (camelCase enums), recording every message the server sends.
// Long polling, because the test server's handler speaks plain HTTP.
public sealed class TableTestClient : IAsyncDisposable
{
    public static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);

    private readonly Channel<TokenMovedEvent> _moves = Channel.CreateUnbounded<TokenMovedEvent>();
    private readonly Channel<Guid> _ended = Channel.CreateUnbounded<Guid>();
    private readonly TaskCompletionSource _idleTimeout = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource _closed = new(TaskCreationOptions.RunContinuationsAsynchronously);

    private TableTestClient(HubConnection connection)
    {
        Connection = connection;
        connection.On<TokenMovedEvent>(nameof(ITableClient.TokenMoved), move => _moves.Writer.TryWrite(move));
        connection.On<Guid>(nameof(ITableClient.EncounterEnded), id => _ended.Writer.TryWrite(id));
        connection.On(nameof(ITableClient.IdleTimeout), () => _idleTimeout.TrySetResult());
        connection.Closed += _ =>
        {
            _closed.TrySetResult();
            return Task.CompletedTask;
        };
    }

    public HubConnection Connection { get; }

    public Task IdleTimeout => _idleTimeout.Task;

    public Task Closed => _closed.Task;

    public static async Task<TableTestClient> ConnectAsync(AppFactory app, Person person)
    {
        var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(app.Server.BaseAddress, TableHub.Path), options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => app.Server.CreateHandler();
                options.Headers[TestAuth.Header] = person.Id.ToString();
            })
            .AddJsonProtocol(options =>
            {
                options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
            })
            .Build();
        var client = new TableTestClient(connection);
        await connection.StartAsync();
        return client;
    }

    // Connects and joins the encounter's group, which must succeed.
    public static async Task<TableTestClient> JoinAsync(AppFactory app, Person person, Guid encounterId)
    {
        var client = await ConnectAsync(app, person);
        Assert.Null((await client.JoinEncounterAsync(encounterId)).Error);
        return client;
    }

    public Task<HubResult> JoinEncounterAsync(Guid encounterId) =>
        Connection.InvokeAsync<HubResult>(nameof(ITableHub.JoinEncounter), encounterId);

    public Task<MoveResult> MoveAsync(Guid tokenId, int x, int y) =>
        Connection.InvokeAsync<MoveResult>(nameof(ITableHub.MoveToken), new MoveTokenRequest(tokenId, x, y));

    public Task<MoveResult> UndoAsync(Guid encounterId) =>
        Connection.InvokeAsync<MoveResult>(nameof(ITableHub.UndoMove), encounterId);

    public Task MarkActiveAsync() => Connection.InvokeAsync(nameof(ITableHub.MarkActive));

    // The next TokenMoved this device received. Messages arrive in the order the server
    // sent them, so a rejected move followed by a good one shows nothing was broadcast
    // for the rejected one.
    public async Task<TokenMovedEvent> NextMoveAsync()
    {
        using var timeout = new CancellationTokenSource(Wait);
        return await _moves.Reader.ReadAsync(timeout.Token);
    }

    public async Task<Guid> NextEncounterEndedAsync()
    {
        using var timeout = new CancellationTokenSource(Wait);
        return await _ended.Reader.ReadAsync(timeout.Token);
    }

    public bool HasPendingMove => _moves.Reader.TryPeek(out _);

    public async ValueTask DisposeAsync() => await Connection.DisposeAsync();
}
