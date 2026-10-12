using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// Who may reach the encounter routes (knowledge/domain/encounter.md, session.md):
// `dm` members prepare, only the session DM runs a fight, members see the board.
[Collection("App")]
public sealed class EncounterAccessTests(AppFixture fixture)
{
    [Fact]
    public async Task Encounter_routes_refuse_non_members()
    {
        var table = await CreateTableAsync();
        var outsider = await fixture.App.CreatePersonAsync("Fremd");
        var campaign = $"/api/campaigns/{table.CampaignId}";

        var list = await outsider.Client.GetAsync($"{campaign}/encounters");
        var import = await outsider.Client.PostAsJsonAsync($"{campaign}/encounters/import", new { }, Json);
        var board = await outsider.Client.GetAsync($"{campaign}/encounters/{Guid.NewGuid()}/board");

        Assert.Equal(
            [HttpStatusCode.Forbidden, HttpStatusCode.Forbidden, HttpStatusCode.Forbidden],
            [list.StatusCode, import.StatusCode, board.StatusCode]);
    }

    [Fact]
    public async Task Players_cannot_see_or_import_prepared_encounters()
    {
        var table = await CreateTableAsync();
        var campaign = $"/api/campaigns/{table.CampaignId}";

        var list = await table.Player.Client.GetAsync($"{campaign}/encounters");
        var import = await table.Player.Client.PostAsJsonAsync($"{campaign}/encounters/import", new { }, Json);

        Assert.Equal([HttpStatusCode.Forbidden, HttpStatusCode.Forbidden], [list.StatusCode, import.StatusCode]);
    }

    // The default DM created the campaign and can manage the session, but runs no fight
    // in a session someone else leads; neither does any other `dm` member.
    [Fact]
    public async Task Only_the_session_dm_starts_and_ends_encounters()
    {
        var table = await CreateTableAsync();
        var session = await table.Dm.CreateSessionAsync(table.CampaignId, dmUserId: table.SecondDm.Id);
        var encounter = $"/api/campaigns/{table.CampaignId}/sessions/{session.Id}/encounters/{Guid.NewGuid()}";
        var start = new StartEncounterRequest([]);

        foreach (var person in new[] { table.Dm, table.ThirdDm, table.Player })
        {
            var started = await person.Client.PostAsJsonAsync($"{encounter}/start", start, Json);
            var ended = await person.Client.PostAsync($"{encounter}/end", null);

            Assert.Equal(HttpStatusCode.Forbidden, started.StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, ended.StatusCode);
        }
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
