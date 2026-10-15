using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using Microsoft.AspNetCore.Http.Connections;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests.Images;

// A campaign for the token image tests: the DM Oreana, a second `dm` member Yara, the player
// Brom with his character Thorin, the player Kira, and a stranger outside the campaign.
public sealed record TokenTable(
    Person Dm, Person SecondDm, Person Player, Person OtherPlayer, Person Stranger, Guid CampaignId, Guid CreatureTypeId, int TypeVersion, Guid CharacterId);

// Shortcuts for the token icon and portrait endpoints (knowledge/features/token-icons.md).
public static class TokenImageTestApi
{
    public static string IconsUrl(Guid campaignId, Guid typeId) => $"/api/campaigns/{campaignId}/creature-types/{typeId}/icons";

    public static string PortraitsUrl(Guid campaignId, Guid characterId) => $"/api/campaigns/{campaignId}/characters/{characterId}/portraits";

    // The fake model answers text to image with a real transparent PNG.
    public static FakeImageClient ResetFakeTokens(this WebApplicationFactory<Program> app)
    {
        var fake = app.Services.GetRequiredService<FakeImageClient>();
        fake.Reset();
        fake.TokenPng ??= TestPictures.TransparentPng(256, 256);
        return fake;
    }

    public static async Task<TokenTable> CreateTokenTableAsync(this AppFactory app, string appearance = "Zwerg, roter Bart")
    {
        var dm = await app.CreatePersonAsync("Oreana");
        var secondDm = await app.CreatePersonAsync("Yara");
        var player = await app.CreatePersonAsync("Brom");
        var otherPlayer = await app.CreatePersonAsync("Kira");
        var stranger = await app.CreatePersonAsync("Fremder");
        var campaign = await dm.CreateCampaignAsync();
        foreach (var person in new[] { secondDm, player, otherPlayer })
        {
            await person.JoinAsync(campaign.JoinCode!);
        }

        await dm.PromoteAsync(campaign.Id, secondDm.Id);
        var type = await dm.PushOneAsync(CreatureType(campaign.Id, appearance: "klein, grüne Haut"));
        var character = await player.CreateCharacterAsync(campaign.Id, "Thorin", appearance);
        return new TokenTable(dm, secondDm, player, otherPlayer, stranger, campaign.Id, type.Id, type.Server!.Version, character.Id);
    }

    public static async Task<CharacterResponse> CreateCharacterAsync(this Person owner, Guid campaignId, string name, string appearance)
    {
        var response = await owner.Client.PostAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters", new CharacterRequest(name, CreatureSize.Medium, appearance), Json);
        return await response.ReadAsync<CharacterResponse>(HttpStatusCode.Created);
    }

    public static Task<HttpResponseMessage> GenerateIconAsync(this Person person, Guid campaignId, Guid typeId, int? version) =>
        person.Client.PostAsJsonAsync(IconsUrl(campaignId, typeId), new GenerateTokenImageRequest(version), Json);

    public static Task<HttpResponseMessage> GeneratePortraitAsync(this Person person, Guid campaignId, Guid characterId, Guid? restyle = null) =>
        person.Client.PostAsJsonAsync(PortraitsUrl(campaignId, characterId), new GenerateTokenImageRequest(RestyleAssetId: restyle), Json);

    public static Task<HttpResponseMessage> PickIconAsync(this Person person, Guid campaignId, Guid typeId, Guid? assetId) =>
        person.Client.PutAsJsonAsync($"/api/campaigns/{campaignId}/creature-types/{typeId}/icon", new PickTokenImageRequest(assetId), Json);

    public static Task<HttpResponseMessage> PickPortraitAsync(this Person person, Guid campaignId, Guid characterId, Guid? assetId) =>
        person.Client.PutAsJsonAsync($"/api/campaigns/{campaignId}/characters/{characterId}/portrait", new PickTokenImageRequest(assetId), Json);

    public static Task<HttpResponseMessage> UploadAsync(this Person person, Guid campaignId, Guid characterId, byte[] picture, string contentType)
    {
        var content = new ByteArrayContent(picture);
        content.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return person.Client.PostAsync($"{PortraitsUrl(campaignId, characterId)}/upload", content);
    }

    public static async Task<TokenImage> UploadOkAsync(this Person person, Guid campaignId, Guid characterId, byte[]? picture = null) =>
        await (await person.UploadAsync(campaignId, characterId, picture ?? TestPictures.SplitJpeg(300, 200), "image/jpeg"))
            .ReadAsync<TokenImage>(HttpStatusCode.Created);

    public static async Task<TokenImagesResponse> ListIconsAsync(this Person person, Guid campaignId, Guid typeId) =>
        await (await person.Client.GetAsync(IconsUrl(campaignId, typeId))).ReadAsync<TokenImagesResponse>(HttpStatusCode.OK);

    public static async Task<TokenImagesResponse> ListPortraitsAsync(this Person person, Guid campaignId, Guid characterId) =>
        await (await person.Client.GetAsync(PortraitsUrl(campaignId, characterId))).ReadAsync<TokenImagesResponse>(HttpStatusCode.OK);

    // Generates an icon for the type as the server has it and waits until the job ended.
    public static async Task<TokenImage> IconAndWaitAsync(this AppFactory app, Person dm, Guid campaignId, Guid typeId)
    {
        await using var watcher = await TokenImageTestClient.WatchAsync(app, dm.Id, campaignId, AssetOwnerType.CreatureType, typeId);
        var version = (await dm.FetchOneAsync(campaignId, typeId)).Version;
        var queued = await (await dm.GenerateIconAsync(campaignId, typeId, version)).ReadAsync<TokenImage>(HttpStatusCode.Accepted);
        return await watcher.EndedAsync(queued.Id);
    }

    public static async Task<TokenImage> PortraitAndWaitAsync(this AppFactory app, Person person, Guid campaignId, Guid characterId, Guid? restyle = null)
    {
        await using var watcher = await TokenImageTestClient.WatchAsync(app, person.Id, campaignId, AssetOwnerType.Character, characterId);
        var queued = await (await person.GeneratePortraitAsync(campaignId, characterId, restyle)).ReadAsync<TokenImage>(HttpStatusCode.Accepted);
        return await watcher.EndedAsync(queued.Id);
    }
}

// An open gallery: a connection to the image hub watching one creature type's icons or one
// character's portraits, recording every TokenImageUpdated.
public sealed class TokenImageTestClient : IAsyncDisposable
{
    private readonly Channel<TokenImage> _updates = Channel.CreateUnbounded<TokenImage>();

    private TokenImageTestClient(HubConnection connection)
    {
        Connection = connection;
        connection.On<TokenImage>(nameof(IImageHubClient.TokenImageUpdated), i => _updates.Writer.TryWrite(i));
    }

    public HubConnection Connection { get; }

    public static async Task<TokenImageTestClient> ConnectAsync(WebApplicationFactory<Program> app, Guid userId)
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
        var client = new TokenImageTestClient(connection);
        await connection.StartAsync();
        return client;
    }

    public static async Task<TokenImageTestClient> WatchAsync(
        WebApplicationFactory<Program> app, Guid userId, Guid campaignId, AssetOwnerType ownerType, Guid ownerId)
    {
        var client = await ConnectAsync(app, userId);
        Assert.Null((await client.WatchAsync(campaignId, ownerType, ownerId)).Error);
        return client;
    }

    public Task<HubResult> WatchAsync(Guid campaignId, AssetOwnerType ownerType, Guid ownerId) =>
        Connection.InvokeAsync<HubResult>(nameof(IImageHub.WatchTokenImages), campaignId, ownerType, ownerId);

    public async Task<List<TokenImage>> UntilAsync(Guid assetId, Func<AssetStatus, bool> status)
    {
        var seen = new List<TokenImage>();
        while (true)
        {
            using var timeout = new CancellationTokenSource(ImageTestClient.Wait);
            var update = await _updates.Reader.ReadAsync(timeout.Token);
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

    public async Task<TokenImage> EndedAsync(Guid assetId) =>
        (await UntilAsync(assetId, s => s is AssetStatus.Done or AssetStatus.Failed))[^1];

    public async Task<TokenImage> RunningAsync(Guid assetId) =>
        (await UntilAsync(assetId, s => s == AssetStatus.Running))[^1];

    public async ValueTask DisposeAsync() => await Connection.DisposeAsync();
}
