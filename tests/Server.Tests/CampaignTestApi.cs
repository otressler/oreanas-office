using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Tests;

// Shortcuts for the campaign, character, session and encounter tests: a campaign with a DM
// and players, and JSON that matches the API (camelCase enums).
public static class CampaignTestApi
{
    public static readonly JsonSerializerOptions Json = CreateJsonOptions();

    // A person with a client that acts as them.
    public sealed record Person(AppUser User, HttpClient Client)
    {
        public Guid Id => User.Id;
    }

    // The migration runs in the background after start; users need its tables.
    public static async Task<Person> CreatePersonAsync(this AppFactory app, string displayName)
    {
        var state = app.Services.GetRequiredService<DatabaseState>();
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(60);
        while (!state.IsMigrated && DateTime.UtcNow < deadline)
        {
            await Task.Delay(100);
        }

        var user = await app.CreateUserAsync(displayName);
        return new Person(user, app.CreateClientFor(user));
    }

    public static async Task<CampaignResponse> CreateCampaignAsync(this Person dm, string name = "Die Gruft")
    {
        var response = await dm.Client.PostAsJsonAsync("/api/campaigns", new CreateCampaignRequest(name), Json);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CampaignResponse>(Json))!;
    }

    public static async Task<CampaignSummaryResponse> JoinAsync(this Person person, string code)
    {
        var response = await person.Client.PostAsJsonAsync("/api/campaigns/join", new JoinCampaignRequest(code), Json);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CampaignSummaryResponse>(Json))!;
    }

    public static async Task<CampaignResponse> GetCampaignAsync(this Person person, Guid campaignId)
    {
        var response = await person.Client.GetAsync($"/api/campaigns/{campaignId}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CampaignResponse>(Json))!;
    }

    public static async Task PromoteAsync(this Person dm, Guid campaignId, Guid userId)
    {
        var response = await dm.Client.PostAsync($"/api/campaigns/{campaignId}/members/{userId}/promote", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    public static async Task<SessionResponse> CreateSessionAsync(
        this Person dm, Guid campaignId, string title = "Die Seilbrücke", DateOnly? date = null, Guid? dmUserId = null)
    {
        var response = await dm.Client.PostAsJsonAsync(
            $"/api/campaigns/{campaignId}/sessions",
            new CreateSessionRequest(title, date ?? new DateOnly(2026, 10, 17), dmUserId),
            Json);
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<SessionResponse>(Json))!;
    }

    public static async Task<SessionResponse> ActivateSessionAsync(this Person dm, Guid campaignId, Guid sessionId)
    {
        var response = await dm.Client.PostAsync($"/api/campaigns/{campaignId}/sessions/{sessionId}/activate", null);
        return await response.ReadAsync<SessionResponse>(HttpStatusCode.OK);
    }

    public static async Task<CharacterResponse> CreateCharacterAsync(
        this Person owner, Guid campaignId, string name, CreatureSize size = CreatureSize.Medium)
    {
        var response = await owner.Client.PostAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters", new CharacterRequest(name, size), Json);
        return await response.ReadAsync<CharacterResponse>(HttpStatusCode.Created);
    }

    public static async Task<EncounterSummaryResponse> ImportMapAsync(this Person dm, Guid campaignId, ImportMapRequest? map = null)
    {
        var response = await dm.Client.PostAsJsonAsync($"/api/campaigns/{campaignId}/encounters/import", map ?? TestMaps.Gorge(), Json);
        return await response.ReadAsync<EncounterSummaryResponse>(HttpStatusCode.Created);
    }

    // A fight starts with at least one character. Without placements, the DM brings a
    // new character of their own and puts it at (0, 1), free on TestMaps.Gorge.
    public static async Task<HttpResponseMessage> StartEncounterAsync(
        this Person dm, Guid campaignId, Guid sessionId, Guid encounterId, params CharacterPlacement[] characters)
    {
        if (characters.Length == 0)
        {
            var standIn = await dm.CreateCharacterAsync(campaignId, "Wache");
            characters = [new CharacterPlacement(standIn.Id, 0, 1)];
        }

        return await dm.Client.PostAsJsonAsync(
            $"/api/campaigns/{campaignId}/sessions/{sessionId}/encounters/{encounterId}/start",
            new StartEncounterRequest([.. characters]),
            Json);
    }

    public static Task<HttpResponseMessage> EndEncounterAsync(this Person dm, Guid campaignId, Guid sessionId, Guid encounterId) =>
        dm.Client.PostAsync($"/api/campaigns/{campaignId}/sessions/{sessionId}/encounters/{encounterId}/end", null);

    public static Task<HttpResponseMessage> GetBoardAsync(this Person person, Guid campaignId, Guid encounterId) =>
        person.Client.GetAsync($"/api/campaigns/{campaignId}/encounters/{encounterId}/board");

    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response, HttpStatusCode expected)
    {
        Assert.Equal(expected, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<T>(Json))!;
    }

    public static async Task AssertErrorAsync(
        this HttpResponseMessage response, HttpStatusCode status, ApiErrorCode code, string? field = null)
    {
        var error = await response.ReadAsync<ApiError>(status);
        Assert.Equal(code, error.Code);
        Assert.Equal(field, error.Field);
    }

    private static JsonSerializerOptions CreateJsonOptions()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
        return options;
    }
}
