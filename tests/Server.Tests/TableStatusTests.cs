using System.Net;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Statuses;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.StatusTestApi;

namespace OreanasOffice.Server.Tests;

// Statuses on tokens at the table (knowledge/features/statuses.md): who puts them on which
// token, who takes them off, levels, save before broadcast. The fight is
// EncounterTables.StartFightAsync: Oreana runs it, Brom plays Thorin, Yara (a `dm` member
// who counts as a player here) plays Aria.
public sealed class TableStatusTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private AppFactory App => fixture.App;

    [Fact]
    public async Task A_status_is_saved_and_reaches_everyone_the_caller_included()
    {
        var fight = await App.StartFightAsync();
        var (dm, player) = (fight.Table.Dm, fight.Table.Player);
        await using var playerDevice = await TableTestClient.JoinAsync(App, player, fight.EncounterId);
        await using var dmDevice = await TableTestClient.JoinAsync(App, dm, fight.EncounterId);

        var result = await playerDevice.AddStatusAsync(fight.Goblin, Prone);

        Assert.Null(result.Error);
        var change = result.Change!;
        Assert.Equal((fight.EncounterId, fight.Goblin), (change.EncounterId, change.TokenId));
        var status = Assert.Single(change.Statuses);
        Assert.Equal((Prone, (int?)null, player.Id), (status.StatusId, status.Level, status.AppliedByUserId));
        Assert.InRange(status.AppliedAt, DateTimeOffset.UtcNow.AddMinutes(-1), DateTimeOffset.UtcNow.AddMinutes(1));
        Assert.Equal(
            [new StatusDefinitionView(Prone, "prone", "Liegend", false, "/statuses/prone.webp", null, null)],
            change.Definitions);
        AssertSameChange(change, await dmDevice.NextStatusesAsync());
        AssertSameChange(change, await playerDevice.NextStatusesAsync());

        // Saved: a reload shows it to everyone.
        foreach (var person in new[] { dm, player, fight.Table.SecondDm })
        {
            var board = await person.BoardAsync(fight);
            Assert.Equal(change.Statuses, board.Tokens.Single(t => t.Id == fight.Goblin).Statuses);
            Assert.Equal(change.Definitions, board.Statuses);
            Assert.All(board.Tokens.Where(t => t.Id != fight.Goblin), t => Assert.Empty(t.Statuses));
        }
    }

    // Other `dm` members count as players at the table (knowledge/domain/session.md).
    [Fact]
    public async Task Players_put_statuses_on_their_own_characters_and_on_creatures()
    {
        var fight = await App.StartFightAsync();
        await using var brom = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var yara = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        await using var oreana = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        StatusResult[] allowed =
        [
            await brom.AddStatusAsync(fight.Thorin, Prone),
            await brom.AddStatusAsync(fight.Ogre, Prone),
            await yara.AddStatusAsync(fight.Aria, Prone),
            await yara.AddStatusAsync(fight.Goblin, Prone),
            await oreana.AddStatusAsync(fight.Thorin, Poisoned),
            await oreana.AddStatusAsync(fight.Aria, Poisoned),
        ];
        StatusResult[] refused =
        [
            await brom.AddStatusAsync(fight.Aria, Poisoned),
            await yara.AddStatusAsync(fight.Thorin, Exhaustion),
        ];

        Assert.All(allowed, r => Assert.Null(r.Error));
        Assert.All(refused, r => Assert.Equal(new StatusResult(ApiErrorCode.NotYourToken, null), r));
        var board = await fight.Table.Dm.BoardAsync(fight);
        Assert.Equal([Prone, Poisoned], board.Tokens.Single(t => t.Id == fight.Thorin).Statuses.Select(s => s.StatusId));
        Assert.Equal([Prone, Poisoned], board.Tokens.Single(t => t.Id == fight.Aria).Statuses.Select(s => s.StatusId));
    }

    [Fact]
    public async Task The_session_DM_takes_off_any_status_players_only_their_own()
    {
        var fight = await App.StartFightAsync();
        await using var brom = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var yara = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        await using var oreana = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await brom.AddStatusAsync(fight.Goblin, Prone);
        await yara.AddStatusAsync(fight.Goblin, Poisoned);
        await oreana.AddStatusAsync(fight.Thorin, Exhaustion);

        var notBroms = await brom.RemoveStatusAsync(fight.Goblin, Poisoned);
        var notOnThorinsOwn = await brom.RemoveStatusAsync(fight.Thorin, Exhaustion);
        var broms = await brom.RemoveStatusAsync(fight.Goblin, Prone);
        var gone = await brom.RemoveStatusAsync(fight.Goblin, Prone);
        var byDm = await oreana.RemoveStatusAsync(fight.Goblin, Poisoned);

        Assert.Equal(new StatusResult(ApiErrorCode.NotYourStatus, null), notBroms);
        Assert.Equal(new StatusResult(ApiErrorCode.NotYourStatus, null), notOnThorinsOwn);
        Assert.Equal([Poisoned], broms.Change!.Statuses.Select(s => s.StatusId));
        Assert.Equal(new StatusResult(ApiErrorCode.StatusNotFound, null), gone);
        Assert.Empty(byDm.Change!.Statuses);
        Assert.Empty(byDm.Change.Definitions);

        // Yara hears the three additions and both removals, nothing for the refused calls.
        var heard = new List<TokenStatusesChangedEvent>();
        for (var i = 0; i < 5; i++)
        {
            heard.Add(await yara.NextStatusesAsync());
        }

        Assert.Equal(
            [[Prone], [Prone, Poisoned], [Exhaustion], [Poisoned], []],
            heard.Select(h => h.Statuses.Select(s => s.StatusId).ToArray()));
        Assert.Empty((await fight.Table.Dm.BoardAsync(fight)).Tokens.Single(t => t.Id == fight.Goblin).Statuses);
    }

    // Exhaustion has levels 1 to 6; whoever may take a status off may change its level.
    [Fact]
    public async Task Levels_go_from_one_to_six_on_statuses_with_levels_only()
    {
        var fight = await App.StartFightAsync();
        await using var brom = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var yara = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        await using var oreana = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        var defaultLevel = await brom.AddStatusAsync(fight.Thorin, Exhaustion);
        var given = await yara.AddStatusAsync(fight.Aria, Exhaustion, 3);
        StatusResult[] invalid =
        [
            await brom.AddStatusAsync(fight.Goblin, Exhaustion, 7),
            await brom.AddStatusAsync(fight.Goblin, Exhaustion, 0),
            await brom.AddStatusAsync(fight.Goblin, Prone, 1),
        ];
        await brom.AddStatusAsync(fight.Goblin, Prone);

        var raised = await brom.SetStatusLevelAsync(fight.Thorin, Exhaustion, 2);
        var byDm = await oreana.SetStatusLevelAsync(fight.Aria, Exhaustion, 6);
        var notYours = await brom.SetStatusLevelAsync(fight.Aria, Exhaustion, 1);
        var tooHigh = await brom.SetStatusLevelAsync(fight.Thorin, Exhaustion, 7);
        var noLevels = await brom.SetStatusLevelAsync(fight.Goblin, Prone, 2);
        var missing = await brom.SetStatusLevelAsync(fight.Goblin, Poisoned, 2);

        Assert.Equal(1, Assert.Single(defaultLevel.Change!.Statuses).Level);
        Assert.Equal(3, Assert.Single(given.Change!.Statuses).Level);
        Assert.True(Assert.Single(given.Change.Definitions).HasLevels);
        Assert.All(invalid, r => Assert.Equal(new StatusResult(ApiErrorCode.LevelInvalid, null), r));
        Assert.Equal(2, Assert.Single(raised.Change!.Statuses).Level);
        Assert.Equal(6, Assert.Single(byDm.Change!.Statuses).Level);
        Assert.Equal(ApiErrorCode.NotYourStatus, notYours.Error);
        Assert.Equal(ApiErrorCode.LevelInvalid, tooHigh.Error);
        Assert.Equal(ApiErrorCode.LevelInvalid, noLevels.Error);
        Assert.Equal(ApiErrorCode.StatusNotFound, missing.Error);

        var board = await fight.Table.Player.BoardAsync(fight);
        Assert.Equal(2, board.Tokens.Single(t => t.Id == fight.Thorin).Statuses.Single().Level);
        Assert.Equal(6, board.Tokens.Single(t => t.Id == fight.Aria).Statuses.Single().Level);
    }

    // A custom status shows on the token with its definition for everyone, also for people
    // who don't have it in their status list.
    [Fact]
    public async Task Library_and_the_campaigns_own_statuses_only_each_once()
    {
        var fight = await App.StartFightAsync();
        var other = await App.StartFightAsync();
        var hexed = await fight.Table.Player.CreateStatusOkAsync(fight.CampaignId, "Verhext", await ThorinIdAsync(fight));
        var foreign = await other.Table.Dm.CreateStatusOkAsync(other.CampaignId, "Fremd");
        await using var brom = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var oreana = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        var custom = await oreana.AddStatusAsync(fight.Goblin, hexed.Id);
        var again = await brom.AddStatusAsync(fight.Goblin, hexed.Id);
        var unknown = await brom.AddStatusAsync(fight.Goblin, Guid.NewGuid());
        var otherCampaigns = await brom.AddStatusAsync(fight.Goblin, foreign.Id);

        Assert.Equal([hexed], custom.Change!.Definitions);
        Assert.Equal(new StatusResult(ApiErrorCode.StatusAlreadySet, null), again);
        Assert.Equal(new StatusResult(ApiErrorCode.StatusNotFound, null), unknown);
        Assert.Equal(new StatusResult(ApiErrorCode.StatusNotFound, null), otherCampaigns);
        Assert.Equal([hexed], (await fight.Table.SecondDm.BoardAsync(fight)).Statuses);
    }

    // Two people putting on the same status at once: one wins, the other is told it's set.
    [Fact]
    public async Task The_same_status_put_on_at_once_is_set_once()
    {
        var fight = await App.StartFightAsync();
        await using var brom = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var yara = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        await using var oreana = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        for (var round = 0; round < 5; round++)
        {
            var status = StatusLibrary.Conditions[round].Id;
            var results = await Task.WhenAll(
                brom.AddStatusAsync(fight.Ogre, status),
                yara.AddStatusAsync(fight.Ogre, status),
                oreana.AddStatusAsync(fight.Ogre, status));

            Assert.Single(results, r => r.Error is null);
            Assert.Equal(2, results.Count(r => r.Error == ApiErrorCode.StatusAlreadySet));
        }

        Assert.Equal(5, (await fight.Table.Dm.BoardAsync(fight)).Tokens.Single(t => t.Id == fight.Ogre).Statuses.Count);
    }

    [Fact]
    public async Task Strangers_and_ended_fights_get_errors()
    {
        var fight = await App.StartFightAsync();
        var stranger = await App.CreatePersonAsync("Fremder");
        await using var strangerDevice = await TableTestClient.ConnectAsync(App, stranger);
        await using var oreana = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await oreana.AddStatusAsync(fight.Goblin, Prone);

        Assert.Equal(ApiErrorCode.TokenNotFound, (await strangerDevice.AddStatusAsync(fight.Goblin, Poisoned)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await strangerDevice.RemoveStatusAsync(fight.Goblin, Prone)).Error);
        Assert.Equal(ApiErrorCode.TokenNotFound, (await oreana.AddStatusAsync(Guid.NewGuid(), Prone)).Error);

        await fight.Table.Dm.EndEncounterAsync(fight.CampaignId, fight.Table.Session.Id, fight.EncounterId);

        Assert.Equal(ApiErrorCode.EncounterNotActive, (await oreana.AddStatusAsync(fight.Goblin, Poisoned)).Error);
        Assert.Equal(ApiErrorCode.EncounterNotActive, (await oreana.RemoveStatusAsync(fight.Goblin, Prone)).Error);
        Assert.Equal(ApiErrorCode.EncounterNotActive, (await oreana.SetStatusLevelAsync(fight.Goblin, Prone, 1)).Error);

        // The ended fight keeps its statuses.
        Assert.Equal([Prone], (await fight.Table.Dm.BoardAsync(fight)).Tokens.Single(t => t.Id == fight.Goblin).Statuses.Select(s => s.StatusId));
    }

    private static void AssertSameChange(TokenStatusesChangedEvent expected, TokenStatusesChangedEvent actual)
    {
        Assert.Equal((expected.EncounterId, expected.TokenId), (actual.EncounterId, actual.TokenId));
        Assert.Equal(expected.Statuses, actual.Statuses);
        Assert.Equal(expected.Definitions, actual.Definitions);
    }

    private static async Task<Guid> ThorinIdAsync(RunningFight fight) =>
        (await fight.Table.Dm.BoardAsync(fight)).Tokens.Single(t => t.Id == fight.Thorin).CharacterId!.Value;
}
