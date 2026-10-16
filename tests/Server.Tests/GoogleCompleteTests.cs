using System.Net;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Net.Http.Headers;
using OreanasOffice.Server.Accounts;

namespace OreanasOffice.Server.Tests;

// /api/auth/google/complete with Google's answer faked (FakeGoogle): signs in,
// registers or links, and redirects to the right frontend page.
public sealed class GoogleCompleteTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private static readonly WebApplicationFactoryClientOptions NoRedirects = new() { AllowAutoRedirect = false };

    private AppFactory App => fixture.App;

    [Fact]
    public async Task A_first_sign_in_with_an_invite_registers_and_signs_in_persistently()
    {
        var (_, token) = await App.CreateInviteAsync();
        using var client = App.CreateClient(NoRedirects);

        var response = await CompleteAsync(client, FakeGoogle.AnswerUrl(NewAccount(), "login", "/kampagnen/1", token));

        AssertRedirect(response, "/kampagnen/1");
        var cookie = SetCookieHeaderValue.ParseList(response.Headers.GetValues(HeaderNames.SetCookie).ToList())
            .Single(c => c.Name == "oreana.auth" && c.Expires > DateTimeOffset.UtcNow);
        Assert.InRange(cookie.Expires!.Value - DateTimeOffset.UtcNow, TimeSpan.FromDays(179), TimeSpan.FromDays(181));

        var me = await (await client.GetAsync("/api/auth/me")).ReadAsync<MeResponse>();
        Assert.Equal(("Eowyn", false, true, false), (me.DisplayName, me.HasPassword, me.HasGoogle, me.IsAdmin));
    }

    [Fact]
    public async Task Failures_go_back_to_the_page_that_can_explain_them()
    {
        var local = await App.CreateUserAsync();
        using var client = App.CreateClient(NoRedirects);

        AssertRedirect(await CompleteAsync(client, FakeGoogle.AnswerUrl(NewAccount(), "login")), "/anmelden?fehler=googleNoInvite");
        AssertRedirect(
            await CompleteAsync(client, FakeGoogle.AnswerUrl(NewAccount(), "login", invite: "dead/token")),
            "/einladung/dead%2Ftoken?fehler=inviteInvalid");
        AssertRedirect(
            await CompleteAsync(client, FakeGoogle.AnswerUrl(NewAccount(email: local.Email), "login")),
            "/anmelden?fehler=googleEmailTaken");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Google_answers_are_used_once()
    {
        var (_, token) = await App.CreateInviteAsync();
        using var client = App.CreateClient(NoRedirects);
        await CompleteAsync(client, FakeGoogle.AnswerUrl(NewAccount(), "login", invite: token));

        var again = await client.GetAsync("/api/auth/google/complete");

        AssertRedirect(again, "/anmelden?fehler=googleFailed");
    }

    [Fact]
    public async Task The_admin_address_becomes_admin_on_its_first_google_sign_in()
    {
        var adminEmail = TestAccounts.NewEmail();
        await using var app = fixture.CreateApp(configuration: new Dictionary<string, string?> { ["Admin:Email"] = adminEmail });
        using var client = app.CreateClient(NoRedirects);

        AssertRedirect(await CompleteAsync(client, FakeGoogle.AnswerUrl(NewAccount(email: adminEmail), "login")), "/");

        Assert.True((await (await client.GetAsync("/api/auth/me")).ReadAsync<MeResponse>()).IsAdmin);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/invites")).StatusCode);
    }

    [Fact]
    public async Task Linking_from_the_profile_adds_google_to_the_signed_in_account()
    {
        var user = await App.CreateUserAsync();
        using var client = App.CreateClient(NoRedirects);
        await client.LoginAsync(user.Email!);
        var account = NewAccount();

        AssertRedirect(await CompleteAsync(client, FakeGoogle.AnswerUrl(account, "link", userId: user.Id)), "/profil");

        var me = await (await client.GetAsync("/api/auth/me")).ReadAsync<MeResponse>();
        Assert.Equal((user.Id, true, true), (me.Id, me.HasPassword, me.HasGoogle));

        // Signing in with Google now reaches the same account.
        using var other = App.CreateClient(NoRedirects);
        AssertRedirect(await CompleteAsync(other, FakeGoogle.AnswerUrl(account, "login")), "/");
        Assert.Equal(user.Id, (await (await other.GetAsync("/api/auth/me")).ReadAsync<MeResponse>()).Id);

        AssertRedirect(
            await CompleteAsync(client, FakeGoogle.AnswerUrl(NewAccount(), "link", userId: user.Id)),
            "/profil?fehler=googleAlreadyLinked");
    }

    [Fact]
    public async Task Linking_needs_the_account_that_started_it()
    {
        var user = await App.CreateUserAsync();
        var someoneElse = await App.CreateUserAsync();
        using var client = App.CreateClient(NoRedirects);
        await client.LoginAsync(user.Email!);
        using var anonymous = App.CreateClient(NoRedirects);

        AssertRedirect(
            await CompleteAsync(client, FakeGoogle.AnswerUrl(NewAccount(), "link", userId: someoneElse.Id)),
            "/profil?fehler=googleFailed");
        AssertRedirect(
            await CompleteAsync(anonymous, FakeGoogle.AnswerUrl(NewAccount(), "link", userId: user.Id)),
            "/profil?fehler=googleFailed");
        Assert.False((await (await client.GetAsync("/api/auth/me")).ReadAsync<MeResponse>()).HasGoogle);
    }

    private static async Task<HttpResponseMessage> CompleteAsync(HttpClient client, string answerUrl)
    {
        Assert.Equal(HttpStatusCode.NoContent, (await client.GetAsync(answerUrl)).StatusCode);
        return await client.GetAsync("/api/auth/google/complete");
    }

    private static void AssertRedirect(HttpResponseMessage response, string location)
    {
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal(location, response.Headers.Location?.OriginalString);
    }

    private static GoogleAccount NewAccount(string? email = null) =>
        new($"google-{Guid.NewGuid():N}", email ?? TestAccounts.NewEmail(), EmailVerified: true, "Eowyn", "Eowyn of Rohan");
}
