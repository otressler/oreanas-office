using System.Net;
using OreanasOffice.Server.Encounters;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests.Images;

// The board shows each token's picked portrait or icon as it is now, also in a running
// fight (knowledge/features/token-icons.md, requirement 9).
[Collection("App")]
public sealed class TokenBoardTests(AppFixture fixture)
{
    [Fact]
    public async Task Tokens_carry_the_picked_portrait_or_icon()
    {
        fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateEncounterTableAsync();
        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");
        var aria = await table.SecondDm.CreateCharacterAsync(table.CampaignId, "Aria");
        var ready = await (await table.Dm.GetBoardAsync(table.CampaignId, table.Encounter.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
        var goblinType = ready.Tokens.First(t => t.Label.StartsWith("Goblin", StringComparison.Ordinal)).CreatureTypeId!.Value;
        Assert.All(ready.Tokens, t => Assert.Null(t.ImageUrl));

        var icon = await fixture.App.IconAndWaitAsync(table.Dm, table.CampaignId, goblinType);
        var portrait = await table.Player.UploadOkAsync(table.CampaignId, thorin.Id);
        var started = await table.Dm.StartEncounterAsync(
            table.CampaignId,
            table.Session.Id,
            table.Encounter.Id,
            new CharacterPlacement(thorin.Id, 0, 0),
            new CharacterPlacement(aria.Id, 0, 2));
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);

        var board = await (await table.Player.GetBoardAsync(table.CampaignId, table.Encounter.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);

        Assert.Equal(
            [
                ("Goblin 1", $"/api/assets/{icon.Id}"),
                ("Goblin 2", $"/api/assets/{icon.Id}"),
                ("Oger 1", null),
                ("Aria", null),
                ("Thorin", (string?)$"/api/assets/{portrait.Id}"),
            ],
            board.Tokens.Select(t => (t.Label, t.ImageUrl)));

        // A new pick shows on the next load of the running fight.
        var newer = await table.Player.UploadOkAsync(table.CampaignId, thorin.Id);
        await table.Dm.PickIconAsync(table.CampaignId, goblinType, null);
        var reloaded = await (await table.Player.GetBoardAsync(table.CampaignId, table.Encounter.Id)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);

        Assert.Equal($"/api/assets/{newer.Id}", reloaded.Tokens.Single(t => t.CharacterId == thorin.Id).ImageUrl);
        Assert.All(reloaded.Tokens.Where(t => t.Kind == TokenKind.Creature), t => Assert.Null(t.ImageUrl));
    }
}
