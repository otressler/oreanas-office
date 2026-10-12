using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sessions;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// Starting and ending encounters (knowledge/domain/encounter.md, "Lifecycle" and
// "Starting"), and the DM's list of them.
[Collection("App")]
public sealed class EncounterRunTests(AppFixture fixture)
{
    [Fact]
    public async Task Starting_places_the_characters_and_makes_the_encounter_active()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");
        var aria = await table.SecondDm.CreateCharacterAsync(table.CampaignId, "Aria", CreatureSize.Large);

        var response = await table.Dm.StartEncounterAsync(
            table.CampaignId,
            table.Session.Id,
            table.Encounter.Id,
            new CharacterPlacement(thorin.Id, 0, 0),
            new CharacterPlacement(aria.Id, 2, 1));

        var summary = await response.ReadAsync<EncounterSummaryResponse>(HttpStatusCode.OK);
        Assert.Equal(table.Encounter with { Status = EncounterStatus.Active, SessionId = table.Session.Id }, summary);
        await using var scope = fixture.App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var encounter = await db.Encounters.Include(e => e.Tokens).SingleAsync(e => e.Id == table.Encounter.Id);
        Assert.NotNull(encounter.StartedAt);
        Assert.Null(encounter.EndedAt);
        Assert.Equal(
            [(thorin.Id, 0, 0, 0m, (string?)null), (aria.Id, 2, 1, 0.5m, null)],
            encounter.Tokens
                .Where(t => t.Kind == TokenKind.Character)
                .OrderBy(t => t.X)
                .Select(t => (t.CharacterId!.Value, t.X, t.Y, t.Elevation, t.Label)));
    }

    [Fact]
    public async Task A_fight_can_start_without_characters()
    {
        var table = await fixture.App.CreateEncounterTableAsync();

        var response = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        Assert.Equal(EncounterStatus.Active, (await response.ReadAsync<EncounterSummaryResponse>(HttpStatusCode.OK)).Status);
    }

    // The landing page and the session list link to the running fight.
    [Fact]
    public async Task The_running_fight_shows_on_the_landing_page_and_the_session_list()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        var expected = new ActiveEncounterSummary(table.Encounter.Id, "Klamm");

        var campaigns = await (await table.Player.Client.GetAsync("/api/campaigns"))
            .ReadAsync<List<CampaignSummaryResponse>>(HttpStatusCode.OK);
        var sessions = await (await table.Player.Client.GetAsync($"/api/campaigns/{table.CampaignId}/sessions"))
            .ReadAsync<List<SessionResponse>>(HttpStatusCode.OK);

        Assert.Equal(expected, campaigns.Single(c => c.Id == table.CampaignId).ActiveSession?.ActiveEncounter);
        Assert.Equal(expected, sessions.Single().ActiveEncounter);
    }

    [Fact]
    public async Task A_fight_starts_only_in_an_active_session()
    {
        var table = await fixture.App.CreateEncounterTableAsync(activateSession: false);
        var planned = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        await table.Dm.Client.PostAsync($"/api/campaigns/{table.CampaignId}/sessions/{table.Session.Id}/end", null);
        var ended = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        await planned.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.SessionNotActive);
        await ended.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.SessionNotActive);
    }

    [Fact]
    public async Task Only_a_ready_encounter_starts()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        var again = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        await table.Dm.EndEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        var afterEnd = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        await again.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.EncounterNotReady);
        await afterEnd.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.EncounterNotReady);
    }

    [Fact]
    public async Task A_session_runs_one_fight_at_a_time()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var second = await table.Dm.ImportMapAsync(table.CampaignId, TestMaps.Gorge() with { Name = "Zweite Klamm" });
        await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        var whileFirstRuns = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, second.Id);
        await table.Dm.EndEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        var afterFirstEnded = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, second.Id);

        await whileFirstRuns.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.AnotherEncounterActive);
        Assert.Equal(HttpStatusCode.OK, afterFirstEnded.StatusCode);
    }

    [Fact]
    public async Task Starting_two_fights_at_once_leaves_exactly_one_active()
    {
        // Several rounds, so both outcomes of the race (the check sees the other
        // encounter, or the unique index rejects the second update) are likely to occur.
        for (var round = 0; round < 5; round++)
        {
            var table = await fixture.App.CreateEncounterTableAsync();
            var second = await table.Dm.ImportMapAsync(table.CampaignId, TestMaps.Gorge() with { Name = "Zweite Klamm" });

            var responses = await Task.WhenAll(
                table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id),
                table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, second.Id));

            Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
            await Assert.Single(responses, r => r.StatusCode != HttpStatusCode.OK)
                .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.AnotherEncounterActive);
            await using var scope = fixture.App.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(1, await db.Encounters.CountAsync(e => e.SessionId == table.Session.Id && e.Status == EncounterStatus.Active));
        }
    }

    [Fact]
    public async Task An_encounter_of_another_campaign_is_not_found()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var otherCampaign = await table.Dm.CreateCampaignAsync("Andere Runde");
        var elsewhere = await table.Dm.ImportMapAsync(otherCampaign.Id);

        var start = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, elsewhere.Id);
        var end = await table.Dm.EndEncounterAsync(table.CampaignId, table.Session.Id, elsewhere.Id);
        var unknown = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, Guid.NewGuid());

        Assert.Equal(
            [HttpStatusCode.NotFound, HttpStatusCode.NotFound, HttpStatusCode.NotFound],
            [start.StatusCode, end.StatusCode, unknown.StatusCode]);
    }

    [Fact]
    public async Task Characters_must_belong_to_the_campaign_and_take_part_once()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");
        var otherCampaign = await table.Dm.CreateCampaignAsync("Andere Runde");
        var stranger = await table.Dm.CreateCharacterAsync(otherCampaign.Id, "Fremder");

        var foreign = await table.Dm.StartEncounterAsync(
            table.CampaignId, table.Session.Id, table.Encounter.Id, new CharacterPlacement(stranger.Id, 0, 0));
        var unknown = await table.Dm.StartEncounterAsync(
            table.CampaignId, table.Session.Id, table.Encounter.Id, new CharacterPlacement(Guid.NewGuid(), 0, 0));
        var twice = await table.Dm.StartEncounterAsync(
            table.CampaignId,
            table.Session.Id,
            table.Encounter.Id,
            new CharacterPlacement(thorin.Id, 0, 0),
            new CharacterPlacement(thorin.Id, 1, 0));

        await foreign.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.CharacterInvalid, "characters[0]");
        await unknown.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.CharacterInvalid, "characters[0]");
        await twice.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.CharacterInvalid, "characters[1]");
        Assert.Equal(EncounterStatus.Ready, (await ListAsync(table)).Single().Status);
    }

    // The placement rule against the creatures and the characters placed before.
    [Theory]
    [InlineData(CreatureSize.Medium, 5, 1, 0)] // on a goblin
    [InlineData(CreatureSize.Medium, 3, 0, 0)] // in the gorge
    [InlineData(CreatureSize.Medium, 7, 0, 0)] // in the wall
    [InlineData(CreatureSize.Medium, 6, 3, 0)] // on the pillar
    [InlineData(CreatureSize.Medium, 8, 0, 0)] // off the map
    [InlineData(CreatureSize.Large, 0, 2, 0)] // half on the ogre
    [InlineData(CreatureSize.Large, 2, 2, 0)] // half in the gorge
    [InlineData(CreatureSize.Medium, 0, 0, 1)] // on the first character
    public async Task Characters_stand_on_free_walkable_cells(CreatureSize size, int x, int y, int index)
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var first = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");
        var second = await table.Player.CreateCharacterAsync(table.CampaignId, "Brigid", size);
        CharacterPlacement[] placements = index == 0
            ? [new(second.Id, x, y)]
            : [new(first.Id, 0, 0), new(second.Id, x, y)];

        var response = await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id, placements);

        await response.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.PlacementInvalid, $"characters[{index}]");
        Assert.Equal(EncounterStatus.Ready, (await ListAsync(table)).Single().Status);
    }

    [Fact]
    public async Task A_character_can_stand_on_the_bridge_over_the_gorge()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var aria = await table.Player.CreateCharacterAsync(table.CampaignId, "Aria", CreatureSize.Large);

        var response = await table.Dm.StartEncounterAsync(
            table.CampaignId, table.Session.Id, table.Encounter.Id, new CharacterPlacement(aria.Id, 3, 1));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Ending_a_fight_ends_it_once()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        var ended = await table.Dm.EndEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        var endedAt = await EndedAtAsync(table.Encounter.Id);
        var again = await table.Dm.EndEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        var expected = table.Encounter with { Status = EncounterStatus.Ended, SessionId = table.Session.Id };
        Assert.Equal(expected, await ended.ReadAsync<EncounterSummaryResponse>(HttpStatusCode.OK));
        Assert.Equal(expected, await again.ReadAsync<EncounterSummaryResponse>(HttpStatusCode.OK));
        Assert.NotNull(endedAt);
        Assert.Equal(endedAt, await EndedAtAsync(table.Encounter.Id));
        Assert.Null((await ListSessionsAsync(table)).Single().ActiveEncounter);
    }

    // A ready encounter belongs to no session yet, so it can't be ended: a conflict,
    // not a 404, as the encounter is part of the campaign.
    [Fact]
    public async Task An_encounter_that_has_not_started_cannot_be_ended()
    {
        var table = await fixture.App.CreateEncounterTableAsync();

        var response = await table.Dm.EndEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        await response.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.EncounterNotActive);
    }

    [Fact]
    public async Task An_encounter_is_ended_only_in_the_session_it_ran_in()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        var otherSession = await table.Dm.CreateSessionAsync(table.CampaignId, "Nächste Woche");

        var response = await table.Dm.EndEncounterAsync(table.CampaignId, otherSession.Id, table.Encounter.Id);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(EncounterStatus.Active, (await ListAsync(table)).Single().Status);
    }

    [Fact]
    public async Task Ending_the_session_ends_its_fight()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var second = await table.Dm.ImportMapAsync(table.CampaignId, TestMaps.Gorge() with { Name = "Zweite Klamm" });
        await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        var response = await table.Dm.Client.PostAsync($"/api/campaigns/{table.CampaignId}/sessions/{table.Session.Id}/end", null);

        var session = await response.ReadAsync<SessionResponse>(HttpStatusCode.OK);
        Assert.Equal((SessionStatus.Ended, (ActiveEncounterSummary?)null), (session.Status, session.ActiveEncounter));
        var encounters = await ListAsync(table);
        Assert.Equal(
            [(second.Id, EncounterStatus.Ready), (table.Encounter.Id, EncounterStatus.Ended)],
            encounters.Select(e => (e.Id, e.Status)).OrderBy(e => e.Status));
        Assert.NotNull(await EndedAtAsync(table.Encounter.Id));
        var campaigns = await (await table.Player.Client.GetAsync("/api/campaigns"))
            .ReadAsync<List<CampaignSummaryResponse>>(HttpStatusCode.OK);
        Assert.Null(campaigns.Single(c => c.Id == table.CampaignId).ActiveSession);
    }

    // Active first, then ready, draft and ended, newest first within each.
    [Fact]
    public async Task The_list_puts_the_running_fight_first()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var ended = table.Encounter;
        var olderReady = await table.Dm.ImportMapAsync(table.CampaignId, TestMaps.Gorge() with { Name = "Älter", Creatures = [] });
        var active = await table.Dm.ImportMapAsync(table.CampaignId, TestMaps.Gorge() with { Name = "Läuft" });
        var newerReady = await table.Dm.ImportMapAsync(table.CampaignId, TestMaps.Gorge() with { Name = "Neuer" });
        await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, ended.Id);
        await table.Dm.EndEncounterAsync(table.CampaignId, table.Session.Id, ended.Id);
        await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, active.Id);

        var list = await ListAsync(table);

        Assert.Equal([active.Id, newerReady.Id, olderReady.Id, ended.Id], list.Select(e => e.Id));
        Assert.Equal([3, 3, 0, 3], list.Select(e => e.CreatureCount));
    }

    private static async Task<List<EncounterSummaryResponse>> ListAsync(EncounterTable table) =>
        await (await table.Dm.Client.GetAsync($"/api/campaigns/{table.CampaignId}/encounters"))
            .ReadAsync<List<EncounterSummaryResponse>>(HttpStatusCode.OK);

    private static async Task<List<SessionResponse>> ListSessionsAsync(EncounterTable table) =>
        await (await table.Player.Client.GetAsync($"/api/campaigns/{table.CampaignId}/sessions"))
            .ReadAsync<List<SessionResponse>>(HttpStatusCode.OK);

    private async Task<DateTimeOffset?> EndedAtAsync(Guid encounterId)
    {
        await using var scope = fixture.App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.Encounters.Where(e => e.Id == encounterId).Select(e => e.EndedAt).SingleAsync();
    }
}
