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
    // MovePreviewed and MovePreviewCleared in one list, to check their order.
    private readonly Channel<object> _previews = Channel.CreateUnbounded<object>();
    private readonly Channel<PingedEvent> _pings = Channel.CreateUnbounded<PingedEvent>();
    private readonly Channel<ArrowDrawnEvent> _arrows = Channel.CreateUnbounded<ArrowDrawnEvent>();
    private readonly Channel<TokenStatusesChangedEvent> _statuses = Channel.CreateUnbounded<TokenStatusesChangedEvent>();
    // TokenRemoved and TokenRestored in one list, to check their order.
    private readonly Channel<object> _removals = Channel.CreateUnbounded<object>();
    private readonly TaskCompletionSource _idleTimeout = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource _closed = new(TaskCreationOptions.RunContinuationsAsynchronously);

    private TableTestClient(HubConnection connection)
    {
        Connection = connection;
        connection.On<TokenMovedEvent>(nameof(ITableClient.TokenMoved), move => _moves.Writer.TryWrite(move));
        connection.On<Guid>(nameof(ITableClient.EncounterEnded), id => _ended.Writer.TryWrite(id));
        connection.On<MovePreviewEvent>(nameof(ITableClient.MovePreviewed), preview => _previews.Writer.TryWrite(preview));
        connection.On<MovePreviewClearedEvent>(nameof(ITableClient.MovePreviewCleared), cleared => _previews.Writer.TryWrite(cleared));
        connection.On(nameof(ITableClient.IdleTimeout), () => _idleTimeout.TrySetResult());
        connection.On<PingedEvent>(nameof(ITableClient.Pinged), ping => _pings.Writer.TryWrite(ping));
        connection.On<ArrowDrawnEvent>(nameof(ITableClient.ArrowDrawn), arrow => _arrows.Writer.TryWrite(arrow));
        connection.On<TokenStatusesChangedEvent>(nameof(ITableClient.TokenStatusesChanged), change => _statuses.Writer.TryWrite(change));
        connection.On<TokenRemovedEvent>(nameof(ITableClient.TokenRemoved), removed => _removals.Writer.TryWrite(removed));
        connection.On<TokenRestoredEvent>(nameof(ITableClient.TokenRestored), restored => _removals.Writer.TryWrite(restored));
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

    public Task<HubResult> PreviewAsync(Guid tokenId, int x, int y) =>
        Connection.InvokeAsync<HubResult>(nameof(ITableHub.PreviewMove), new MoveTokenRequest(tokenId, x, y));

    public Task ClearPreviewAsync() => Connection.InvokeAsync(nameof(ITableHub.ClearPreview));

    public Task MarkActiveAsync() => Connection.InvokeAsync(nameof(ITableHub.MarkActive));

    public Task<HubResult> PingAsync(PingRequest request) =>
        Connection.InvokeAsync<HubResult>(nameof(ITableHub.Ping), request);

    public Task<HubResult> PingCellAsync(Guid encounterId, int x, int y) => PingAsync(new PingRequest(encounterId, new BoardCell(x, y), null));

    public Task<HubResult> ArrowAsync(DrawArrowRequest request) =>
        Connection.InvokeAsync<HubResult>(nameof(ITableHub.DrawArrow), request);

    public Task<StatusResult> AddStatusAsync(Guid tokenId, Guid statusId, int? level = null) =>
        Connection.InvokeAsync<StatusResult>(nameof(ITableHub.AddStatus), new AddStatusRequest(tokenId, statusId, level));

    public Task<StatusResult> RemoveStatusAsync(Guid tokenId, Guid statusId) =>
        Connection.InvokeAsync<StatusResult>(nameof(ITableHub.RemoveStatus), new RemoveStatusRequest(tokenId, statusId));

    public Task<StatusResult> SetStatusLevelAsync(Guid tokenId, Guid statusId, int level) =>
        Connection.InvokeAsync<StatusResult>(nameof(ITableHub.SetStatusLevel), new SetStatusLevelRequest(tokenId, statusId, level));

    public Task<HubResult> RemoveTokenAsync(Guid tokenId) =>
        Connection.InvokeAsync<HubResult>(nameof(ITableHub.RemoveToken), tokenId);

    public Task<HubResult> RestoreTokenAsync(Guid tokenId) =>
        Connection.InvokeAsync<HubResult>(nameof(ITableHub.RestoreToken), tokenId);

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

    // The next MovePreviewed or MovePreviewCleared this device received.
    public async Task<object> NextPreviewAsync()
    {
        using var timeout = new CancellationTokenSource(Wait);
        return await _previews.Reader.ReadAsync(timeout.Token);
    }

    public bool HasPendingPreview => _previews.Reader.TryPeek(out _);

    public Task<PingedEvent> NextPingAsync() => NextAsync(_pings);

    public Task<ArrowDrawnEvent> NextArrowAsync() => NextAsync(_arrows);

    public Task<TokenStatusesChangedEvent> NextStatusesAsync() => NextAsync(_statuses);

    // The next TokenRemoved or TokenRestored.
    public Task<object> NextRemovalAsync() => NextAsync(_removals);

    public bool HasPendingPing => _pings.Reader.TryPeek(out _) || _arrows.Reader.TryPeek(out _);

    public bool HasPendingStatuses => _statuses.Reader.TryPeek(out _);

    public bool HasPendingRemoval => _removals.Reader.TryPeek(out _);

    public bool HasPendingMove => _moves.Reader.TryPeek(out _);

    public async ValueTask DisposeAsync() => await Connection.DisposeAsync();

    private static async Task<T> NextAsync<T>(Channel<T> channel)
    {
        using var timeout = new CancellationTokenSource(Wait);
        return await channel.Reader.ReadAsync(timeout.Token);
    }
}
