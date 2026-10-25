using System.Net;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Sync;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests;

public static class MapDeleteTestApi
{
    public static Task<HttpResponseMessage> DeleteMapAsync(this Person person, Guid campaignId, Guid mapId) =>
        person.Client.DeleteAsync($"/api/campaigns/{campaignId}/maps/{mapId}");

    // Archives the map as the server has it now.
    public static async Task ArchiveMapAsync(this Person dm, Guid campaignId, Guid mapId)
    {
        var map = await dm.FetchOneAsync(campaignId, mapId);
        var result = await dm.PushOneAsync(Map(campaignId, mapId, map.Version, map.Map! with { ArchivedAt = DateTimeOffset.UtcNow }));
        Assert.Equal(SyncOutcome.Saved, result.Outcome);
    }
}

// Deleting an archived map (knowledge/domain/battle-map.md, "Deleting"). The images it takes
// along are in Images/BackgroundDeleteTests.
public sealed class MapDeleteTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private async Task<(Person Dm, Guid CampaignId)> DmAsync(string campaign = "Die Gruft")
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        return (dm, (await dm.CreateCampaignAsync(campaign)).Id);
    }

    [Fact]
    public async Task Deleting_an_archived_map_takes_its_unplayed_encounters_along()
    {
        var (dm, campaignId) = await DmAsync();
        var session = await dm.CreateSessionAsync(campaignId);
        var pushed = await dm.PushAsync(
            Map(campaignId, data: HallData(archivedAt: DateTimeOffset.UtcNow)), Map(campaignId), CreatureType(campaignId));
        var (mapId, otherMapId, typeId) = (pushed[0].Id, pushed[1].Id, pushed[2].Id);
        var encounters = await dm.PushAsync(
            Encounter(campaignId, session.Id, mapId, tokens: [Token(typeId, 0, 0)]),
            Encounter(campaignId, session.Id, mapId, name: "Rückweg", status: EncounterStatus.Ready, archivedAt: DateTimeOffset.UtcNow),
            Encounter(campaignId, session.Id, otherMapId, name: "Woanders"));

        var response = await dm.DeleteMapAsync(campaignId, mapId);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var versions = await dm.VersionsAsync(campaignId);
        Assert.Equal([otherMapId], versions.BattleMaps.Select(v => v.Id));
        Assert.Equal([encounters[2].Id], versions.Encounters.Select(v => v.Id));
        Assert.Equal([typeId], versions.CreatureTypes.Select(v => v.Id));
        Assert.Equal(HttpStatusCode.NotFound, (await dm.DeleteMapAsync(campaignId, mapId)).StatusCode);
    }

    [Fact]
    public async Task A_map_that_is_not_archived_stays()
    {
        var (dm, campaignId) = await DmAsync();
        var map = await dm.PushOneAsync(Map(campaignId));

        await (await dm.DeleteMapAsync(campaignId, map.Id)).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.MapNotArchived);

        Assert.Single((await dm.VersionsAsync(campaignId)).BattleMaps);
    }

    [Fact]
    public async Task A_map_with_a_running_or_ended_fight_stays_with_all_its_encounters()
    {
        var (dm, campaignId) = await DmAsync();
        var session = await dm.CreateSessionAsync(campaignId);
        var fight = await dm.ImportMapAsync(campaignId, session.Id);
        var draft = await dm.PushOneAsync(Encounter(campaignId, session.Id, fight.BattleMapId, name: "Später"));
        await dm.ActivateSessionAsync(campaignId, session.Id);
        Assert.Equal(HttpStatusCode.OK, (await dm.StartEncounterAsync(campaignId, session.Id, fight.Id)).StatusCode);
        await dm.ArchiveMapAsync(campaignId, fight.BattleMapId);

        var whileRunning = await dm.DeleteMapAsync(campaignId, fight.BattleMapId);
        Assert.Equal(HttpStatusCode.OK, (await dm.EndEncounterAsync(campaignId, session.Id, fight.Id)).StatusCode);
        var afterTheEnd = await dm.DeleteMapAsync(campaignId, fight.BattleMapId);

        await whileRunning.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.MapPlayed);
        await afterTheEnd.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.MapPlayed);
        var versions = await dm.VersionsAsync(campaignId);
        Assert.Equal([fight.BattleMapId], versions.BattleMaps.Select(v => v.Id));
        Assert.Equal(new[] { fight.Id, draft.Id }.Order(), versions.Encounters.Select(v => v.Id).Order());
    }

    [Fact]
    public async Task A_deleted_map_pushed_again_from_another_device_is_rejected()
    {
        var (dm, campaignId) = await DmAsync();
        var session = await dm.CreateSessionAsync(campaignId);
        var map = await dm.PushOneAsync(Map(campaignId, data: HallData(archivedAt: DateTimeOffset.UtcNow)));
        Assert.Equal(HttpStatusCode.NoContent, (await dm.DeleteMapAsync(campaignId, map.Id)).StatusCode);

        var results = await dm.PushAsync(
            Map(campaignId, map.Id, 1, HallData("Halle, geändert", archivedAt: DateTimeOffset.UtcNow)),
            Encounter(campaignId, session.Id, map.Id));

        Assert.Equal((SyncOutcome.Rejected, ApiErrorCode.ItemNotFound), (results[0].Outcome, results[0].Error?.Code));
        Assert.Equal(SyncOutcome.Rejected, results[1].Outcome);
        Assert.Empty((await dm.VersionsAsync(campaignId)).BattleMaps);
    }

    [Fact]
    public async Task Store_copies_of_a_deleted_map_stay()
    {
        var (gruft, gruftId) = await DmAsync();
        var (wald, waldId) = await DmAsync("Der Wald");
        var map = await gruft.PushOneAsync(Map(gruftId, data: HallData("Thronsaal")));
        var copy = await (await wald.Client.PostAsync($"/api/campaigns/{waldId}/map-store/{map.Id}", null))
            .ReadAsync<SyncServerItem>(HttpStatusCode.OK);
        await gruft.ArchiveMapAsync(gruftId, map.Id);

        Assert.Equal(HttpStatusCode.NoContent, (await gruft.DeleteMapAsync(gruftId, map.Id)).StatusCode);

        var kept = await wald.FetchOneAsync(waldId, copy.Id);
        Assert.Equal(("Thronsaal", map.Id), (kept.Map!.Name, kept.Map.CopiedFromMapId));
    }

    [Fact]
    public async Task Only_dm_members_delete_and_only_maps_of_their_campaign()
    {
        var (dm, campaignId) = await DmAsync();
        var (otherDm, otherCampaignId) = await DmAsync("Der Wald");
        var player = await fixture.App.CreatePersonAsync("Brom");
        await player.JoinAsync((await dm.GetCampaignAsync(campaignId)).JoinCode!);
        var map = await dm.PushOneAsync(Map(campaignId, data: HallData(archivedAt: DateTimeOffset.UtcNow)));

        Assert.Equal(HttpStatusCode.Forbidden, (await player.DeleteMapAsync(campaignId, map.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await otherDm.DeleteMapAsync(campaignId, map.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await otherDm.DeleteMapAsync(otherCampaignId, map.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await dm.DeleteMapAsync(campaignId, Guid.NewGuid())).StatusCode);
        Assert.Single((await dm.VersionsAsync(campaignId)).BattleMaps);
    }
}
