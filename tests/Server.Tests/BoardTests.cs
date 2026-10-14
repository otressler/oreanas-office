using System.Net;
using System.Net.Http.Json;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Rules;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// GET /encounters/{id}/board: `dm` members see every encounter, everyone else only the
// running one (knowledge/domain/encounter.md, "Who does what").
[Collection("App")]
public sealed class BoardTests(AppFixture fixture)
{
    [Fact]
    public async Task Players_see_the_board_only_while_the_fight_runs()
    {
        var table = await fixture.App.CreateEncounterTableAsync();

        var beforeStart = await table.Player.GetBoardAsync(table.CampaignId, table.Encounter.Id);
        await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        var running = await table.Player.GetBoardAsync(table.CampaignId, table.Encounter.Id);
        await table.Dm.EndEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        var afterEnd = await table.Player.GetBoardAsync(table.CampaignId, table.Encounter.Id);

        Assert.Equal(HttpStatusCode.NotFound, beforeStart.StatusCode);
        Assert.Equal(EncounterStatus.Active, (await running.ReadAsync<BoardStateResponse>(HttpStatusCode.OK)).Status);
        Assert.Equal(HttpStatusCode.NotFound, afterEnd.StatusCode);
    }

    [Fact]
    public async Task Dm_members_see_prepared_and_ended_encounters()
    {
        var table = await fixture.App.CreateEncounterTableAsync();

        var ready = await (await table.SecondDm.GetBoardAsync(table.CampaignId, table.Encounter.Id))
            .ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
        await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        await table.Dm.EndEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);
        var ended = await (await table.SecondDm.GetBoardAsync(table.CampaignId, table.Encounter.Id))
            .ReadAsync<BoardStateResponse>(HttpStatusCode.OK);

        Assert.Equal((EncounterStatus.Ready, (Guid?)null, false), (ready.Status, ready.SessionId, ready.IsSessionDm));
        Assert.Equal((EncounterStatus.Ended, table.Session.Id, false), (ended.Status, ended.SessionId, ended.IsSessionDm));
    }

    [Fact]
    public async Task The_board_of_another_campaign_or_an_unknown_encounter_is_not_found()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var otherCampaign = await table.Dm.CreateCampaignAsync("Andere Runde");

        var elsewhere = await table.Dm.GetBoardAsync(otherCampaign.Id, table.Encounter.Id);
        var unknown = await table.Dm.GetBoardAsync(table.CampaignId, Guid.NewGuid());

        Assert.Equal(HttpStatusCode.NotFound, elsewhere.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    // Only the session DM runs the board; the default DM and other `dm` members watch.
    [Fact]
    public async Task Only_the_session_dm_is_told_they_run_the_board()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        await table.Dm.StartEncounterAsync(table.CampaignId, table.Session.Id, table.Encounter.Id);

        var asSessionDm = await ReadBoardAsync(table.Dm, table);
        var asOtherDm = await ReadBoardAsync(table.SecondDm, table);
        var asPlayer = await ReadBoardAsync(table.Player, table);

        Assert.Equal([true, false, false], new[] { asSessionDm, asOtherDm, asPlayer }.Select(b => b.IsSessionDm));
    }

    // Creatures first, then characters, each sorted by label. Characters carry their
    // owner and current name, and a colour by the order they joined the campaign, also
    // counting characters that sit this fight out.
    [Fact]
    public async Task The_board_lists_creatures_then_characters()
    {
        var table = await fixture.App.CreateEncounterTableAsync();
        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin", CreatureSize.Small);
        await table.Player.CreateCharacterAsync(table.CampaignId, "Zuschauer");
        var aria = await table.SecondDm.CreateCharacterAsync(table.CampaignId, "Aria", CreatureSize.Large);
        await table.Dm.StartEncounterAsync(
            table.CampaignId,
            table.Session.Id,
            table.Encounter.Id,
            new CharacterPlacement(thorin.Id, 0, 1),
            new CharacterPlacement(aria.Id, 3, 1));
        await table.Player.Client.PutAsJsonAsync(
            $"/api/campaigns/{table.CampaignId}/characters/{thorin.Id}", new CharacterRequest("Thorin II", CreatureSize.Small), Json);

        var board = await ReadBoardAsync(table.Player, table);

        Assert.Equal(
            (table.Encounter.Id, table.CampaignId, (Guid?)table.Session.Id, "Klamm", EncounterStatus.Active),
            (board.EncounterId, board.CampaignId, board.SessionId, board.Name, board.Status));
        Assert.Equal(
            (table.Encounter.BattleMapId, "Klamm", 8, 5, (BoardBackground?)null, 30),
            (board.Map.Id, board.Map.Name, board.Map.Width, board.Map.Height, board.Map.Background, board.Map.Layout.Cells.Count));
        Assert.Equal(
            [
                (TokenKind.Creature, null, "Goblin 1", 5, 1, 1m, CreatureSize.Small, null),
                (TokenKind.Creature, null, "Goblin 2", 6, 1, 1m, CreatureSize.Small, null),
                (TokenKind.Creature, null, "Oger 1", 1, 3, 0m, CreatureSize.Large, null),
                (TokenKind.Character, (Guid?)table.SecondDm.Id, "Aria", 3, 1, 0.5m, CreatureSize.Large, 2),
                (TokenKind.Character, (Guid?)table.Player.Id, "Thorin II", 0, 1, 0m, CreatureSize.Small, (int?)0),
            ],
            board.Tokens.Select(t => (t.Kind, t.OwnerUserId, t.Label, t.X, t.Y, t.Elevation, t.Size, t.ColorIndex)));
        Assert.All(board.Tokens.Where(t => t.Kind == TokenKind.Creature), t => Assert.Null(t.CharacterId));
        Assert.Equal([aria.Id, thorin.Id], board.Tokens.Where(t => t.Kind == TokenKind.Character).Select(t => t.CharacterId));
        Assert.All(board.Tokens.Where(t => t.Kind == TokenKind.Character), t => Assert.Null(t.CreatureTypeId));

        // The setup screen colours characters from the character list; both must agree.
        var characters = await table.Player.Client.GetFromJsonAsync<List<CharacterResponse>>(
            $"/api/campaigns/{table.CampaignId}/characters", Json);
        Assert.Equal(
            board.Tokens.Where(t => t.Kind == TokenKind.Character).Select(t => (t.CharacterId, t.ColorIndex)),
            characters!.Where(c => c.Id == aria.Id || c.Id == thorin.Id).OrderBy(c => c.Name).Select(c => ((Guid?)c.Id, (int?)c.ColorIndex)));
    }

    private static async Task<BoardStateResponse> ReadBoardAsync(Person person, EncounterTable table) =>
        await (await person.GetBoardAsync(table.CampaignId, table.Encounter.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
}
