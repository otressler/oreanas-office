using System.Net;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Statuses;
using OreanasOffice.Server.Tests.Images;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.StatusTestApi;

namespace OreanasOffice.Server.Tests;

// Status lists, custom statuses and the picker (knowledge/features/statuses.md, "Status
// lists", "Custom statuses"). The campaign is EncounterTables': Oreana and Yara are `dm`
// members, Brom a player.
public sealed class StatusListTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private AppFactory App => fixture.App;

    [Fact]
    public async Task A_characters_list_is_made_once_with_the_fifteen_conditions()
    {
        var table = await App.CreateEncounterTableAsync();
        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");

        // Several first reads at once make one list.
        var first = await Task.WhenAll(Enumerable.Range(0, 5).Select(_ => table.Player.GetCharacterListAsync(table.CampaignId, thorin.Id)));
        var byDm = await table.SecondDm.GetCharacterListAsync(table.CampaignId, thorin.Id);
        var kira = await App.CreatePersonAsync("Kira");
        await kira.JoinAsync((await table.Dm.GetCampaignAsync(table.CampaignId)).JoinCode!);
        var byOtherPlayer = await kira.GetCharacterListAsync(table.CampaignId, thorin.Id);

        var list = first[0];
        Assert.All(first, l => Assert.Equal(list.Id, l.Id));
        Assert.Equal((thorin.Id, true), (list.CharacterId, list.CanEdit));
        Assert.Equal(LibraryIds, list.Statuses.Select(s => s.Id));
        Assert.Equal(
            new StatusDefinitionView(Exhaustion, "exhaustion", "Erschöpfung", true, "/statuses/exhaustion.webp", null, null),
            list.Statuses[3]);
        Assert.Equal((list.Id, true), (byDm.Id, byDm.CanEdit));
        Assert.Equal((list.Id, false), (byOtherPlayer.Id, byOtherPlayer.CanEdit));
        Assert.Equal(1, await App.InDbAsync(db => db.StatusLists.CountAsync(l => l.CharacterId == thorin.Id)));
    }

    [Fact]
    public async Task Putting_a_list_replaces_it_in_the_new_order()
    {
        var table = await App.CreateEncounterTableAsync();
        var other = await App.CreateEncounterTableAsync();
        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");
        var hexed = await table.Player.CreateStatusOkAsync(table.CampaignId, "Verhext", thorin.Id);
        var foreign = await other.Dm.CreateStatusOkAsync(other.CampaignId, "Fremd");

        var put = await (await table.Player.SetCharacterListAsync(table.CampaignId, thorin.Id, Poisoned, hexed.Id, Prone))
            .ReadAsync<StatusListResponse>(HttpStatusCode.OK);
        var byDm = await (await table.Dm.SetCharacterListAsync(table.CampaignId, thorin.Id, Prone, Poisoned))
            .ReadAsync<StatusListResponse>(HttpStatusCode.OK);
        var emptied = await (await table.SecondDm.SetCharacterListAsync(table.CampaignId, thorin.Id))
            .ReadAsync<StatusListResponse>(HttpStatusCode.OK);

        Assert.Equal([Poisoned, hexed.Id, Prone], put.Statuses.Select(s => s.Id));
        Assert.Equal([Prone, Poisoned], byDm.Statuses.Select(s => s.Id));
        Assert.Equal(put.Id, byDm.Id);
        Assert.Empty(emptied.Statuses);

        // An emptied list stays empty; the custom status itself stays in the campaign.
        Assert.Empty((await table.Player.GetCharacterListAsync(table.CampaignId, thorin.Id)).Statuses);
        var all = await (await table.Player.Client.GetAsync($"/api/campaigns/{table.CampaignId}/statuses"))
            .ReadAsync<List<StatusDefinitionView>>(HttpStatusCode.OK);
        Assert.Equal([.. LibraryIds, hexed.Id], all.Select(s => s.Id));
    }

    [Fact]
    public async Task Bad_lists_and_other_peoples_lists_are_refused()
    {
        var table = await App.CreateEncounterTableAsync();
        var other = await App.CreateEncounterTableAsync();
        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");
        var aria = await table.SecondDm.CreateCharacterAsync(table.CampaignId, "Aria");
        var foreignCharacter = await other.Player.CreateCharacterAsync(other.CampaignId, "Fremd");
        var foreign = await other.Dm.CreateStatusOkAsync(other.CampaignId, "Fremd");
        var stranger = await App.CreatePersonAsync("Fremder");

        await (await table.Player.SetCharacterListAsync(table.CampaignId, thorin.Id, Prone, Guid.NewGuid()))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.StatusNotFound, "statusIds[1]");
        await (await table.Player.SetCharacterListAsync(table.CampaignId, thorin.Id, Prone, Poisoned, Prone))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.StatusNotFound, "statusIds[2]");
        await (await table.Dm.SetDmListAsync(table.CampaignId, foreign.Id))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.StatusNotFound, "statusIds[0]");
        Assert.Equal(HttpStatusCode.Forbidden, (await table.Player.SetCharacterListAsync(table.CampaignId, aria.Id, Prone)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await table.Dm.SetCharacterListAsync(table.CampaignId, foreignCharacter.Id, Prone)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await table.Dm.Client.GetAsync(CharacterListUrl(table.CampaignId, foreignCharacter.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.Client.GetAsync(CharacterListUrl(table.CampaignId, thorin.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.Client.GetAsync($"/api/campaigns/{table.CampaignId}/statuses")).StatusCode);

        // Nothing changed: the list still has the fifteen conditions.
        Assert.Equal(LibraryIds, (await table.Player.GetCharacterListAsync(table.CampaignId, thorin.Id)).Statuses.Select(s => s.Id));
    }

    // knowledge/features/statuses.md: one DM status list per `dm` member (question 22).
    [Fact]
    public async Task Each_dm_member_has_their_own_DM_status_list()
    {
        var table = await App.CreateEncounterTableAsync();

        var oreanas = await table.Dm.GetDmListAsync(table.CampaignId);
        var yaras = await table.SecondDm.GetDmListAsync(table.CampaignId);
        var changed = await (await table.Dm.SetDmListAsync(table.CampaignId, Prone)).ReadAsync<StatusListResponse>(HttpStatusCode.OK);

        Assert.NotEqual(oreanas.Id, yaras.Id);
        Assert.Equal((null, true), (oreanas.CharacterId, oreanas.CanEdit));
        Assert.Equal(LibraryIds, oreanas.Statuses.Select(s => s.Id));
        Assert.Equal(oreanas.Id, changed.Id);
        Assert.Equal([Prone], changed.Statuses.Select(s => s.Id));
        Assert.Equal(LibraryIds, (await table.SecondDm.GetDmListAsync(table.CampaignId)).Statuses.Select(s => s.Id));
        Assert.Equal(HttpStatusCode.Forbidden, (await table.Player.Client.GetAsync(DmListUrl(table.CampaignId))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await table.Player.SetDmListAsync(table.CampaignId, Prone)).StatusCode);
    }

    [Fact]
    public async Task A_custom_status_goes_at_the_end_of_its_list()
    {
        var table = await App.CreateEncounterTableAsync();
        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");
        await table.Player.SetCharacterListAsync(table.CampaignId, thorin.Id, Prone);

        var response = await table.Player.CreateStatusAsync(
            table.CampaignId, new CreateStatusRequest("  Verhext ", " a purple eye inside a hand ", false, thorin.Id));
        var dmStatus = await table.SecondDm.CreateStatusOkAsync(table.CampaignId, "Brennend", hasLevels: true);
        var forThorinByDm = await table.Dm.CreateStatusOkAsync(table.CampaignId, "Verflucht", thorin.Id, "");

        var hexed = await response.ReadAsync<StatusDefinitionView>(HttpStatusCode.Created);
        Assert.Equal(new StatusDefinitionView(hexed.Id, null, "Verhext", false, null, "a purple eye inside a hand", thorin.Id), hexed);
        Assert.Equal((true, (Guid?)null, (string?)null), (dmStatus.HasLevels, dmStatus.CharacterId, dmStatus.IconDescription));
        Assert.Null(forThorinByDm.IconDescription);
        Assert.Equal([Prone, hexed.Id, forThorinByDm.Id], (await table.Player.GetCharacterListAsync(table.CampaignId, thorin.Id)).Statuses.Select(s => s.Id));

        // Yara's DM list didn't exist yet: it's made with the fifteen, then the new one.
        Assert.Equal([.. LibraryIds, dmStatus.Id], (await table.SecondDm.GetDmListAsync(table.CampaignId)).Statuses.Select(s => s.Id));
        var stored = await App.InDbAsync(db => db.StatusDefinitions.AsNoTracking().SingleAsync(s => s.Id == hexed.Id));
        Assert.Equal((table.CampaignId, (Guid?)table.Player.Id), (stored.CampaignId!.Value, stored.CreatedByUserId));
    }

    [Fact]
    public async Task Custom_statuses_need_a_name_and_the_right_to_edit_the_list()
    {
        var table = await App.CreateEncounterTableAsync();
        var other = await App.CreateEncounterTableAsync();
        var thorin = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");
        var aria = await table.SecondDm.CreateCharacterAsync(table.CampaignId, "Aria");
        var foreignCharacter = await other.Player.CreateCharacterAsync(other.CampaignId, "Fremd");

        await (await table.Player.CreateStatusAsync(table.CampaignId, new CreateStatusRequest("  ", null, false, thorin.Id)))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NameInvalid, "name");
        await (await table.Player.CreateStatusAsync(table.CampaignId, new CreateStatusRequest(new string('x', 41), null, false, thorin.Id)))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NameInvalid, "name");
        await (await table.Player.CreateStatusAsync(table.CampaignId, new CreateStatusRequest("Verhext", new string('x', 301), false, thorin.Id)))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.TextTooLong, "iconDescription");
        Assert.Equal(HttpStatusCode.Forbidden, (await table.Player.CreateStatusAsync(table.CampaignId, new CreateStatusRequest("Verhext", null, false, aria.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await table.Player.CreateStatusAsync(table.CampaignId, new CreateStatusRequest("Verhext", null, false, null))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await table.Dm.CreateStatusAsync(table.CampaignId, new CreateStatusRequest("Verhext", null, false, foreignCharacter.Id))).StatusCode);

        Assert.Equal(new string('x', 40), (await table.Player.CreateStatusOkAsync(table.CampaignId, new string('x', 40), thorin.Id, new string('y', 300))).Name);
    }

    // The session DM: their own list first, then every character's in the fight by name.
    // Anyone else: their own characters' lists.
    [Fact]
    public async Task The_picker_shows_the_lists_for_the_fight()
    {
        var fight = await App.StartFightAsync();
        var (campaignId, encounterId) = (fight.CampaignId, fight.EncounterId);
        var board = await fight.Table.Dm.BoardAsync(fight);
        var thorinId = board.Tokens.Single(t => t.Id == fight.Thorin).CharacterId!.Value;
        var ariaId = board.Tokens.Single(t => t.Id == fight.Aria).CharacterId!.Value;
        await fight.Table.Player.SetCharacterListAsync(campaignId, thorinId, Prone, Poisoned);
        var kira = await App.CreatePersonAsync("Kira");
        await kira.JoinAsync((await fight.Table.Dm.GetCampaignAsync(campaignId)).JoinCode!);

        var dms = await fight.Table.Dm.GetPickerAsync(campaignId, encounterId);
        var broms = await fight.Table.Player.GetPickerAsync(campaignId, encounterId);
        var yaras = await fight.Table.SecondDm.GetPickerAsync(campaignId, encounterId);
        var kiras = await kira.GetPickerAsync(campaignId, encounterId);

        Assert.Equal(
            new (StatusListKind, Guid?, string?)[] { (StatusListKind.Dm, null, null), (StatusListKind.Character, ariaId, "Aria"), (StatusListKind.Character, thorinId, "Thorin") },
            dms.Lists.Select(l => (l.Kind, l.CharacterId, l.CharacterName)));
        Assert.Equal(LibraryIds, dms.Lists[0].Statuses.Select(s => s.Id));
        Assert.Equal([Prone, Poisoned], dms.Lists[2].Statuses.Select(s => s.Id));
        var brom = Assert.Single(broms.Lists);
        Assert.Equal((StatusListKind.Character, (Guid?)thorinId), (brom.Kind, brom.CharacterId));
        Assert.Equal([Prone, Poisoned], brom.Statuses.Select(s => s.Id));
        Assert.Equal([ariaId], yaras.Lists.Select(l => l.CharacterId!.Value));
        Assert.Empty(kiras.Lists);

        // A character taken off the board leaves the picker.
        await using (var dm = await TableTestClient.JoinAsync(App, fight.Table.Dm, encounterId))
        {
            await dm.RemoveTokenAsync(fight.Thorin);
        }

        Assert.Empty((await fight.Table.Player.GetPickerAsync(campaignId, encounterId)).Lists);
        Assert.Equal(2, (await fight.Table.Dm.GetPickerAsync(campaignId, encounterId)).Lists.Count);
    }

    [Fact]
    public async Task The_picker_is_only_for_a_running_fight_of_the_campaign()
    {
        var fight = await App.StartFightAsync();
        var other = await App.StartFightAsync();
        var ready = await fight.Table.Dm.ImportMapAsync(fight.CampaignId, fight.Table.Session.Id, TestMaps.Gorge() with { Name = "Zweite Klamm" });

        Assert.Equal(HttpStatusCode.NotFound, (await fight.Table.Dm.Client.GetAsync(PickerUrl(fight.CampaignId, ready.Id))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await fight.Table.Dm.Client.GetAsync(PickerUrl(fight.CampaignId, other.EncounterId))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await fight.Table.Dm.Client.GetAsync(PickerUrl(other.CampaignId, other.EncounterId))).StatusCode);

        await fight.Table.Dm.EndEncounterAsync(fight.CampaignId, fight.Table.Session.Id, fight.EncounterId);
        Assert.Equal(HttpStatusCode.NotFound, (await fight.Table.Dm.Client.GetAsync(PickerUrl(fight.CampaignId, fight.EncounterId))).StatusCode);
    }
}
