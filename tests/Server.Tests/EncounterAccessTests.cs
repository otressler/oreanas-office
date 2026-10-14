using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// Who may reach the encounter routes (knowledge/domain/encounter.md, session.md):
// the session DM prepares and runs its fights, `dm` members see them, members see the board.
[Collection("App")]
public sealed class EncounterAccessTests(AppFixture fixture)
{
    [Fact]
    public async Task Encounter_routes_refuse_non_members()
    {
        var table = await CreateTableAsync();
        var outsider = await fixture.App.CreatePersonAsync("Fremd");
        var session = await table.Dm.CreateSessionAsync(table.CampaignId);
        var campaign = $"/api/campaigns/{table.CampaignId}";

        var sessionRead = await outsider.Client.GetAsync($"{campaign}/sessions/{session.Id}");
        var import = await outsider.Client.PostAsJsonAsync($"{campaign}/sessions/{session.Id}/encounters/import", new { }, Json);
        var board = await outsider.Client.GetAsync($"{campaign}/encounters/{Guid.NewGuid()}/board");

        Assert.Equal(
            [HttpStatusCode.Forbidden, HttpStatusCode.Forbidden, HttpStatusCode.Forbidden],
            [sessionRead.StatusCode, import.StatusCode, board.StatusCode]);
    }

    // The default DM created the campaign and can manage the session, but neither imports
    // into, starts nor ends fights of a session someone else leads; neither does any other
    // `dm` member or a player (knowledge/domain/session.md).
    [Fact]
    public async Task Only_the_session_dm_imports_starts_and_ends_encounters()
    {
        var table = await CreateTableAsync();
        var session = await table.Dm.CreateSessionAsync(table.CampaignId, dmUserId: table.SecondDm.Id);
        var encounters = $"/api/campaigns/{table.CampaignId}/sessions/{session.Id}/encounters";
        var encounter = $"{encounters}/{Guid.NewGuid()}";
        var start = new StartEncounterRequest([]);

        foreach (var person in new[] { table.Dm, table.ThirdDm, table.Player })
        {
            var imported = await person.Client.PostAsJsonAsync($"{encounters}/import", TestMaps.Gorge(), Json);
            var started = await person.Client.PostAsJsonAsync($"{encounter}/start", start, Json);
            var ended = await person.Client.PostAsync($"{encounter}/end", null);

            Assert.Equal(HttpStatusCode.Forbidden, imported.StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, started.StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, ended.StatusCode);
        }

        Assert.Equal(HttpStatusCode.Created, (await table.SecondDm.Client.PostAsJsonAsync($"{encounters}/import", TestMaps.Gorge(), Json)).StatusCode);
    }

    // Players see the session but none of its prepared fights.
    [Fact]
    public async Task Players_see_no_prepared_encounters()
    {
        var table = await CreateTableAsync();
        var session = await table.Dm.CreateSessionAsync(table.CampaignId);
        await table.Dm.ImportMapAsync(table.CampaignId, session.Id);

        var asPlayer = await (await table.Player.Client.GetAsync($"/api/campaigns/{table.CampaignId}/sessions/{session.Id}"))
            .ReadAsync<OreanasOffice.Server.Sessions.SessionResponse>(HttpStatusCode.OK);
        var asOtherDm = await (await table.SecondDm.Client.GetAsync($"/api/campaigns/{table.CampaignId}/sessions/{session.Id}"))
            .ReadAsync<OreanasOffice.Server.Sessions.SessionResponse>(HttpStatusCode.OK);

        Assert.Empty(asPlayer.Encounters);
        Assert.Single(asOtherDm.Encounters);
    }

    // The sample maps go through the import endpoint, so they must bind with the API's
    // strict JSON rules: numbers as numbers, enums as camelCase names.
    [Fact]
    public void Sample_maps_parse_as_import_requests()
    {
        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web) { NumberHandling = JsonNumberHandling.Strict };
        options.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false));
        var files = Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "SampleMaps"), "*.json");

        Assert.Equal(4, files.Length);
        foreach (var file in files)
        {
            var map = JsonSerializer.Deserialize<ImportMapRequest>(File.ReadAllText(file), options)!;

            Assert.InRange(map.Width, 1, BattleMap.MaxSize);
            Assert.InRange(map.Height, 1, BattleMap.MaxSize);
            Assert.NotEmpty(map.Layout.Cells);
            Assert.NotEmpty(map.Creatures!);
        }
    }

    private sealed record Table(Person Dm, Person SecondDm, Person ThirdDm, Person Player, Guid CampaignId);

    private async Task<Table> CreateTableAsync()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var secondDm = await fixture.App.CreatePersonAsync("Yara");
        var thirdDm = await fixture.App.CreatePersonAsync("Zeno");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        foreach (var person in new[] { secondDm, thirdDm, player })
        {
            await person.JoinAsync(campaign.JoinCode!);
        }

        await dm.PromoteAsync(campaign.Id, secondDm.Id);
        await dm.PromoteAsync(campaign.Id, thirdDm.Id);
        return new Table(dm, secondDm, thirdDm, player, campaign.Id);
    }
}
