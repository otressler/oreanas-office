using System.Net;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Sync;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests;

// The map store (knowledge/domain/battle-map.md, "Map list, archive and store"). Other
// tests fill the same database with maps, so these look only for the maps they made.
[Collection("App")]
public sealed class MapStoreTests(AppFixture fixture)
{
    private sealed record Campaigns(Person Gruft, Guid GruftId, Person Wald, Guid WaldId);

    private async Task<Campaigns> TwoCampaignsAsync()
    {
        var gruft = await fixture.App.CreatePersonAsync("Oreana");
        var wald = await fixture.App.CreatePersonAsync("Yara");
        return new Campaigns(gruft, (await gruft.CreateCampaignAsync("Die Gruft")).Id, wald, (await wald.CreateCampaignAsync("Der Wald")).Id);
    }

    private static async Task<List<StoreMapResponse>> StoreAsync(Person person, Guid campaignId) =>
        await (await person.Client.GetAsync($"/api/campaigns/{campaignId}/map-store")).ReadAsync<List<StoreMapResponse>>(HttpStatusCode.OK);

    private static Task<HttpResponseMessage> AddAsync(Person person, Guid campaignId, Guid mapId) =>
        person.Client.PostAsync($"/api/campaigns/{campaignId}/map-store/{mapId}", null);

    private static async Task<SyncServerItem> AddedAsync(Person person, Guid campaignId, Guid mapId) =>
        await (await AddAsync(person, campaignId, mapId)).ReadAsync<SyncServerItem>(HttpStatusCode.OK);

    [Fact]
    public async Task The_store_offers_maps_of_other_campaigns()
    {
        var c = await TwoCampaignsAsync();
        var map = await c.Gruft.PushOneAsync(Map(c.GruftId, data: HallData("Thronsaal")));
        var own = await c.Wald.PushOneAsync(Map(c.WaldId, data: HallData("Lichtung")));

        var store = await StoreAsync(c.Wald, c.WaldId);

        var offered = Assert.Single(store, m => m.Id == map.Id);
        Assert.Equal(
            ("Thronsaal", 8, 5, "Die Gruft", false, ToJson(HallData().Layout)),
            (offered.Name, offered.Width, offered.Height, offered.CampaignName, offered.HasArchivedCopy, ToJson(offered.Layout)));
        Assert.DoesNotContain(store, m => m.Id == own.Id);
    }

    [Fact]
    public async Task Adding_a_map_copies_its_layout_and_texts_but_no_encounters()
    {
        var c = await TwoCampaignsAsync();
        var types = await c.Gruft.PushAsync(Map(c.GruftId, data: HallData("Thronsaal")), CreatureType(c.GruftId));
        await c.Gruft.PushOneAsync(Encounter(c.GruftId, (await c.Gruft.CreateSessionAsync(c.GruftId)).Id, types[0].Id, tokens: [Token(types[1].Id, 0, 0)]));

        var copy = await AddedAsync(c.Wald, c.WaldId, types[0].Id);

        Assert.NotEqual(types[0].Id, copy.Id);
        Assert.Equal((SyncItemKind.BattleMap, c.WaldId, 1), (copy.Kind, copy.CampaignId, copy.Version));
        Assert.Equal(ToJson(HallData("Thronsaal", copiedFromMapId: types[0].Id)), ToJson(copy.Map));
        var versions = await c.Wald.VersionsAsync(c.WaldId);
        Assert.Equal([copy.Id], versions.BattleMaps.Select(v => v.Id));
        Assert.Empty(versions.Encounters);
        Assert.Empty(versions.CreatureTypes);
        Assert.Equal(1, (await c.Wald.FetchOneAsync(c.WaldId, copy.Id)).Version);
        Assert.Equal("Yara", copy.UpdatedByDisplayName);
    }

    [Fact]
    public async Task A_map_the_campaign_has_a_copy_of_is_no_longer_offered()
    {
        var c = await TwoCampaignsAsync();
        var map = await c.Gruft.PushOneAsync(Map(c.GruftId));
        await AddedAsync(c.Wald, c.WaldId, map.Id);

        var store = await StoreAsync(c.Wald, c.WaldId);
        var again = await AddAsync(c.Wald, c.WaldId, map.Id);

        Assert.DoesNotContain(store, m => m.Id == map.Id);
        await again.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.MapNotInStore);
        Assert.Single((await c.Wald.VersionsAsync(c.WaldId)).BattleMaps);
    }

    [Fact]
    public async Task Copies_of_the_campaigns_own_maps_are_not_offered_back()
    {
        var c = await TwoCampaignsAsync();
        var own = await c.Gruft.PushOneAsync(Map(c.GruftId));
        var copy = await AddedAsync(c.Wald, c.WaldId, own.Id);

        var store = await StoreAsync(c.Gruft, c.GruftId);
        var add = await AddAsync(c.Gruft, c.GruftId, copy.Id);

        Assert.DoesNotContain(store, m => m.Id == copy.Id);
        await add.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.MapNotInStore);
    }

    [Fact]
    public async Task Copies_of_the_campaigns_own_archived_maps_are_not_offered_back_either()
    {
        var c = await TwoCampaignsAsync();
        var own = await c.Gruft.PushOneAsync(Map(c.GruftId));
        var copy = await AddedAsync(c.Wald, c.WaldId, own.Id);
        await c.Gruft.PushOneAsync(Map(c.GruftId, own.Id, 1, HallData(archivedAt: DateTimeOffset.UtcNow)));

        var store = await StoreAsync(c.Gruft, c.GruftId);

        Assert.DoesNotContain(store, m => m.Id == copy.Id);
    }

    [Fact]
    public async Task Archived_maps_are_not_offered_and_cannot_be_added()
    {
        var c = await TwoCampaignsAsync();
        var map = await c.Gruft.PushOneAsync(Map(c.GruftId, data: HallData(archivedAt: DateTimeOffset.UtcNow)));

        var store = await StoreAsync(c.Wald, c.WaldId);
        var add = await AddAsync(c.Wald, c.WaldId, map.Id);

        Assert.DoesNotContain(store, m => m.Id == map.Id);
        await add.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.MapNotInStore);
    }

    [Fact]
    public async Task Own_and_unknown_maps_cannot_be_added()
    {
        var c = await TwoCampaignsAsync();
        var own = await c.Wald.PushOneAsync(Map(c.WaldId));

        await (await AddAsync(c.Wald, c.WaldId, own.Id)).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.MapNotInStore);
        await (await AddAsync(c.Wald, c.WaldId, Guid.NewGuid())).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.MapNotInStore);
    }

    [Fact]
    public async Task An_archived_copy_is_offered_and_comes_back_instead_of_a_new_one()
    {
        var c = await TwoCampaignsAsync();
        var map = await c.Gruft.PushOneAsync(Map(c.GruftId, data: HallData("Thronsaal")));
        var copy = await AddedAsync(c.Wald, c.WaldId, map.Id);
        var archived = await c.Wald.PushOneAsync(Map(c.WaldId, copy.Id, 1, HallData("Thronsaal", map.Id, DateTimeOffset.UtcNow)));
        Assert.Equal(SyncOutcome.Saved, archived.Outcome);

        var offered = Assert.Single(await StoreAsync(c.Wald, c.WaldId), m => m.Id == map.Id);
        var back = await AddedAsync(c.Wald, c.WaldId, map.Id);

        Assert.True(offered.HasArchivedCopy);
        Assert.Equal((copy.Id, 3, (DateTimeOffset?)null), (back.Id, back.Version, back.Map!.ArchivedAt));
        Assert.Equal(map.Id, back.Map.CopiedFromMapId);
        Assert.Single((await c.Wald.VersionsAsync(c.WaldId)).BattleMaps);
        Assert.DoesNotContain(await StoreAsync(c.Wald, c.WaldId), m => m.Id == map.Id);
    }

    [Fact]
    public async Task Adding_a_map_twice_at_once_makes_one_copy()
    {
        var c = await TwoCampaignsAsync();
        var map = await c.Gruft.PushOneAsync(Map(c.GruftId));

        var responses = await Task.WhenAll(Enumerable.Range(0, 3).Select(_ => AddAsync(c.Wald, c.WaldId, map.Id)));

        Assert.Equal(1, responses.Count(r => r.StatusCode == HttpStatusCode.OK));
        Assert.All(responses.Where(r => r.StatusCode != HttpStatusCode.OK), r => Assert.Equal(HttpStatusCode.Conflict, r.StatusCode));
        Assert.Single((await c.Wald.VersionsAsync(c.WaldId)).BattleMaps);
    }

    [Fact]
    public async Task The_store_is_for_dm_members_only()
    {
        var c = await TwoCampaignsAsync();
        var player = await fixture.App.CreatePersonAsync("Brom");
        await player.JoinAsync((await c.Wald.GetCampaignAsync(c.WaldId)).JoinCode!);
        var map = await c.Gruft.PushOneAsync(Map(c.GruftId));

        Assert.Equal(HttpStatusCode.Forbidden, (await player.Client.GetAsync($"/api/campaigns/{c.WaldId}/map-store")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AddAsync(player, c.WaldId, map.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await AddAsync(c.Gruft, c.WaldId, map.Id)).StatusCode);
    }
}
