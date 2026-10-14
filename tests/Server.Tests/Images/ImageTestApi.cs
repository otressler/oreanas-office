using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests.Images;

// Shortcuts for the map background tests: the endpoints, the database, and a DM's map.
public static class ImageTestApi
{
    public static string BackgroundsUrl(Guid campaignId, Guid mapId) => $"/api/campaigns/{campaignId}/maps/{mapId}/backgrounds";

    public static async Task<MapBackgroundsResponse> ListBackgroundsAsync(this Person person, Guid campaignId, Guid mapId) =>
        await (await person.Client.GetAsync(BackgroundsUrl(campaignId, mapId))).ReadAsync<MapBackgroundsResponse>(HttpStatusCode.OK);

    public static Task<HttpResponseMessage> GenerateAsync(this Person person, Guid campaignId, Guid mapId, int mapVersion) =>
        person.Client.PostAsJsonAsync(BackgroundsUrl(campaignId, mapId), new GenerateBackgroundRequest(mapVersion), Json);

    // Queues a job for the map as the server has it now; it must be accepted.
    public static async Task<MapBackground> QueueAsync(this Person person, Guid campaignId, Guid mapId)
    {
        var version = (await person.FetchOneAsync(campaignId, mapId)).Version;
        return await (await person.GenerateAsync(campaignId, mapId, version)).ReadAsync<MapBackground>(HttpStatusCode.Accepted);
    }

    public static Task<HttpResponseMessage> PickAsync(this Person person, Guid campaignId, Guid mapId, Guid? assetId) =>
        person.Client.PutAsJsonAsync($"/api/campaigns/{campaignId}/maps/{mapId}/background", new PickBackgroundRequest(assetId), Json);

    public static Task<HttpResponseMessage> GetAssetAsync(this Person person, Guid assetId) =>
        person.Client.GetAsync($"/api/assets/{assetId}");

    // A DM with a campaign and an 8×5 hall (SyncTestApi.Hall).
    public static async Task<(Person Dm, Guid CampaignId, Guid MapId)> DmWithMapAsync(this AppFactory app, string campaign = "Die Gruft")
    {
        var dm = await app.CreatePersonAsync("Oreana");
        var campaignId = (await dm.CreateCampaignAsync(campaign)).Id;
        var map = await dm.PushOneAsync(Map(campaignId));
        return (dm, campaignId, map.Id);
    }

    public static async Task<T> InDbAsync<T>(this WebApplicationFactory<Program> app, Func<AppDbContext, Task<T>> query)
    {
        await using var scope = app.Services.CreateAsyncScope();
        return await query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public static Task<Asset> AssetAsync(this WebApplicationFactory<Program> app, Guid assetId) =>
        app.InDbAsync(db => db.Assets.AsNoTracking().SingleAsync(a => a.Id == assetId));

    public static FakeImageClient ResetFakeImages(this WebApplicationFactory<Program> app)
    {
        var fake = app.Services.GetRequiredService<FakeImageClient>();
        fake.Reset();
        return fake;
    }

    // Generates a background and waits until the job has ended.
    public static async Task<MapBackground> GenerateAndWaitAsync(this AppFactory app, Person dm, Guid campaignId, Guid mapId)
    {
        await using var watcher = await ImageTestClient.WatchAsync(app, dm.Id, campaignId, mapId);
        var queued = await dm.QueueAsync(campaignId, mapId);
        return await watcher.EndedAsync(queued.Id);
    }
}

// An open editor: a connection to the image hub watching one map, recording every
// BackgroundUpdated. Long polling, because the test server's handler speaks plain HTTP.
public sealed class ImageTestClient : IAsyncDisposable
{
    public static readonly TimeSpan Wait = TimeSpan.FromSeconds(20);

    private readonly Channel<MapBackground> _updates = Channel.CreateUnbounded<MapBackground>();

    private ImageTestClient(HubConnection connection)
    {
        Connection = connection;
        connection.On<MapBackground>(nameof(IImageHubClient.BackgroundUpdated), b => _updates.Writer.TryWrite(b));
    }

    public HubConnection Connection { get; }

    public static async Task<ImageTestClient> ConnectAsync(WebApplicationFactory<Program> app, Guid userId)
    {
        var connection = new HubConnectionBuilder()
            .WithUrl(new Uri(app.Server.BaseAddress, ImageHub.Path), options =>
            {
                options.Transports = HttpTransportType.LongPolling;
                options.HttpMessageHandlerFactory = _ => app.Server.CreateHandler();
                options.Headers[TestAuth.Header] = userId.ToString();
            })
            .AddJsonProtocol(options =>
                options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)))
            .Build();
        var client = new ImageTestClient(connection);
        await connection.StartAsync();
        return client;
    }

    // Connects and watches the map, which must succeed.
    public static async Task<ImageTestClient> WatchAsync(WebApplicationFactory<Program> app, Guid userId, Guid campaignId, Guid mapId)
    {
        var client = await ConnectAsync(app, userId);
        Assert.Null((await client.WatchMapAsync(campaignId, mapId)).Error);
        return client;
    }

    public Task<HubResult> WatchMapAsync(Guid campaignId, Guid mapId) =>
        Connection.InvokeAsync<HubResult>(nameof(IImageHub.WatchMap), campaignId, mapId);

    public async Task<MapBackground> NextAsync()
    {
        using var timeout = new CancellationTokenSource(Wait);
        return await _updates.Reader.ReadAsync(timeout.Token);
    }

    // The updates of one version up to the first with the status; returns them all.
    public async Task<List<MapBackground>> UntilAsync(Guid assetId, Func<AssetStatus, bool> status)
    {
        var seen = new List<MapBackground>();
        while (true)
        {
            var update = await NextAsync();
            if (update.Id != assetId)
            {
                continue;
            }

            seen.Add(update);
            if (status(update.Status))
            {
                return seen;
            }
        }
    }

    public async Task<MapBackground> EndedAsync(Guid assetId) =>
        (await UntilAsync(assetId, s => s is AssetStatus.Done or AssetStatus.Failed))[^1];

    public async Task<MapBackground> RunningAsync(Guid assetId) =>
        (await UntilAsync(assetId, s => s == AssetStatus.Running))[^1];

    public async ValueTask DisposeAsync() => await Connection.DisposeAsync();
}
