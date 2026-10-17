using System.Net;
using System.Net.Http.Json;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.StatusTestApi;

namespace OreanasOffice.Server.Tests;

// Pings and arrows (knowledge/features/pings-and-arrows.md): relayed to the others with the
// colour the server sets, checked, rate limited and never saved. The fight is
// EncounterTables.StartFightAsync on the 8×5 gorge: Oreana runs it, Brom plays Thorin (the
// campaign's first character), Yara plays Aria (the second).
public sealed class TablePingTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private const string Gold = "#f5b81c";
    private const string ThorinsRing = "#4da3ff";
    private const string AriasRing = "#4cc76a";
    private const string White = "#ffffff";

    private AppFactory App => fixture.App;

    [Fact]
    public async Task A_ping_reaches_the_others_in_the_colour_of_the_person()
    {
        var fight = await App.StartFightAsync();
        var (dm, player, secondDm) = (fight.Table.Dm, fight.Table.Player, fight.Table.SecondDm);
        var kira = await App.CreatePersonAsync("Kira");
        await kira.JoinAsync((await dm.GetCampaignAsync(fight.CampaignId)).JoinCode!);
        await using var dmDevice = await TableTestClient.JoinAsync(App, dm, fight.EncounterId);
        await using var playerDevice = await TableTestClient.JoinAsync(App, player, fight.EncounterId);
        await using var secondDmDevice = await TableTestClient.JoinAsync(App, secondDm, fight.EncounterId);
        await using var kiraDevice = await TableTestClient.JoinAsync(App, kira, fight.EncounterId);

        var cell = await playerDevice.PingCellAsync(fight.EncounterId, 2, 2);
        var token = await dmDevice.PingAsync(new PingRequest(fight.EncounterId, null, fight.Goblin));
        await secondDmDevice.PingCellAsync(fight.EncounterId, 0, 4);
        await kiraDevice.PingCellAsync(fight.EncounterId, 7, 4);

        Assert.Equal(new HubResult(null), cell);
        Assert.Equal(new HubResult(null), token);
        var bromsPing = new PingedEvent(fight.EncounterId, player.Id, ThorinsRing, new BoardCell(2, 2), null, false);
        var oreanasPing = new PingedEvent(fight.EncounterId, dm.Id, Gold, null, fight.Goblin, false);
        var yarasPing = new PingedEvent(fight.EncounterId, secondDm.Id, AriasRing, new BoardCell(0, 4), null, false);
        var kirasPing = new PingedEvent(fight.EncounterId, kira.Id, White, new BoardCell(7, 4), null, false);

        // Everyone but the sender, in the order sent.
        Assert.Equal([oreanasPing, yarasPing, kirasPing], [await playerDevice.NextPingAsync(), await playerDevice.NextPingAsync(), await playerDevice.NextPingAsync()]);
        Assert.Equal([bromsPing, yarasPing, kirasPing], [await dmDevice.NextPingAsync(), await dmDevice.NextPingAsync(), await dmDevice.NextPingAsync()]);
        Assert.Equal([bromsPing, oreanasPing, yarasPing], [await kiraDevice.NextPingAsync(), await kiraDevice.NextPingAsync(), await kiraDevice.NextPingAsync()]);

        // The board names everyone with the same colours.
        var board = await kira.BoardAsync(fight);
        Assert.Equal(
            [(dm.Id, "Oreana", Gold), (secondDm.Id, "Yara", AriasRing), (player.Id, "Brom", ThorinsRing), (kira.Id, "Kira", White)],
            board.People.Select(p => (p.UserId, p.DisplayName, p.PingColor)));
    }

    [Fact]
    public async Task An_arrow_reaches_the_others_from_a_cell_or_a_token()
    {
        var fight = await App.StartFightAsync();
        var (dm, player) = (fight.Table.Dm, fight.Table.Player);
        await using var dmDevice = await TableTestClient.JoinAsync(App, dm, fight.EncounterId);
        await using var playerDevice = await TableTestClient.JoinAsync(App, player, fight.EncounterId);

        var fromToken = await playerDevice.ArrowAsync(new DrawArrowRequest(fight.EncounterId, null, fight.Thorin, new BoardCell(5, 1)));
        var fromCell = await dmDevice.ArrowAsync(new DrawArrowRequest(fight.EncounterId, new BoardCell(7, 4), null, new BoardCell(0, 0)));

        Assert.Null(fromToken.Error);
        Assert.Null(fromCell.Error);
        Assert.Equal(
            new ArrowDrawnEvent(fight.EncounterId, player.Id, ThorinsRing, null, fight.Thorin, new BoardCell(5, 1), false),
            await dmDevice.NextArrowAsync());
        Assert.Equal(
            new ArrowDrawnEvent(fight.EncounterId, dm.Id, Gold, new BoardCell(7, 4), null, new BoardCell(0, 0), false),
            await playerDevice.NextArrowAsync());
    }

    // A player's colour is their character's picked ring colour, and the session DM's gold
    // wins over a character of their own.
    [Fact]
    public async Task Picked_ring_colours_and_the_session_DMs_gold()
    {
        var table = await App.CreateEncounterTableAsync();
        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");
        var updated = await table.Player.Client.PutAsJsonAsync(
            $"/api/campaigns/{table.CampaignId}/characters/{thorin.Id}", new CharacterRequest("Thorin", CreatureSize.Medium, Color: "#123abc"), Json);
        Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
        var dmsOwn = await table.Dm.CreateCharacterAsync(table.CampaignId, "Wache");
        var started = await table.Dm.StartEncounterAsync(
            table.CampaignId, table.Session.Id, table.Encounter.Id, new CharacterPlacement(thorin.Id, 0, 0), new CharacterPlacement(dmsOwn.Id, 0, 1));
        Assert.Equal(HttpStatusCode.OK, started.StatusCode);
        await using var playerDevice = await TableTestClient.JoinAsync(App, table.Player, table.Encounter.Id);
        await using var dmDevice = await TableTestClient.JoinAsync(App, table.Dm, table.Encounter.Id);

        await playerDevice.PingCellAsync(table.Encounter.Id, 1, 1);
        await dmDevice.PingCellAsync(table.Encounter.Id, 1, 1);

        Assert.Equal("#123abc", (await dmDevice.NextPingAsync()).Color);
        Assert.Equal(Gold, (await playerDevice.NextPingAsync()).Color);
        var board = await table.Player.BoardAsync(table.CampaignId, table.Encounter.Id);
        Assert.Equal("#123abc", board.People.Single(p => p.UserId == table.Player.Id).PingColor);
        Assert.Equal(Gold, board.People.Single(p => p.UserId == table.Dm.Id).PingColor);
    }

    [Fact]
    public async Task Pings_outside_the_map_or_board_are_refused()
    {
        var fight = await App.StartFightAsync();
        var other = await App.StartFightAsync();
        var stranger = await App.CreatePersonAsync("Fremder");
        await using var strangerDevice = await TableTestClient.ConnectAsync(App, stranger);
        await using var player = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        var id = fight.EncounterId;

        HubResult[] targetInvalid =
        [
            await player.PingCellAsync(id, 8, 0),
            await player.PingCellAsync(id, 0, 5),
            await player.PingCellAsync(id, -1, 0),
            await player.PingAsync(new PingRequest(id, null, null)),
            await player.PingAsync(new PingRequest(id, new BoardCell(1, 1), fight.Goblin)),
            await player.ArrowAsync(new DrawArrowRequest(id, new BoardCell(1, 1), null, new BoardCell(8, 4))),
            await player.ArrowAsync(new DrawArrowRequest(id, new BoardCell(1, 1), fight.Thorin, new BoardCell(2, 2))),
            await player.ArrowAsync(new DrawArrowRequest(id, null, null, new BoardCell(2, 2))),
            await player.ArrowAsync(new DrawArrowRequest(id, null, fight.Thorin, null!)),
        ];
        HubResult[] tokenNotFound =
        [
            await player.PingAsync(new PingRequest(id, null, other.Goblin)),
            await player.PingAsync(new PingRequest(id, null, Guid.NewGuid())),
            await player.ArrowAsync(new DrawArrowRequest(id, null, other.Thorin, new BoardCell(2, 2))),
            await strangerDevice.PingCellAsync(id, 1, 1),
            await player.PingCellAsync(Guid.NewGuid(), 1, 1),
            await player.PingCellAsync(other.EncounterId, 1, 1),
        ];

        Assert.All(targetInvalid, r => Assert.Equal(ApiErrorCode.TargetInvalid, r.Error));
        Assert.All(tokenNotFound, r => Assert.Equal(ApiErrorCode.TokenNotFound, r.Error));

        // Refused pings send nothing: the first one the DM hears is the good one.
        await player.PingCellAsync(id, 7, 4);
        Assert.Equal(new BoardCell(7, 4), (await dm.NextPingAsync()).Cell);

        await fight.Table.Dm.EndEncounterAsync(fight.CampaignId, fight.Table.Session.Id, id);
        Assert.Equal(ApiErrorCode.EncounterNotActive, (await player.PingCellAsync(id, 1, 1)).Error);
        Assert.Equal(ApiErrorCode.EncounterNotActive, (await player.ArrowAsync(new DrawArrowRequest(id, new BoardCell(1, 1), null, new BoardCell(2, 2)))).Error);
    }

    // At most three pings and arrows per person in two seconds; the rest are dropped
    // without an error (TablePeopleTests covers the window with a controlled clock).
    [Fact]
    public async Task A_fourth_ping_within_two_seconds_is_dropped_quietly()
    {
        var fight = await App.StartFightAsync();
        await using var player = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, fight.EncounterId);
        await using var secondDm = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);

        HubResult[] results =
        [
            await player.PingCellAsync(fight.EncounterId, 1, 1),
            await player.ArrowAsync(new DrawArrowRequest(fight.EncounterId, new BoardCell(1, 1), null, new BoardCell(2, 2))),
            await player.PingCellAsync(fight.EncounterId, 1, 2),
            await player.PingCellAsync(fight.EncounterId, 1, 3),
            await player.ArrowAsync(new DrawArrowRequest(fight.EncounterId, new BoardCell(1, 1), null, new BoardCell(2, 3))),
        ];
        await secondDm.PingCellAsync(fight.EncounterId, 0, 4);

        Assert.All(results, r => Assert.Equal(new HubResult(null), r));
        Assert.Equal(new BoardCell(1, 1), (await dm.NextPingAsync()).Cell);
        Assert.Equal(new BoardCell(2, 2), (await dm.NextArrowAsync()).To);
        Assert.Equal(new BoardCell(1, 2), (await dm.NextPingAsync()).Cell);

        // Messages arrive in the order the server sent them: the next ping after the first
        // three is Yara's, so the player's last two were dropped. Yara has her own limit.
        Assert.Equal(fight.Table.SecondDm.Id, (await dm.NextPingAsync()).UserId);
        Assert.False(dm.HasPendingPing);
    }
}
