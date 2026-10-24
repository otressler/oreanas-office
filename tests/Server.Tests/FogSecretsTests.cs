using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.StatusTestApi;

namespace OreanasOffice.Server.Tests;

// Everything the stage 4 to 9 events say about a hidden creature or a hidden target stays
// with the DM group (knowledge/features/fog-of-war.md, "Keeping secrets on the wire"), and a
// hand-over of the session DM reloads the board.
public sealed class FogSecretsTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private AppFactory App => fixture.App;

    [Fact]
    public async Task Pings_arrows_statuses_and_removals_of_a_hidden_creature_reach_only_the_DM()
    {
        var fogged = await App.StartFoggedFightAsync(hideOgre: true);
        var fight = fogged.Fight;
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        dm.FenceRow = 2;
        await using var dmSecond = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        // A ping on the hidden ogre and an arrow from it; a ping on a creature in the fog.
        Assert.Null((await dm.PingTokenAsync(fight.EncounterId, fight.Ogre)).Error);
        Assert.Null((await dm.ArrowAsync(fight.EncounterId, fight.Ogre, 4, 4)).Error);
        Assert.Null((await dm.PingTokenAsync(fight.EncounterId, fogged.GoblinA)).Error);
        await dmSecond.WaitForAsync(nameof(ITableClient.Pinged), 2);
        await dmSecond.WaitForAsync(nameof(ITableClient.ArrowDrawn));

        // Statuses, removing and restoring.
        var added = await dm.InvokeAsync<StatusResult>(nameof(ITableHub.AddStatus), new AddStatusRequest(fight.Ogre, Prone, null));
        Assert.Null(added.Error);
        Assert.Null((await dm.InvokeAsync<HubResult>(nameof(ITableHub.RemoveToken), fight.Ogre)).Error);
        Assert.Null((await dm.InvokeAsync<HubResult>(nameof(ITableHub.RestoreToken), fight.Ogre)).Error);
        await dmSecond.WaitForAsync(nameof(ITableClient.TokenRestored));
        await player.FenceAsync(dm, fight.Aria);

        Assert.DoesNotContain(fight.Ogre.ToString(), player.Everything);
        Assert.DoesNotContain(fogged.GoblinA.ToString(), player.Everything);
        Assert.Equal([nameof(ITableClient.TokenMoved)], player.Messages.Select(m => m.Method).Where(m => m != nameof(ITableClient.PresenceChanged)).Distinct());

        // The DM's second device got all of it.
        Assert.Single(dmSecond.Of(nameof(ITableClient.TokenStatusesChanged)));
        Assert.Single(dmSecond.Of(nameof(ITableClient.TokenRemoved)));

        // The same things about a creature players see do reach them.
        var visible = await dm.InvokeAsync<StatusResult>(nameof(ITableHub.AddStatus), new AddStatusRequest(fight.Thorin, Prone, null));
        Assert.Null(visible.Error);
        await player.WaitForAsync(nameof(ITableClient.TokenStatusesChanged));
        Assert.Null((await dm.InvokeAsync<HubResult>(nameof(ITableHub.RemoveToken), fight.Aria)).Error);
        await player.WaitForAsync(nameof(ITableClient.TokenRemoved));
        Assert.Null((await dm.InvokeAsync<HubResult>(nameof(ITableHub.RestoreToken), fight.Aria)).Error);
        await player.WaitForAsync(nameof(ITableClient.TokenRestored));

        // Once the ogre is revealed, a ping on it is for everyone.
        Assert.Null((await dm.SetHiddenAsync(fight.EncounterId, false, fight.Ogre)).Error);
        await using var yara = await FogTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        Assert.Null((await yara.PingTokenAsync(fight.EncounterId, fight.Ogre)).Error);
        await player.WaitForAsync(nameof(ITableClient.Pinged));
        Assert.Equal(fight.Ogre, player.Of(nameof(ITableClient.Pinged))[0].GetProperty("tokenId").GetGuid());
    }

    [Fact]
    public async Task Pings_on_cells_in_the_fog_still_reach_everyone()
    {
        var fogged = await App.StartFoggedFightAsync();
        var fight = fogged.Fight;
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);

        Assert.Null((await dm.PingCellAsync(fight.EncounterId, 6, 2)).Error);

        var ping = (await player.WaitForAsync(nameof(ITableClient.Pinged)))[0];
        Assert.Equal(6, ping.GetProperty("cell").GetProperty("x").GetInt32());
    }

    [Fact]
    public async Task Move_previews_reach_players_only_when_the_token_and_the_whole_target_are_visible()
    {
        var fogged = await App.StartFoggedFightAsync(hideOgre: true);
        var fight = fogged.Fight;
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        dm.FenceRow = 2;

        // The hidden ogre, then the goblin in the fog: nothing for the players.
        Assert.Null((await dm.PreviewAsync(fight.Ogre, 0, 3)).Error);
        Assert.Null((await dm.PreviewAsync(fogged.GoblinA, 6, 2)).Error);
        await player.FenceAsync(dm, fight.Aria);
        Assert.Empty(player.Of(nameof(ITableClient.MovePreviewed)));
        Assert.Empty(player.Of(nameof(ITableClient.MovePreviewCleared)));

        // A device that joins now gets the DM's preview only if it is in the DM group (moving
        // a token cleared the earlier one).
        Assert.Null((await dm.PreviewAsync(fight.Ogre, 0, 3)).Error);
        await using var lateDm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await using var latePlayer = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await lateDm.WaitForAsync(nameof(ITableClient.MovePreviewed));
        await latePlayer.FenceAsync(dm, fight.Aria);
        Assert.Empty(latePlayer.Of(nameof(ITableClient.MovePreviewed)));

        // A visible token to a revealed target is shown; to a target touching the fog it is
        // taken back, so none stays behind.
        Assert.Null((await dm.PreviewAsync(fight.Aria, 2, 0)).Error);
        var preview = (await player.WaitForAsync(nameof(ITableClient.MovePreviewed)))[0];
        Assert.Equal((fight.Aria, 2, 0), (preview.GetProperty("tokenId").GetGuid(), preview.GetProperty("x").GetInt32(), preview.GetProperty("y").GetInt32()));
        Assert.Null((await dm.PreviewAsync(fight.Aria, 4, 2)).Error);
        var cleared = (await player.WaitForAsync(nameof(ITableClient.MovePreviewCleared)))[0];
        Assert.Equal(fight.Aria, cleared.GetProperty("tokenId").GetGuid());
        Assert.Single(player.Of(nameof(ITableClient.MovePreviewed)));
        Assert.DoesNotContain(fight.Ogre.ToString(), player.Everything);
        Assert.DoesNotContain(fight.Ogre.ToString(), latePlayer.Everything);
    }

    [Fact]
    public async Task A_new_session_DM_makes_both_groups_reload_the_board()
    {
        var fight = await App.StartFightAsync();
        await using var dm = await FogTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await using var player = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);

        var response = await fight.Table.Dm.Client.PutAsJsonAsync(
            $"/api/campaigns/{fight.CampaignId}/sessions/{fight.Table.Session.Id}/dm", new ChangeSessionDmRequest(fight.Table.SecondDm.Id), Json);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        foreach (var device in new[] { dm, player })
        {
            Assert.Equal(fight.EncounterId, (await device.WaitForAsync(nameof(ITableClient.ReloadBoard)))[0].GetGuid());
        }
    }
}
