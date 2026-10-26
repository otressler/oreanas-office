using System.Net;
using System.Net.Http.Json;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sessions;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

public sealed class CampaignTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    [Fact]
    public async Task Creating_a_campaign_makes_the_creator_its_default_dm()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");

        var response = await dm.Client.PostAsJsonAsync("/api/campaigns", new CreateCampaignRequest("  Die Gruft  "), Json);

        var campaign = await response.ReadAsync<CampaignResponse>(HttpStatusCode.Created);
        Assert.Equal($"/api/campaigns/{campaign.Id}", response.Headers.Location?.OriginalString);
        Assert.Equal("Die Gruft", campaign.Name);
        Assert.Equal(dm.Id, campaign.DefaultDmUserId);
        Assert.Equal(CampaignRole.Dm, campaign.MyRole);
        Assert.Equal(campaign.JoinCode, JoinCodes.Normalize(campaign.JoinCode));
        Assert.Null(campaign.ActiveSessionId);
        var member = Assert.Single(campaign.Members);
        Assert.Equal((dm.Id, "Oreana", CampaignRole.Dm), (member.UserId, member.DisplayName, member.Role));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public async Task Creating_a_campaign_needs_a_name(string? name)
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");

        var response = await dm.Client.PostAsJsonAsync("/api/campaigns", new CreateCampaignRequest(name!), Json);

        await response.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NameInvalid, "name");
    }

    [Fact]
    public async Task Campaign_names_have_a_maximum_length()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");

        var longest = await dm.Client.PostAsJsonAsync(
            "/api/campaigns", new CreateCampaignRequest(new string('a', Campaign.NameMaxLength)), Json);
        var tooLong = await dm.Client.PostAsJsonAsync(
            "/api/campaigns", new CreateCampaignRequest(new string('a', Campaign.NameMaxLength + 1)), Json);

        Assert.Equal(HttpStatusCode.Created, longest.StatusCode);
        await tooLong.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NameInvalid, "name");
    }

    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(true, true)]
    public async Task Players_join_with_the_code_typed_in_any_case_and_with_a_dash(bool lowercase, bool dash)
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        var typed = campaign.JoinCode!;
        typed = lowercase ? typed.ToLowerInvariant() : typed;
        typed = dash ? $" {typed[..3]}-{typed[3..]} " : typed;

        var summary = await player.JoinAsync(typed);

        Assert.Equal((campaign.Id, campaign.Name, CampaignRole.Player), (summary.Id, summary.Name, summary.MyRole));
        Assert.Null(summary.ActiveSession);
        Assert.Contains(
            (await player.GetCampaignAsync(campaign.Id)).Members,
            m => m.UserId == player.Id && m.Role == CampaignRole.Player);
    }

    [Theory]
    [InlineData("")]
    [InlineData("ABC")]
    [InlineData("0OI1LA")]
    [InlineData(null)]
    public async Task Joining_needs_a_valid_code(string? code)
    {
        var player = await fixture.App.CreatePersonAsync("Brom");

        var response = await player.Client.PostAsJsonAsync("/api/campaigns/join", new JoinCampaignRequest(code!), Json);

        await response.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.JoinCodeInvalid, "code");
    }

    [Fact]
    public async Task Joining_with_an_unknown_code_fails()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        string unknown;
        do
        {
            unknown = JoinCodes.Create();
        }
        while (unknown == campaign.JoinCode);

        var response = await player.Client.PostAsJsonAsync("/api/campaigns/join", new JoinCampaignRequest(unknown), Json);

        await response.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.JoinCodeInvalid, "code");
    }

    [Fact]
    public async Task Joining_again_keeps_the_role()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        await player.JoinAsync(campaign.JoinCode!);

        var dmAgain = await dm.JoinAsync(campaign.JoinCode!);
        var playerAgain = await player.JoinAsync(campaign.JoinCode!);

        Assert.Equal(CampaignRole.Dm, dmAgain.MyRole);
        Assert.Equal(CampaignRole.Player, playerAgain.MyRole);
        Assert.Equal(2, (await dm.GetCampaignAsync(campaign.Id)).Members.Count);
    }

    [Fact]
    public async Task Only_dms_see_the_join_code()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        await player.JoinAsync(campaign.JoinCode!);

        var asPlayer = await player.GetCampaignAsync(campaign.Id);
        var asDm = await dm.GetCampaignAsync(campaign.Id);

        Assert.Null(asPlayer.JoinCode);
        Assert.Equal(CampaignRole.Player, asPlayer.MyRole);
        Assert.Equal(campaign.JoinCode, asDm.JoinCode);
    }

    [Fact]
    public async Task Members_are_listed_dms_first_then_by_name()
    {
        var dm = await fixture.App.CreatePersonAsync("Zora");
        var campaign = await dm.CreateCampaignAsync();
        var players = new[] { "Mira", "Anton", "Kel" };
        foreach (var name in players)
        {
            await (await fixture.App.CreatePersonAsync(name)).JoinAsync(campaign.JoinCode!);
        }

        var promoted = await fixture.App.CreatePersonAsync("Yannick");
        await promoted.JoinAsync(campaign.JoinCode!);
        await dm.PromoteAsync(campaign.Id, promoted.Id);

        var members = (await dm.GetCampaignAsync(campaign.Id)).Members;

        Assert.Equal(["Yannick", "Zora", "Anton", "Kel", "Mira"], members.Select(m => m.DisplayName));
        Assert.Equal(
            [CampaignRole.Dm, CampaignRole.Dm, CampaignRole.Player, CampaignRole.Player, CampaignRole.Player],
            members.Select(m => m.Role));
    }

    [Fact]
    public async Task The_landing_list_shows_my_campaigns_by_name_with_the_active_session()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var outsider = await fixture.App.CreatePersonAsync("Fremd");
        var zeta = await dm.CreateCampaignAsync("Zeta");
        var alpha = await player.CreateCampaignAsync("Alpha");
        await outsider.CreateCampaignAsync("Beta");
        await player.JoinAsync(zeta.JoinCode!);
        var session = await dm.CreateSessionAsync(zeta.Id, "Abend 1", new DateOnly(2026, 10, 17));
        await dm.Client.PostAsync($"/api/campaigns/{zeta.Id}/sessions/{session.Id}/activate", null);

        var campaigns = await (await player.Client.GetAsync("/api/campaigns"))
            .ReadAsync<List<CampaignSummaryResponse>>(HttpStatusCode.OK);

        Assert.Equal(["Alpha", "Zeta"], campaigns.Select(c => c.Name));
        Assert.Equal((alpha.Id, CampaignRole.Dm), (campaigns[0].Id, campaigns[0].MyRole));
        Assert.Null(campaigns[0].ActiveSession);
        Assert.Equal((zeta.Id, CampaignRole.Player), (campaigns[1].Id, campaigns[1].MyRole));
        Assert.Equal(
            new ActiveSessionSummary(session.Id, "Abend 1", new DateOnly(2026, 10, 17), dm.Id, "Oreana", ActiveEncounter: null),
            campaigns[1].ActiveSession);
        Assert.Equal(session.Id, (await player.GetCampaignAsync(zeta.Id)).ActiveSessionId);
    }

    [Fact]
    public async Task A_card_lists_every_character_with_mine_first()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        await player.JoinAsync(campaign.JoinCode!);
        var mira = await dm.CreateCharacterAsync(campaign.Id, "Mira");
        var thorin = await (await player.Client.PostAsJsonAsync(
                $"/api/campaigns/{campaign.Id}/characters", new CharacterRequest("Thorin", CreatureSize.Medium, Color: "#AA0000"), Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.Created);
        var kel = await dm.CreateCharacterAsync(campaign.Id, "Kel");

        var card = await player.CampaignSummaryAsync(campaign.Id);

        Assert.Equal(
            [
                new CampaignCharacterSummary(thorin.Id, "Thorin", 1, "#aa0000", null, Mine: true),
                new CampaignCharacterSummary(mira.Id, "Mira", 0, null, null, Mine: false),
                new CampaignCharacterSummary(kel.Id, "Kel", 2, null, null, Mine: false),
            ],
            card.Characters);
        Assert.Equal((null, null), (card.Description, card.CoverUrl));
    }

    [Fact]
    public async Task A_dm_changes_the_name_and_description()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        await player.JoinAsync(campaign.JoinCode!);

        var updated = await dm.UpdateCampaignAsync(campaign.Id, "  Der Fluch  ", "  Nebel über Barovia.  ");

        Assert.Equal(("Der Fluch", "Nebel über Barovia."), (updated.Name, updated.Description));
        var card = await player.CampaignSummaryAsync(campaign.Id);
        Assert.Equal(("Der Fluch", "Nebel über Barovia."), (card.Name, card.Description));
        Assert.Null((await dm.UpdateCampaignAsync(campaign.Id, "Der Fluch", "   ")).Description);

        var byPlayer = await player.Client.PutAsJsonAsync(
            $"/api/campaigns/{campaign.Id}", new UpdateCampaignRequest("Meins", null), Json);
        Assert.Equal(HttpStatusCode.Forbidden, byPlayer.StatusCode);
        var tooLong = await dm.Client.PutAsJsonAsync(
            $"/api/campaigns/{campaign.Id}", new UpdateCampaignRequest("Der Fluch", new string('a', Campaign.DescriptionMaxLength + 1)), Json);
        await tooLong.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.DescriptionInvalid, "description");
        var noName = await dm.Client.PutAsJsonAsync($"/api/campaigns/{campaign.Id}", new UpdateCampaignRequest(" ", null), Json);
        await noName.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NameInvalid, "name");
        Assert.Equal("Der Fluch", (await dm.GetCampaignAsync(campaign.Id)).Name);
    }

    [Fact]
    public async Task A_new_join_code_replaces_the_old_one()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var latecomer = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();

        var replaced = await (await dm.Client.PostAsync($"/api/campaigns/{campaign.Id}/join-code", null))
            .ReadAsync<JoinCodeResponse>(HttpStatusCode.OK);

        Assert.NotEqual(campaign.JoinCode, replaced.JoinCode);
        Assert.Equal(replaced.JoinCode, (await dm.GetCampaignAsync(campaign.Id)).JoinCode);
        var withOld = await latecomer.Client.PostAsJsonAsync(
            "/api/campaigns/join", new JoinCampaignRequest(campaign.JoinCode!), Json);
        await withOld.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.JoinCodeInvalid, "code");
        Assert.Equal(campaign.Id, (await latecomer.JoinAsync(replaced.JoinCode)).Id);
    }

    [Fact]
    public async Task A_dm_promotes_a_player_who_then_sees_the_join_code()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        await player.JoinAsync(campaign.JoinCode!);

        var promoted = await (await dm.Client.PostAsync($"/api/campaigns/{campaign.Id}/members/{player.Id}/promote", null))
            .ReadAsync<MemberResponse>(HttpStatusCode.OK);
        var again = await (await dm.Client.PostAsync($"/api/campaigns/{campaign.Id}/members/{player.Id}/promote", null))
            .ReadAsync<MemberResponse>(HttpStatusCode.OK);

        Assert.Equal((player.Id, "Brom", CampaignRole.Dm), (promoted.UserId, promoted.DisplayName, promoted.Role));
        Assert.Equal(promoted, again);
        var asPromoted = await player.GetCampaignAsync(campaign.Id);
        Assert.Equal(CampaignRole.Dm, asPromoted.MyRole);
        Assert.Equal(campaign.JoinCode, asPromoted.JoinCode);
        Assert.Equal(dm.Id, asPromoted.DefaultDmUserId);
    }

    [Fact]
    public async Task Promoting_someone_who_is_not_a_member_is_not_found()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var outsider = await fixture.App.CreatePersonAsync("Fremd");
        var campaign = await dm.CreateCampaignAsync();

        var response = await dm.Client.PostAsync($"/api/campaigns/{campaign.Id}/members/{outsider.Id}/promote", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Players_can_neither_replace_the_join_code_nor_promote()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        await player.JoinAsync(campaign.JoinCode!);

        var joinCode = await player.Client.PostAsync($"/api/campaigns/{campaign.Id}/join-code", null);
        var promote = await player.Client.PostAsync($"/api/campaigns/{campaign.Id}/members/{player.Id}/promote", null);

        Assert.Equal(HttpStatusCode.Forbidden, joinCode.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, promote.StatusCode);
        Assert.Equal(CampaignRole.Player, (await player.GetCampaignAsync(campaign.Id)).MyRole);
    }

    [Fact]
    public async Task Non_members_are_refused_on_every_campaign_route()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var outsider = await fixture.App.CreatePersonAsync("Fremd");
        var campaign = await dm.CreateCampaignAsync();
        var session = await dm.CreateSessionAsync(campaign.Id);
        var character = await (await dm.Client.PostAsJsonAsync(
                $"/api/campaigns/{campaign.Id}/characters", new CharacterRequest("Oreana", CreatureSize.Medium), Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.Created);
        var root = $"/api/campaigns/{campaign.Id}";
        var characterBody = JsonContent.Create(new CharacterRequest("Dieb", CreatureSize.Small), options: Json);
        var sessionBody = JsonContent.Create(new CreateSessionRequest("Abend", new DateOnly(2026, 10, 17), null), options: Json);
        var dmBody = JsonContent.Create(new ChangeSessionDmRequest(outsider.Id), options: Json);

        var requests = new (HttpMethod Method, string Url, HttpContent? Body)[]
        {
            (HttpMethod.Get, root, null),
            (HttpMethod.Post, $"{root}/join-code", null),
            (HttpMethod.Post, $"{root}/members/{outsider.Id}/promote", null),
            (HttpMethod.Get, $"{root}/characters", null),
            (HttpMethod.Post, $"{root}/characters", characterBody),
            (HttpMethod.Put, $"{root}/characters/{character.Id}", characterBody),
            (HttpMethod.Get, $"{root}/sessions", null),
            (HttpMethod.Post, $"{root}/sessions", sessionBody),
            (HttpMethod.Post, $"{root}/sessions/{session.Id}/activate", null),
            (HttpMethod.Post, $"{root}/sessions/{session.Id}/end", null),
            (HttpMethod.Put, $"{root}/sessions/{session.Id}/dm", dmBody),
        };

        foreach (var (method, url, body) in requests)
        {
            var response = await outsider.Client.SendAsync(new HttpRequestMessage(method, url) { Content = body });
            Assert.True(response.StatusCode == HttpStatusCode.Forbidden, $"{method} {url}: {response.StatusCode}");
        }

        Assert.Equal(SessionStatus.Planned, (await dm.Client.GetFromJsonAsync<List<SessionResponse>>($"{root}/sessions", Json))![0].Status);
    }
}
