using System.Net;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Sessions;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// A table ready for a fight: the default DM Oreana runs the active session, Yara is
// another `dm` member, Brom a player, and the gorge map (TestMaps.Gorge) is imported
// as a Ready encounter.
public sealed record EncounterTable(
    Person Dm, Person SecondDm, Person Player, Guid CampaignId, SessionResponse Session, EncounterSummaryResponse Encounter);

// The gorge fight running (TestMaps.Gorge): Brom's Thorin at (0, 0), Yara's Aria at
// (0, 2), the small goblin at (5, 1) and the Large ogre at (1, 3). Ids of their tokens.
public sealed record RunningFight(EncounterTable Table, Guid Thorin, Guid Aria, Guid Goblin, Guid Ogre)
{
    public Guid CampaignId => Table.CampaignId;

    public Guid EncounterId => Table.Encounter.Id;
}

public static class EncounterTables
{
    public static async Task<EncounterTable> CreateEncounterTableAsync(this AppFactory app, bool activateSession = true)
    {
        var dm = await app.CreatePersonAsync("Oreana");
        var secondDm = await app.CreatePersonAsync("Yara");
        var player = await app.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        await secondDm.JoinAsync(campaign.JoinCode!);
        await player.JoinAsync(campaign.JoinCode!);
        await dm.PromoteAsync(campaign.Id, secondDm.Id);

        var session = await dm.CreateSessionAsync(campaign.Id);
        if (activateSession)
        {
            session = await dm.ActivateSessionAsync(campaign.Id, session.Id);
        }

        var encounter = await dm.ImportMapAsync(campaign.Id);
        return new EncounterTable(dm, secondDm, player, campaign.Id, session, encounter);
    }

    public static async Task<RunningFight> StartFightAsync(this AppFactory app)
    {
        var table = await app.CreateEncounterTableAsync();
        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");
        var aria = await table.SecondDm.CreateCharacterAsync(table.CampaignId, "Aria");
        var started = await table.Dm.StartEncounterAsync(
            table.CampaignId,
            table.Session.Id,
            table.Encounter.Id,
            new CharacterPlacement(thorin.Id, 0, 0),
            new CharacterPlacement(aria.Id, 0, 2));
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);

        var board = await (await table.Dm.GetBoardAsync(table.CampaignId, table.Encounter.Id))
            .ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
        return new RunningFight(
            table,
            board.Tokens.Single(t => t.CharacterId == thorin.Id).Id,
            board.Tokens.Single(t => t.CharacterId == aria.Id).Id,
            board.Tokens.Single(t => (t.X, t.Y) == (5, 1)).Id,
            board.Tokens.Single(t => (t.X, t.Y) == (1, 3)).Id);
    }
}
