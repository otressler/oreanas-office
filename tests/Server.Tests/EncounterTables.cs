using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Sessions;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// A table ready for a fight: the default DM Oreana runs the active session, Yara is
// another `dm` member, Brom a player, and the gorge map (TestMaps.Gorge) is imported
// as a Ready encounter.
public sealed record EncounterTable(
    Person Dm, Person SecondDm, Person Player, Guid CampaignId, SessionResponse Session, EncounterSummaryResponse Encounter);

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
}
