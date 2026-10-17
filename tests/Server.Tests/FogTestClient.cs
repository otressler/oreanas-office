using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// One device at the table that keeps every message the server sends as raw JSON, so a test
// can check what a group really received (knowledge/features/fog-of-war.md, "Keeping
// secrets on the wire") and wait for a message it expects.
public sealed class FogTestClient : IAsyncDisposable
{
    private static readonly TimeSpan Wait = TimeSpan.FromSeconds(10);

    private readonly object _lock = new();
    private int _fences;
    private int _fenceY;
    private readonly List<(string Method, JsonElement Body)> _messages = [];

    private FogTestClient(HubConnection connection)
    {
        Connection = connection;
        foreach (var method in typeof(ITableClient).GetMethods())
        {
            var name = method.Name;
            if (method.GetParameters().Length == 1)
            {
                connection.On(name, [typeof(JsonElement)], args =>
                {
                    Record(name, (JsonElement)args[0]!);
                    return Task.CompletedTask;
                });
            }
            else
            {
                connection.On(name, () => Record(name, default));
            }
        }
    }

    public HubConnection Connection { get; }

    public static async Task<FogTestClient> JoinAsync(AppFactory app, Person person, Guid encounterId)
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
        var client = new FogTestClient(connection);
        await connection.StartAsync();
        Assert.Null((await client.InvokeAsync<HubResult>(nameof(ITableHub.JoinEncounter), encounterId)).Error);
        return client;
    }

    public Task<T> InvokeAsync<T>(string method, object argument) => Connection.InvokeAsync<T>(method, argument);

    public Task<HubResult> ChangeFogAsync(Guid encounterId, bool reveal, params (int X, int Y)[] cells) =>
        InvokeAsync<HubResult>(
            nameof(ITableHub.ChangeFog),
            new ChangeFogRequest(encounterId, [.. cells.Select(c => new BoardCell(c.X, c.Y))], reveal));

    public Task<HubResult> SetHiddenAsync(Guid encounterId, bool hidden, params Guid[] tokenIds) =>
        InvokeAsync<HubResult>(nameof(ITableHub.SetTokensHidden), new SetTokensHiddenRequest(encounterId, [.. tokenIds], hidden));

    public Task<HubResult> UndoChangeAsync(Guid encounterId) => InvokeAsync<HubResult>(nameof(ITableHub.UndoChange), encounterId);

    public Task<MoveResult> MoveAsync(Guid tokenId, int x, int y) =>
        InvokeAsync<MoveResult>(nameof(ITableHub.MoveToken), new MoveTokenRequest(tokenId, x, y));

    public Task<HubResult> PreviewAsync(Guid tokenId, int x, int y) =>
        InvokeAsync<HubResult>(nameof(ITableHub.PreviewMove), new MoveTokenRequest(tokenId, x, y));

    public Task<HubResult> PingCellAsync(Guid encounterId, int x, int y) =>
        InvokeAsync<HubResult>(nameof(ITableHub.Ping), new PingRequest(encounterId, new BoardCell(x, y), null));

    public Task<HubResult> PingTokenAsync(Guid encounterId, Guid tokenId) =>
        InvokeAsync<HubResult>(nameof(ITableHub.Ping), new PingRequest(encounterId, null, tokenId));

    public Task<HubResult> ArrowAsync(Guid encounterId, Guid fromTokenId, int x, int y) =>
        InvokeAsync<HubResult>(nameof(ITableHub.DrawArrow), new DrawArrowRequest(encounterId, null, fromTokenId, new BoardCell(x, y)));

    public Task<SpawnResult> SpawnAsync(Guid encounterId, bool hidden, params (Guid TypeId, int X, int Y)[] creatures) =>
        InvokeAsync<SpawnResult>(
            nameof(ITableHub.SpawnCreatures),
            new SpawnCreaturesRequest(encounterId, [.. creatures.Select(c => new SpawnedCreature(c.TypeId, c.X, c.Y))], hidden));

    // Every message received so far, in order.
    public List<(string Method, JsonElement Body)> Messages
    {
        get
        {
            lock (_lock)
            {
                return [.. _messages];
            }
        }
    }

    public List<JsonElement> Of(string method) => [.. Messages.Where(m => m.Method == method).Select(m => m.Body)];

    // All the JSON this device received, to search for what it must never have got.
    public string Everything => string.Join('\n', Messages.Select(m => m.Method + " " + m.Body));

    // Waits until the device has received `count` messages of the method, and returns them.
    public async Task<List<JsonElement>> WaitForAsync(string method, int count = 1)
    {
        var deadline = DateTime.UtcNow + Wait;
        while (DateTime.UtcNow < deadline)
        {
            var found = Of(method);
            if (found.Count >= count)
            {
                return found;
            }

            await Task.Delay(20);
        }

        throw new TimeoutException($"{method} did not arrive {count} times; got: {string.Join(", ", Messages.Select(m => m.Method))}");
    }

    // Messages arrive in the order the server sent them, so once the fence (a move of an
    // always visible token that the sender made after everything else) is here, nothing
    // earlier is still on its way. The fence token must start at x = 0 with room at x = 1 and
    // is moved only by fences; pings would do too, but they are rate limited.
    public async Task FenceAsync(FogTestClient sender, Guid fenceTokenId)
    {
        var result = await sender.MoveAsync(fenceTokenId, sender._fences++ % 2 == 0 ? 1 : 0, sender._fenceY);
        Assert.Null(result.Error);
        var version = result.Move!.Version;
        var deadline = DateTime.UtcNow + Wait;
        while (DateTime.UtcNow < deadline)
        {
            if (Of(nameof(ITableClient.TokenMoved)).Any(m => m.GetProperty("tokenId").GetGuid() == fenceTokenId && m.GetProperty("version").GetInt32() == version))
            {
                return;
            }

            await Task.Delay(20);
        }

        throw new TimeoutException("The fence did not arrive.");
    }

    // The row the fence token stands in.
    public int FenceRow { set => _fenceY = value; }

    public async ValueTask DisposeAsync() => await Connection.DisposeAsync();

    private void Record(string method, JsonElement body)
    {
        lock (_lock)
        {
            _messages.Add((method, body.ValueKind == JsonValueKind.Undefined ? default : body.Clone()));
        }
    }
}
