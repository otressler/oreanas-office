using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sync;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// Shortcuts for the sync and map store tests: items to push, the push itself with the
// sync version header, and a small hall to put on maps.
public static class SyncTestApi
{
    public static SyncPushItem NewCampaign(Guid id, string name = "Offline-Kampagne") =>
        new(id, SyncItemKind.Campaign, id, 0, new SyncCampaignData(name), null, null, null);

    public static SyncPushItem CreatureType(
        Guid campaignId,
        Guid? id = null,
        string name = "Goblin",
        CreatureSize size = CreatureSize.Small,
        int baseVersion = 0,
        string appearance = "grün",
        string notes = "feige",
        DateTimeOffset? archivedAt = null,
        int initiativeModifier = 0,
        InitiativeRollMode initiativeRollMode = InitiativeRollMode.Normal) =>
        new(
            id ?? Guid.NewGuid(),
            SyncItemKind.CreatureType,
            campaignId,
            baseVersion,
            null,
            new SyncCreatureTypeData(name, size, appearance, notes, archivedAt, initiativeModifier, initiativeRollMode),
            null,
            null);

    public static SyncPushItem Map(Guid campaignId, Guid? id = null, int baseVersion = 0, SyncMapData? data = null) =>
        new(id ?? Guid.NewGuid(), SyncItemKind.BattleMap, campaignId, baseVersion, null, null, data ?? HallData(), null);

    public static SyncPushItem Encounter(
        Guid campaignId,
        Guid sessionId,
        Guid mapId,
        Guid? id = null,
        int baseVersion = 0,
        string name = "Überfall",
        EncounterStatus status = EncounterStatus.Draft,
        DateTimeOffset? archivedAt = null,
        params SyncCreatureToken[] tokens) =>
        new(
            id ?? Guid.NewGuid(),
            SyncItemKind.Encounter,
            campaignId,
            baseVersion,
            null,
            null,
            null,
            new SyncEncounterData(name, mapId, status, archivedAt, [.. tokens], sessionId));

    public static SyncCreatureToken Token(
        Guid typeId, int x, int y, string label = "Goblin 1", CreatureSize size = CreatureSize.Small, Guid? id = null) =>
        new(id ?? Guid.NewGuid(), typeId, label, x, y, size);

    // 8×5 floor. The pillar at (4, 3) blocks, (6, 1) is 1.5 m high, the entrance is on the
    // west edge.
    public static MapLayout Hall() => new(
        MapLayout.CurrentSchemaVersion,
        [
            .. Enumerable.Range(0, 5).SelectMany(y => Enumerable.Range(0, 8)
                .Select(x => new LayoutCell(x, y, Terrain.Floor, (x, y) == (6, 1) ? 1.5m : 0))),
        ],
        [new LayoutFeature("f1", "Säule", "Säule", 4, 3, 1, 1, 0, true)],
        [new LayoutEntrance("e1", EntranceKind.Entrance, "Tor", [[0, 2]])]);

    public static SyncMapData HallData(string name = "Halle", Guid? copiedFromMapId = null, DateTimeOffset? archivedAt = null) =>
        new(name, 8, 5, Hall(), "Eine Halle", "düster", "Fackeln", archivedAt, copiedFromMapId);

    // SyncProtocol.CurrentVersion as the header carries it.
    public const string CurrentVersion = "2";

    public static async Task<HttpResponseMessage> SendPushAsync(
        this Person person, SyncPushRequest request, string? version = CurrentVersion)
    {
        var message = new HttpRequestMessage(HttpMethod.Post, "/api/sync/push") { Content = JsonContent.Create(request, options: Json) };
        if (version is not null)
        {
            message.Headers.Add(SyncProtocol.VersionHeader, version);
        }

        return await person.Client.SendAsync(message);
    }

    // The results, in the order of the items; the push itself must be accepted.
    public static async Task<List<SyncItemResult>> PushAsync(this Person person, params SyncPushItem[] items)
    {
        var response = await person.SendPushAsync(new SyncPushRequest([.. items]));
        var results = (await response.ReadAsync<SyncPushResponse>(HttpStatusCode.OK)).Results;
        Assert.Equal(items.Select(i => i.Id), results.Select(r => r.Id));
        return results;
    }

    public static async Task<SyncItemResult> PushOneAsync(this Person person, SyncPushItem item) =>
        Assert.Single(await person.PushAsync(item));

    public static Task<HttpResponseMessage> GetVersionsAsync(this Person person, Guid campaignId) =>
        SendWithVersionAsync(person, HttpMethod.Get, $"/api/sync/campaigns/{campaignId}/versions", null);

    public static Task<HttpResponseMessage> FetchAsync(this Person person, Guid campaignId, params Guid[] ids) =>
        SendWithVersionAsync(person, HttpMethod.Post, $"/api/sync/campaigns/{campaignId}/items", JsonContent.Create(new SyncFetchRequest([.. ids]), options: Json));

    public static async Task<SyncServerItem> FetchOneAsync(this Person person, Guid campaignId, Guid id) =>
        Assert.Single(await (await person.FetchAsync(campaignId, id)).ReadAsync<List<SyncServerItem>>(HttpStatusCode.OK));

    public static async Task<SyncVersionList> VersionsAsync(this Person person, Guid campaignId) =>
        await (await person.GetVersionsAsync(campaignId)).ReadAsync<SyncVersionList>(HttpStatusCode.OK);

    public static string ToJson<T>(T value) => JsonSerializer.Serialize(value, Json);

    private static Task<HttpResponseMessage> SendWithVersionAsync(Person person, HttpMethod method, string url, HttpContent? content)
    {
        var message = new HttpRequestMessage(method, url) { Content = content };
        message.Headers.Add(SyncProtocol.VersionHeader, CurrentVersion);
        return person.Client.SendAsync(message);
    }
}
