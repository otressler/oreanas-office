using System.Net;
using System.Net.Http.Json;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Statuses;
using OreanasOffice.Server.Table;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.StatusTestApi;

namespace OreanasOffice.Server.Tests;

// Who plays which character (knowledge/domain/character.md, "Who plays it"): `dm` members
// give characters to members of the campaign, and the session DM hands a character to
// someone else for one session. The fight is EncounterTables.StartFightAsync: Brom's
// Thorin and Yara's Aria in Oreana's session.
public sealed class CharacterPlayerTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private AppFactory App => fixture.App;

    [Fact]
    public async Task A_dm_creates_a_character_for_a_player()
    {
        var table = await App.CreateEncounterTableAsync();

        var created = await (await table.Dm.Client.PostAsJsonAsync(
                $"/api/campaigns/{table.CampaignId}/characters",
                new CharacterRequest("Thorin", CreatureSize.Medium, OwnerUserId: table.Player.Id),
                Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.Created);

        Assert.Equal((table.Player.Id, "Brom"), (created.OwnerUserId, created.OwnerDisplayName));
        var asPlayer = Assert.Single(await ListAsync(table.Player, table.CampaignId));
        Assert.True(asPlayer.CanEdit);
    }

    [Fact]
    public async Task Players_create_characters_only_for_themselves()
    {
        var table = await App.CreateEncounterTableAsync();
        var url = $"/api/campaigns/{table.CampaignId}/characters";

        var forSomeoneElse = await table.Player.Client.PostAsJsonAsync(
            url, new CharacterRequest("Thorin", CreatureSize.Medium, OwnerUserId: table.Dm.Id), Json);
        var forThemselves = await table.Player.Client.PostAsJsonAsync(
            url, new CharacterRequest("Thorin", CreatureSize.Medium, OwnerUserId: table.Player.Id), Json);

        Assert.Equal(HttpStatusCode.Forbidden, forSomeoneElse.StatusCode);
        Assert.Equal(table.Player.Id, (await forThemselves.ReadAsync<CharacterResponse>(HttpStatusCode.Created)).OwnerUserId);
    }

    [Fact]
    public async Task Characters_go_only_to_members_of_the_campaign()
    {
        var table = await App.CreateEncounterTableAsync();
        var outsider = await App.CreatePersonAsync("Fremd");
        var character = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");

        var created = await table.Dm.Client.PostAsJsonAsync(
            $"/api/campaigns/{table.CampaignId}/characters",
            new CharacterRequest("Thorin", CreatureSize.Medium, OwnerUserId: outsider.Id),
            Json);
        var updated = await UpdateAsync(table.Dm, table.CampaignId, character, outsider.Id);

        await created.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NotAMember, "ownerUserId");
        await updated.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NotAMember, "ownerUserId");
    }

    [Fact]
    public async Task A_dm_gives_a_character_to_another_member_and_players_cannot()
    {
        var table = await App.CreateEncounterTableAsync();
        var character = await table.Player.CreateCharacterAsync(table.CampaignId, "Thorin");

        var byPlayer = await UpdateAsync(table.Player, table.CampaignId, character, table.SecondDm.Id);
        var byDm = await UpdateAsync(table.Dm, table.CampaignId, character, table.SecondDm.Id);
        // Without an owner in the request, the owner stays.
        var kept = await UpdateAsync(table.Dm, table.CampaignId, character, null);

        Assert.Equal(HttpStatusCode.Forbidden, byPlayer.StatusCode);
        Assert.Equal((table.SecondDm.Id, "Yara"), Owner(await byDm.ReadAsync<CharacterResponse>(HttpStatusCode.OK)));
        Assert.Equal((table.SecondDm.Id, "Yara"), Owner(await kept.ReadAsync<CharacterResponse>(HttpStatusCode.OK)));
        // Brom no longer owns it, so he can't edit it either.
        Assert.False(Assert.Single(await ListAsync(table.Player, table.CampaignId)).CanEdit);
    }

    [Fact]
    public async Task A_new_owner_plays_the_character_in_a_running_fight_at_once()
    {
        var fight = await App.StartFightAsync();
        await using var brom = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var yara = await FogTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        var thorin = await CharacterAsync(fight, "Thorin");

        var response = await UpdateAsync(fight.Table.Dm, fight.CampaignId, thorin, fight.Table.SecondDm.Id);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(fight.EncounterId, (await brom.WaitForAsync(nameof(ITableClient.ReloadBoard)))[0].GetGuid());
        Assert.Equal(ApiErrorCode.NotYourToken, (await brom.MoveAsync(fight.Thorin, 1, 0)).Error);
        Assert.Null((await yara.MoveAsync(fight.Thorin, 1, 0)).Error);
        Assert.Equal(fight.Table.SecondDm.Id, await PlayerOnBoardAsync(fight, fight.Thorin));
    }

    [Fact]
    public async Task The_session_dm_hands_a_character_to_someone_else_for_the_session()
    {
        var fight = await App.StartFightAsync();
        await using var brom = await FogTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var yara = await FogTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        var thorin = await CharacterAsync(fight, "Thorin");

        var session = await (await SetPlayerAsync(fight.Table.Dm, fight, thorin.Id, fight.Table.SecondDm.Id))
            .ReadAsync<SessionResponse>(HttpStatusCode.OK);

        Assert.Equal([new SessionCharacterPlayerResponse(thorin.Id, fight.Table.SecondDm.Id, "Yara")], session.CharacterPlayers);
        foreach (var device in new[] { brom, yara })
        {
            Assert.Equal(fight.EncounterId, (await device.WaitForAsync(nameof(ITableClient.ReloadBoard)))[0].GetGuid());
        }

        Assert.Equal(ApiErrorCode.NotYourToken, (await brom.MoveAsync(fight.Thorin, 1, 0)).Error);
        Assert.Null((await yara.MoveAsync(fight.Thorin, 1, 0)).Error);
        // Yara still plays her own Aria too.
        Assert.Null((await yara.MoveAsync(fight.Aria, 1, 2)).Error);
        Assert.Equal(fight.Table.SecondDm.Id, await PlayerOnBoardAsync(fight, fight.Thorin));
        // The character still belongs to Brom: only the session changed.
        Assert.Equal(fight.Table.Player.Id, (await CharacterAsync(fight, "Thorin")).OwnerUserId);
        // Everyone in the campaign sees who plays whom.
        var asPlayer = await fight.Table.Player.Client.GetFromJsonAsync<SessionResponse>(
            $"/api/campaigns/{fight.CampaignId}/sessions/{fight.Table.Session.Id}", Json);
        Assert.Equal(session.CharacterPlayers, asPlayer!.CharacterPlayers);
    }

    [Fact]
    public async Task The_player_of_the_session_puts_statuses_on_the_character_from_its_list()
    {
        var fight = await App.StartFightAsync();
        await using var brom = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var yara = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        var thorin = await CharacterAsync(fight, "Thorin");

        Assert.Equal(HttpStatusCode.OK, (await SetPlayerAsync(fight.Table.Dm, fight, thorin.Id, fight.Table.SecondDm.Id)).StatusCode);

        Assert.Equal(ApiErrorCode.NotYourToken, (await brom.AddStatusAsync(fight.Thorin, Prone)).Error);
        Assert.Null((await yara.AddStatusAsync(fight.Thorin, Prone)).Error);
        var yarasPicker = await fight.Table.SecondDm.Client.GetFromJsonAsync<StatusPickerResponse>(PickerUrl(fight.CampaignId, fight.EncounterId), Json);
        var bromsPicker = await fight.Table.Player.Client.GetFromJsonAsync<StatusPickerResponse>(PickerUrl(fight.CampaignId, fight.EncounterId), Json);
        Assert.Equal(["Aria", "Thorin"], yarasPicker!.Lists.Select(l => l.CharacterName));
        Assert.Empty(bromsPicker!.Lists);
    }

    [Fact]
    public async Task Who_is_here_lists_the_player_of_the_session()
    {
        var fight = await App.StartFightAsync();
        var lia = await App.CreatePersonAsync("Lia");
        var campaign = await fight.Table.Dm.GetCampaignAsync(fight.CampaignId);
        await lia.JoinAsync(campaign.JoinCode!);
        var thorin = await CharacterAsync(fight, "Thorin");

        Assert.Equal(HttpStatusCode.OK, (await SetPlayerAsync(fight.Table.Dm, fight, thorin.Id, lia.Id)).StatusCode);

        var board = await (await fight.Table.Dm.GetBoardAsync(fight.CampaignId, fight.EncounterId)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);
        var people = board.Presence.People.Select(p => p.UserId).ToList();
        Assert.Contains(lia.Id, people);
        Assert.DoesNotContain(fight.Table.Player.Id, people);
    }

    [Fact]
    public async Task Handing_back_to_the_owner_removes_the_override()
    {
        var fight = await App.StartFightAsync();
        await using var brom = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        var thorin = await CharacterAsync(fight, "Thorin");
        Assert.Equal(HttpStatusCode.OK, (await SetPlayerAsync(fight.Table.Dm, fight, thorin.Id, fight.Table.SecondDm.Id)).StatusCode);
        var aria = await CharacterAsync(fight, "Aria");
        Assert.Equal(HttpStatusCode.OK, (await SetPlayerAsync(fight.Table.Dm, fight, aria.Id, fight.Table.Player.Id)).StatusCode);

        var byOwnerId = await (await SetPlayerAsync(fight.Table.Dm, fight, thorin.Id, fight.Table.Player.Id))
            .ReadAsync<SessionResponse>(HttpStatusCode.OK);
        var byNull = await (await SetPlayerAsync(fight.Table.Dm, fight, aria.Id, null))
            .ReadAsync<SessionResponse>(HttpStatusCode.OK);

        Assert.Equal([fight.Table.Player.Id], byOwnerId.CharacterPlayers.Select(p => p.UserId));
        Assert.Empty(byNull.CharacterPlayers);
        Assert.Null((await brom.MoveAsync(fight.Thorin, 1, 0)).Error);
    }

    [Fact]
    public async Task A_hand_over_counts_for_its_session_only()
    {
        var fight = await App.StartFightAsync();
        await using var brom = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        await using var yara = await TableTestClient.JoinAsync(App, fight.Table.SecondDm, fight.EncounterId);
        var thorin = await CharacterAsync(fight, "Thorin");
        var nextSession = await fight.Table.Dm.CreateSessionAsync(fight.CampaignId, "Nächstes Mal");

        var response = await fight.Table.Dm.Client.PutAsJsonAsync(
            PlayerUrl(fight.CampaignId, nextSession.Id, thorin.Id), new SetCharacterPlayerRequest(fight.Table.SecondDm.Id), Json);

        Assert.Single((await response.ReadAsync<SessionResponse>(HttpStatusCode.OK)).CharacterPlayers);
        Assert.Null((await brom.MoveAsync(fight.Thorin, 1, 0)).Error);
        Assert.Equal(ApiErrorCode.NotYourToken, (await yara.MoveAsync(fight.Thorin, 2, 0)).Error);
    }

    // An undo needs the right to move the token still: the move was Brom's, the token is now Yara's.
    [Fact]
    public async Task The_former_player_cannot_undo_once_the_character_is_handed_over()
    {
        var fight = await App.StartFightAsync();
        await using var brom = await TableTestClient.JoinAsync(App, fight.Table.Player, fight.EncounterId);
        var thorin = await CharacterAsync(fight, "Thorin");
        Assert.Null((await brom.MoveAsync(fight.Thorin, 1, 0)).Error);

        Assert.Equal(HttpStatusCode.OK, (await SetPlayerAsync(fight.Table.Dm, fight, thorin.Id, fight.Table.SecondDm.Id)).StatusCode);

        Assert.Equal(ApiErrorCode.NotYourToken, (await brom.UndoAsync(fight.EncounterId)).Error);
    }

    [Fact]
    public async Task Only_the_session_dm_hands_characters_to_members_while_the_session_is_open()
    {
        var fight = await App.StartFightAsync();
        var outsider = await App.CreatePersonAsync("Fremd");
        var thorin = await CharacterAsync(fight, "Thorin");
        var elsewhere = await App.CreateEncounterTableAsync();
        var foreign = await elsewhere.Player.CreateCharacterAsync(elsewhere.CampaignId, "Woanders");

        // Yara is a `dm` member but doesn't run the session; Brom is a player.
        Assert.Equal(HttpStatusCode.Forbidden, (await SetPlayerAsync(fight.Table.SecondDm, fight, thorin.Id, fight.Table.SecondDm.Id)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await SetPlayerAsync(fight.Table.Player, fight, thorin.Id, fight.Table.Player.Id)).StatusCode);
        await (await SetPlayerAsync(fight.Table.Dm, fight, thorin.Id, outsider.Id))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NotAMember, "userId");
        Assert.Equal(HttpStatusCode.NotFound, (await SetPlayerAsync(fight.Table.Dm, fight, foreign.Id, fight.Table.SecondDm.Id)).StatusCode);

        var ended = await fight.Table.Dm.Client.PostAsync($"/api/campaigns/{fight.CampaignId}/sessions/{fight.Table.Session.Id}/end", null);
        Assert.Equal(HttpStatusCode.OK, ended.StatusCode);
        await (await SetPlayerAsync(fight.Table.Dm, fight, thorin.Id, fight.Table.SecondDm.Id))
            .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.SessionEnded);
    }

    private static string PlayerUrl(Guid campaignId, Guid sessionId, Guid characterId) =>
        $"/api/campaigns/{campaignId}/sessions/{sessionId}/characters/{characterId}/player";

    private static Task<HttpResponseMessage> SetPlayerAsync(Person person, RunningFight fight, Guid characterId, Guid? userId) =>
        person.Client.PutAsJsonAsync(
            PlayerUrl(fight.CampaignId, fight.Table.Session.Id, characterId), new SetCharacterPlayerRequest(userId), Json);

    private static Task<HttpResponseMessage> UpdateAsync(Person person, Guid campaignId, CharacterResponse character, Guid? ownerUserId) =>
        person.Client.PutAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters/{character.Id}",
            new CharacterRequest(character.Name, character.Size, OwnerUserId: ownerUserId),
            Json);

    private static async Task<List<CharacterResponse>> ListAsync(Person person, Guid campaignId) =>
        (await person.Client.GetFromJsonAsync<List<CharacterResponse>>($"/api/campaigns/{campaignId}/characters", Json))!;

    private static async Task<CharacterResponse> CharacterAsync(RunningFight fight, string name) =>
        (await ListAsync(fight.Table.Dm, fight.CampaignId)).Single(c => c.Name == name);

    private static async Task<Guid?> PlayerOnBoardAsync(RunningFight fight, Guid tokenId) =>
        (await (await fight.Table.Dm.GetBoardAsync(fight.CampaignId, fight.EncounterId)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK))
            .Tokens.Single(t => t.Id == tokenId).OwnerUserId;

    private static (Guid, string) Owner(CharacterResponse character) => (character.OwnerUserId, character.OwnerDisplayName);
}
