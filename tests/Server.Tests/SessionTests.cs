using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Sessions;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

public sealed class SessionTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private static readonly DateOnly Saturday = new(2026, 10, 17);

    [Fact]
    public async Task A_new_session_is_planned_and_run_by_the_default_dm()
    {
        var table = await CreateTableAsync();

        var response = await table.SecondDm.Client.PostAsJsonAsync(
            $"/api/campaigns/{table.CampaignId}/sessions", new CreateSessionRequest("  Die Seilbrücke  ", Saturday, null), Json);

        var session = await response.ReadAsync<SessionResponse>(HttpStatusCode.Created);
        Assert.Equal($"/api/campaigns/{table.CampaignId}/sessions/{session.Id}", response.Headers.Location?.OriginalString);
        Assert.Empty(session.Encounters);
        Assert.Equal(
            new SessionResponse(
                session.Id, "Die Seilbrücke", Saturday, SessionStatus.Planned, table.Dm.Id, "Oreana", table.SecondDm.Id,
                CanManage: false, IsSessionDm: false, ActiveEncounter: null, InterruptedEncounter: null, Encounters: session.Encounters),
            session);
    }

    [Fact]
    public async Task A_session_can_be_given_to_another_dm_member()
    {
        var table = await CreateTableAsync();

        var session = await table.Dm.CreateSessionAsync(table.CampaignId, dmUserId: table.SecondDm.Id);

        Assert.Equal((table.SecondDm.Id, "Yara", table.Dm.Id), (session.DmUserId, session.DmDisplayName, session.CreatedByUserId));
        Assert.True(session.CanManage);
    }

    [Fact]
    public async Task Only_dm_members_run_sessions()
    {
        var table = await CreateTableAsync();
        var outsider = await fixture.App.CreatePersonAsync("Fremd");
        var url = $"/api/campaigns/{table.CampaignId}/sessions";

        var player = await table.Dm.Client.PostAsJsonAsync(url, new CreateSessionRequest("Abend", Saturday, table.Player.Id), Json);
        var stranger = await table.Dm.Client.PostAsJsonAsync(url, new CreateSessionRequest("Abend", Saturday, outsider.Id), Json);

        await player.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NotADm, "dmUserId");
        await stranger.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NotADm, "dmUserId");
    }

    [Theory]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData(null)]
    public async Task Sessions_need_a_title(string? title)
    {
        var table = await CreateTableAsync();

        var response = await table.Dm.Client.PostAsJsonAsync(
            $"/api/campaigns/{table.CampaignId}/sessions", new CreateSessionRequest(title!, Saturday, null), Json);

        await response.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NameInvalid, "title");
    }

    [Fact]
    public async Task Titles_have_a_maximum_length()
    {
        var table = await CreateTableAsync();
        var url = $"/api/campaigns/{table.CampaignId}/sessions";

        var longest = await table.Dm.Client.PostAsJsonAsync(
            url, new CreateSessionRequest(new string('a', GameSession.TitleMaxLength), Saturday, null), Json);
        var tooLong = await table.Dm.Client.PostAsJsonAsync(
            url, new CreateSessionRequest(new string('a', GameSession.TitleMaxLength + 1), Saturday, null), Json);

        Assert.Equal(HttpStatusCode.Created, longest.StatusCode);
        await tooLong.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NameInvalid, "title");
    }

    [Fact]
    public async Task Players_cannot_create_sessions()
    {
        var table = await CreateTableAsync();

        var response = await table.Player.Client.PostAsJsonAsync(
            $"/api/campaigns/{table.CampaignId}/sessions", new CreateSessionRequest("Abend", Saturday, null), Json);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Sessions_are_listed_newest_first_with_who_can_manage_them()
    {
        var table = await CreateTableAsync();
        var older = await table.Dm.CreateSessionAsync(table.CampaignId, "Älter", Saturday.AddDays(-7));
        var first = await table.Dm.CreateSessionAsync(table.CampaignId, "Zuerst angelegt", Saturday);
        var second = await table.Dm.CreateSessionAsync(table.CampaignId, "Danach angelegt", Saturday, table.SecondDm.Id);

        var asPlayer = await ListAsync(table.Player, table.CampaignId);
        var asDefaultDm = await ListAsync(table.Dm, table.CampaignId);
        var asSecondDm = await ListAsync(table.SecondDm, table.CampaignId);
        var asThirdDm = await ListAsync(table.ThirdDm, table.CampaignId);

        Assert.Equal([second.Id, first.Id, older.Id], asPlayer.Select(s => s.Id));
        Assert.Equal([false, false, false], asPlayer.Select(s => s.CanManage));
        Assert.Equal([true, true, true], asDefaultDm.Select(s => s.CanManage));
        Assert.Equal([true, false, false], asSecondDm.Select(s => s.CanManage));
        Assert.Equal([false, false, false], asThirdDm.Select(s => s.CanManage));
    }

    [Fact]
    public async Task A_session_goes_from_planned_to_active_to_ended()
    {
        var table = await CreateTableAsync();
        var session = await table.Dm.CreateSessionAsync(table.CampaignId);

        var active = await PostAsync(table.Dm, table.CampaignId, session.Id, "activate");
        var stillActive = await PostAsync(table.Dm, table.CampaignId, session.Id, "activate");
        Assert.Equal(session.Id, (await table.Player.GetCampaignAsync(table.CampaignId)).ActiveSessionId);
        var ended = await PostAsync(table.Dm, table.CampaignId, session.Id, "end");
        var stillEnded = await PostAsync(table.Dm, table.CampaignId, session.Id, "end");

        Assert.Equal(SessionStatus.Active, (await active.ReadAsync<SessionResponse>(HttpStatusCode.OK)).Status);
        Assert.Equal(SessionStatus.Active, (await stillActive.ReadAsync<SessionResponse>(HttpStatusCode.OK)).Status);
        Assert.Equal(SessionStatus.Ended, (await ended.ReadAsync<SessionResponse>(HttpStatusCode.OK)).Status);
        Assert.Equal(SessionStatus.Ended, (await stillEnded.ReadAsync<SessionResponse>(HttpStatusCode.OK)).Status);
        Assert.Null((await table.Player.GetCampaignAsync(table.CampaignId)).ActiveSessionId);
    }

    [Fact]
    public async Task A_planned_session_can_be_ended_without_being_played()
    {
        var table = await CreateTableAsync();
        var session = await table.Dm.CreateSessionAsync(table.CampaignId);

        var ended = await PostAsync(table.Dm, table.CampaignId, session.Id, "end");

        Assert.Equal(SessionStatus.Ended, (await ended.ReadAsync<SessionResponse>(HttpStatusCode.OK)).Status);
    }

    [Fact]
    public async Task An_ended_session_cannot_be_handed_over()
    {
        var table = await CreateTableAsync();
        var session = await table.Dm.CreateSessionAsync(table.CampaignId);
        await PostAsync(table.Dm, table.CampaignId, session.Id, "end");

        var handOver = await ChangeDmAsync(table.Dm, table.CampaignId, session.Id, table.SecondDm.Id);

        await handOver.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.SessionEnded);
    }

    // knowledge/domain/session.md, "Continuing": when the group didn't get through it.
    [Fact]
    public async Task An_ended_session_can_be_continued_by_its_dm_or_the_default_dm()
    {
        var table = await CreateTableAsync();
        var session = await table.Dm.CreateSessionAsync(table.CampaignId, dmUserId: table.SecondDm.Id);
        await PostAsync(table.SecondDm, table.CampaignId, session.Id, "end");

        var byDefaultDm = await PostAsync(table.Dm, table.CampaignId, session.Id, "activate");

        Assert.Equal(SessionStatus.Active, (await byDefaultDm.ReadAsync<SessionResponse>(HttpStatusCode.OK)).Status);
    }

    [Fact]
    public async Task An_ended_session_is_not_continued_while_another_runs()
    {
        var table = await CreateTableAsync();
        var first = await table.Dm.CreateSessionAsync(table.CampaignId);
        var second = await table.Dm.CreateSessionAsync(table.CampaignId);
        await PostAsync(table.Dm, table.CampaignId, first.Id, "end");
        await PostAsync(table.Dm, table.CampaignId, second.Id, "activate");

        var response = await PostAsync(table.Dm, table.CampaignId, first.Id, "activate");

        await response.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.AnotherSessionActive);
    }

    // Only the session DM edits title and date.
    [Fact]
    public async Task The_session_dm_changes_title_and_date()
    {
        var table = await CreateTableAsync();
        var session = await table.Dm.CreateSessionAsync(table.CampaignId, dmUserId: table.SecondDm.Id);
        var path = $"/api/campaigns/{table.CampaignId}/sessions/{session.Id}";
        var request = new UpdateSessionRequest("  Die Rückkehr  ", Saturday.AddDays(7));

        var byDefaultDm = await table.Dm.Client.PutAsJsonAsync(path, request, Json);
        var bySessionDm = await table.SecondDm.Client.PutAsJsonAsync(path, request, Json);
        var empty = await table.SecondDm.Client.PutAsJsonAsync(path, request with { Title = " " }, Json);

        Assert.Equal(HttpStatusCode.Forbidden, byDefaultDm.StatusCode);
        var updated = await bySessionDm.ReadAsync<SessionResponse>(HttpStatusCode.OK);
        Assert.Equal(("Die Rückkehr", Saturday.AddDays(7), SessionStatus.Planned), (updated.Title, updated.Date, updated.Status));
        await empty.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NameInvalid, "title");
    }

    [Fact]
    public async Task A_session_is_read_by_members_only()
    {
        var table = await CreateTableAsync();
        var session = await table.Dm.CreateSessionAsync(table.CampaignId);
        var outsider = await fixture.App.CreatePersonAsync("Fremd");
        var path = $"/api/campaigns/{table.CampaignId}/sessions";

        var asPlayer = await table.Player.Client.GetAsync($"{path}/{session.Id}");
        var asOutsider = await outsider.Client.GetAsync($"{path}/{session.Id}");
        var unknown = await table.Player.Client.GetAsync($"{path}/{Guid.NewGuid()}");

        Assert.Equal(session.Id, (await asPlayer.ReadAsync<SessionResponse>(HttpStatusCode.OK)).Id);
        Assert.Equal(HttpStatusCode.Forbidden, asOutsider.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    [Fact]
    public async Task Only_one_session_per_campaign_is_active()
    {
        var table = await CreateTableAsync();
        var first = await table.Dm.CreateSessionAsync(table.CampaignId);
        var second = await table.Dm.CreateSessionAsync(table.CampaignId);
        await PostAsync(table.Dm, table.CampaignId, first.Id, "activate");

        var whileFirstIsActive = await PostAsync(table.Dm, table.CampaignId, second.Id, "activate");
        await PostAsync(table.Dm, table.CampaignId, first.Id, "end");
        var afterFirstEnded = await PostAsync(table.Dm, table.CampaignId, second.Id, "activate");

        await whileFirstIsActive.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.AnotherSessionActive);
        Assert.Equal(SessionStatus.Active, (await afterFirstEnded.ReadAsync<SessionResponse>(HttpStatusCode.OK)).Status);
    }

    [Fact]
    public async Task Sessions_of_different_campaigns_are_active_at_the_same_time()
    {
        var table = await CreateTableAsync();
        var otherCampaign = await table.Dm.CreateCampaignAsync("Andere Runde");
        var here = await table.Dm.CreateSessionAsync(table.CampaignId);
        var there = await table.Dm.CreateSessionAsync(otherCampaign.Id);

        var activateHere = await PostAsync(table.Dm, table.CampaignId, here.Id, "activate");
        var activateThere = await PostAsync(table.Dm, otherCampaign.Id, there.Id, "activate");

        Assert.Equal(HttpStatusCode.OK, activateHere.StatusCode);
        Assert.Equal(HttpStatusCode.OK, activateThere.StatusCode);
    }

    [Fact]
    public async Task Activating_two_sessions_at_once_leaves_exactly_one_active()
    {
        // Several rounds, so both outcomes of the race (the check sees the other
        // session, or the unique index rejects the second save) are likely to occur.
        for (var round = 0; round < 5; round++)
        {
            var table = await CreateTableAsync();
            var first = await table.Dm.CreateSessionAsync(table.CampaignId);
            var second = await table.Dm.CreateSessionAsync(table.CampaignId, dmUserId: table.SecondDm.Id);

            var responses = await Task.WhenAll(
                PostAsync(table.Dm, table.CampaignId, first.Id, "activate"),
                PostAsync(table.SecondDm, table.CampaignId, second.Id, "activate"));

            Assert.Single(responses, r => r.StatusCode == HttpStatusCode.OK);
            await Assert.Single(responses, r => r.StatusCode != HttpStatusCode.OK)
                .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.AnotherSessionActive);
            await using var scope = fixture.App.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(1, await db.Sessions.CountAsync(s => s.CampaignId == table.CampaignId && s.Status == SessionStatus.Active));
        }
    }

    [Fact]
    public async Task The_session_dm_and_the_default_dm_manage_a_session_but_other_dms_do_not()
    {
        var table = await CreateTableAsync();
        var session = await table.Dm.CreateSessionAsync(table.CampaignId, dmUserId: table.SecondDm.Id);

        foreach (var person in new[] { table.ThirdDm, table.Player })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await PostAsync(person, table.CampaignId, session.Id, "activate")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await PostAsync(person, table.CampaignId, session.Id, "end")).StatusCode);
            Assert.Equal(
                HttpStatusCode.Forbidden,
                (await ChangeDmAsync(person, table.CampaignId, session.Id, person.Id)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.OK, (await PostAsync(table.SecondDm, table.CampaignId, session.Id, "activate")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await PostAsync(table.Dm, table.CampaignId, session.Id, "end")).StatusCode);
    }

    [Fact]
    public async Task A_session_of_another_campaign_is_refused()
    {
        var table = await CreateTableAsync();
        var otherCampaign = await table.Dm.CreateCampaignAsync("Andere Runde");
        var elsewhere = await table.Dm.CreateSessionAsync(otherCampaign.Id);

        var activate = await PostAsync(table.Dm, table.CampaignId, elsewhere.Id, "activate");
        var end = await PostAsync(table.Dm, table.CampaignId, elsewhere.Id, "end");
        var handOver = await ChangeDmAsync(table.Dm, table.CampaignId, elsewhere.Id, table.SecondDm.Id);

        Assert.Equal(HttpStatusCode.Forbidden, activate.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, end.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, handOver.StatusCode);
    }

    [Fact]
    public async Task Handing_a_session_over_moves_who_can_manage_it()
    {
        var table = await CreateTableAsync();
        var session = await table.Dm.CreateSessionAsync(table.CampaignId, dmUserId: table.SecondDm.Id);

        var handedOver = await (await ChangeDmAsync(table.SecondDm, table.CampaignId, session.Id, table.ThirdDm.Id))
            .ReadAsync<SessionResponse>(HttpStatusCode.OK);
        var formerDm = await PostAsync(table.SecondDm, table.CampaignId, session.Id, "activate");
        var newDm = await PostAsync(table.ThirdDm, table.CampaignId, session.Id, "activate");

        Assert.Equal((table.ThirdDm.Id, "Zeno", false), (handedOver.DmUserId, handedOver.DmDisplayName, handedOver.CanManage));
        Assert.Equal(HttpStatusCode.Forbidden, formerDm.StatusCode);
        Assert.Equal(HttpStatusCode.OK, newDm.StatusCode);
    }

    [Fact]
    public async Task A_session_can_only_be_handed_to_a_dm_member()
    {
        var table = await CreateTableAsync();
        var outsider = await fixture.App.CreatePersonAsync("Fremd");
        var session = await table.Dm.CreateSessionAsync(table.CampaignId);

        var toPlayer = await ChangeDmAsync(table.Dm, table.CampaignId, session.Id, table.Player.Id);
        var toOutsider = await ChangeDmAsync(table.Dm, table.CampaignId, session.Id, outsider.Id);

        await toPlayer.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NotADm, "userId");
        await toOutsider.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NotADm, "userId");
        Assert.Equal(table.Dm.Id, (await ListAsync(table.Dm, table.CampaignId))[0].DmUserId);
    }

    // A campaign with its default DM (Oreana), two more `dm` members (Yara, Zeno)
    // and a player (Brom).
    private async Task<Table> CreateTableAsync()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var secondDm = await fixture.App.CreatePersonAsync("Yara");
        var thirdDm = await fixture.App.CreatePersonAsync("Zeno");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        foreach (var person in new[] { secondDm, thirdDm, player })
        {
            await person.JoinAsync(campaign.JoinCode!);
        }

        await dm.PromoteAsync(campaign.Id, secondDm.Id);
        await dm.PromoteAsync(campaign.Id, thirdDm.Id);
        return new Table(dm, secondDm, thirdDm, player, campaign.Id);
    }

    private sealed record Table(Person Dm, Person SecondDm, Person ThirdDm, Person Player, Guid CampaignId);

    private static Task<HttpResponseMessage> PostAsync(Person person, Guid campaignId, Guid sessionId, string action) =>
        person.Client.PostAsync($"/api/campaigns/{campaignId}/sessions/{sessionId}/{action}", null);

    private static Task<HttpResponseMessage> ChangeDmAsync(Person person, Guid campaignId, Guid sessionId, Guid userId) =>
        person.Client.PutAsJsonAsync(
            $"/api/campaigns/{campaignId}/sessions/{sessionId}/dm", new ChangeSessionDmRequest(userId), Json);

    [Fact]
    public async Task Sessions_need_a_date()
    {
        var dm = await fixture.App.CreatePersonAsync("Mira");
        var campaign = await dm.CreateCampaignAsync();

        var response = await dm.Client.PostAsJsonAsync($"/api/campaigns/{campaign.Id}/sessions", new { title = "Ohne Datum" });

        Assert.Equal(new ApiError(ApiErrorCode.DateInvalid, "date"), await response.ReadAsync<ApiError>(HttpStatusCode.BadRequest));
    }

    // Either order is a valid outcome now that an ended session can be continued: ended,
    // or running again when the start came after the end. It never stays planned.
    [Fact]
    public async Task Starting_and_ending_at_once_never_leaves_the_session_planned()
    {
        var dm = await fixture.App.CreatePersonAsync("Mira");
        var campaign = await dm.CreateCampaignAsync();

        for (var round = 0; round < 5; round++)
        {
            var session = await dm.CreateSessionAsync(campaign.Id, $"Runde {round}");
            var path = $"/api/campaigns/{campaign.Id}/sessions/{session.Id}";

            var responses = await Task.WhenAll(dm.Client.PostAsync($"{path}/activate", null), dm.Client.PostAsync($"{path}/end", null));

            Assert.All(responses, r => Assert.Equal(HttpStatusCode.OK, r.StatusCode));
            var status = (await ListAsync(dm, campaign.Id)).Single(s => s.Id == session.Id).Status;
            Assert.NotEqual(SessionStatus.Planned, status);
        }
    }

    private static async Task<List<SessionResponse>> ListAsync(Person person, Guid campaignId) =>
        await (await person.Client.GetAsync($"/api/campaigns/{campaignId}/sessions"))
            .ReadAsync<List<SessionResponse>>(HttpStatusCode.OK);
}
