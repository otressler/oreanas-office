using System.Net;
using System.Net.Http.Json;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Sync;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests;

// The pull side of the sync protocol (the version list and the fetch) and the version
// gate in front of all of /api/sync.
[Collection("App")]
public sealed class SyncPullTests(AppFixture fixture)
{
    private async Task<(Person Dm, Guid CampaignId)> DmWithCampaignAsync(string name = "Oreana")
    {
        var dm = await fixture.App.CreatePersonAsync(name);
        return (dm, (await dm.CreateCampaignAsync()).Id);
    }

    [Fact]
    public async Task The_version_list_names_every_item_of_the_campaign_archived_ones_included()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var (otherDm, otherCampaignId) = await DmWithCampaignAsync("Yara");
        var archivedAt = DateTimeOffset.UtcNow;
        var results = await dm.PushAsync(
            CreatureType(campaignId, name: "Goblin"),
            CreatureType(campaignId, name: "Ork", archivedAt: archivedAt),
            Map(campaignId),
            Map(campaignId, data: HallData(archivedAt: archivedAt)));
        var session = await dm.CreateSessionAsync(campaignId, "Die Seilbrücke");
        var encounter = await dm.PushOneAsync(Encounter(campaignId, session.Id, results[2].Id, archivedAt: archivedAt));
        await dm.PushOneAsync(CreatureType(campaignId, results[0].Id, "Goblin", CreatureSize.Large, 1));
        await otherDm.PushAsync(CreatureType(otherCampaignId), Map(otherCampaignId));

        var versions = await dm.VersionsAsync(campaignId);

        Assert.Equal(
            [(results[0].Id, 2), (results[1].Id, 1)],
            versions.CreatureTypes.Select(v => (v.Id, v.Version)).OrderBy(v => v.Id != results[0].Id));
        Assert.Equal(2, versions.BattleMaps.Count);
        Assert.Equal([results[2].Id, results[3].Id], versions.BattleMaps.Select(v => v.Id).OrderBy(id => id != results[2].Id));
        Assert.Equal([(encounter.Id, 1)], versions.Encounters.Select(v => (v.Id, v.Version)));
        Assert.Equal(
            [new SyncSession(session.Id, "Die Seilbrücke", session.Date, SessionStatus.Planned, dm.Id, "Oreana")],
            versions.Sessions);
    }

    [Fact]
    public async Task The_version_list_is_for_dm_members_only()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var player = await fixture.App.CreatePersonAsync("Brom");
        await player.JoinAsync((await dm.GetCampaignAsync(campaignId)).JoinCode!);
        var stranger = await fixture.App.CreatePersonAsync("Yara");

        Assert.Equal(HttpStatusCode.Forbidden, (await player.GetVersionsAsync(campaignId)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GetVersionsAsync(campaignId)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await player.FetchAsync(campaignId, Guid.NewGuid())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.FetchAsync(campaignId, Guid.NewGuid())).StatusCode);
    }

    [Fact]
    public async Task The_fetch_returns_only_the_items_of_the_campaign_whatever_their_kind()
    {
        var (dm, campaignId) = await DmWithCampaignAsync("Oreana");
        var (otherDm, otherCampaignId) = await DmWithCampaignAsync("Yara");
        var mine = await dm.PushAsync(CreatureType(campaignId), Map(campaignId));
        var encounter = await dm.PushOneAsync(Encounter(campaignId, (await dm.CreateSessionAsync(campaignId)).Id, mine[1].Id, tokens: [Token(mine[0].Id, 1, 1)]));
        var theirs = await otherDm.PushAsync(CreatureType(otherCampaignId), Map(otherCampaignId));

        var response = await dm.FetchAsync(
            campaignId, mine[0].Id, mine[1].Id, encounter.Id, theirs[0].Id, theirs[1].Id, Guid.NewGuid(), mine[0].Id);

        var items = await response.ReadAsync<List<SyncServerItem>>(HttpStatusCode.OK);
        Assert.Equal(
            [SyncItemKind.CreatureType, SyncItemKind.BattleMap, SyncItemKind.Encounter],
            items.Select(i => i.Kind).OrderBy(k => k));
        Assert.All(items, i => Assert.Equal(("Oreana", campaignId), (i.UpdatedByDisplayName, i.CampaignId)));
        Assert.Equal(ToJson(mine[0].Server), ToJson(items.Single(i => i.Kind == SyncItemKind.CreatureType)));
        Assert.Equal(ToJson(encounter.Server), ToJson(items.Single(i => i.Kind == SyncItemKind.Encounter)));
    }

    [Fact]
    public async Task The_fetch_with_no_ids_or_only_unknown_ones_is_empty()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();

        Assert.Empty(await (await dm.FetchAsync(campaignId)).ReadAsync<List<SyncServerItem>>(HttpStatusCode.OK));
        Assert.Empty(await (await dm.FetchAsync(campaignId, Guid.NewGuid())).ReadAsync<List<SyncServerItem>>(HttpStatusCode.OK));
    }

    // The version gate

    [Fact]
    public async Task Sync_refuses_an_app_without_a_current_version_header()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();

        foreach (var version in new string?[] { null, "", "abc", "0", "-1" })
        {
            await AssertOutdatedAsync(await dm.SendPushAsync(new SyncPushRequest([]), version));
            await AssertOutdatedAsync(await Send(dm, HttpMethod.Get, $"/api/sync/campaigns/{campaignId}/versions", version));
            await AssertOutdatedAsync(await Send(dm, HttpMethod.Post, $"/api/sync/campaigns/{campaignId}/items", version, JsonContent.Create(new SyncFetchRequest([]), options: Json)));
        }

        Assert.Equal(HttpStatusCode.OK, (await dm.SendPushAsync(new SyncPushRequest([]), SyncProtocol.CurrentVersion.ToString())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await dm.SendPushAsync(new SyncPushRequest([]), "7")).StatusCode);
    }

    [Fact]
    public async Task The_minimum_version_comes_from_the_configuration()
    {
        var user = await fixture.App.CreateUserAsync("Oreana");
        await using var app = fixture.CreateApp(configuration: new Dictionary<string, string?> { ["Sync:MinimumVersion"] = "3" });
        var person = new Person(user, app.CreateClientFor(user));

        await AssertOutdatedAsync(await person.SendPushAsync(new SyncPushRequest([]), "2"));
        Assert.Equal(HttpStatusCode.OK, (await person.SendPushAsync(new SyncPushRequest([]), "3")).StatusCode);
    }

    [Fact]
    public async Task An_outdated_app_is_refused_before_anything_is_saved()
    {
        var (dm, campaignId) = await DmWithCampaignAsync();
        var typeId = Guid.NewGuid();

        await AssertOutdatedAsync(await dm.SendPushAsync(new SyncPushRequest([CreatureType(campaignId, typeId)]), "0"));

        Assert.Empty((await dm.VersionsAsync(campaignId)).CreatureTypes);
    }

    private static Task<HttpResponseMessage> Send(Person person, HttpMethod method, string url, string? version, HttpContent? content = null)
    {
        var message = new HttpRequestMessage(method, url) { Content = content };
        if (version is not null)
        {
            message.Headers.TryAddWithoutValidation(SyncProtocol.VersionHeader, version);
        }

        return person.Client.SendAsync(message);
    }

    private static async Task AssertOutdatedAsync(HttpResponseMessage response) =>
        await response.AssertErrorAsync(HttpStatusCode.UpgradeRequired, ApiErrorCode.SyncOutdated);
}
