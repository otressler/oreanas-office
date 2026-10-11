using System.Net;
using System.Net.Http.Json;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Net.Http.Headers;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Tests;

[Collection("App")]
public sealed class AuthTests(AppFixture fixture)
{
    private AppFactory App => fixture.App;

    [Fact]
    public async Task Invite_status_tells_valid_from_unknown_tokens()
    {
        var (invite, token) = await App.CreateInviteAsync();
        using var client = App.CreateClient();

        var valid = await (await client.GetAsync($"/api/auth/invites/{token}")).ReadAsync<InviteStatusResponse>();
        var unknown = await (await client.GetAsync("/api/auth/invites/not-a-token")).ReadAsync<InviteStatusResponse>();

        Assert.Equal(new InviteStatusResponse(true, invite.ExpiresAt), valid);
        Assert.Equal(new InviteStatusResponse(false, null), unknown);
    }

    [Fact]
    public async Task Registering_signs_in_with_a_cookie_that_lasts_180_days()
    {
        var (_, token) = await App.CreateInviteAsync();
        using var client = App.CreateClient();
        var email = TestAccounts.NewEmail();

        var response = await client.RegisterAsync(token, $"  {email} ", "  Brunhild  ");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var me = await response.ReadAsync<MeResponse>();
        Assert.Equal(("Brunhild", email, false, true, false), (me.DisplayName, me.Email, me.IsAdmin, me.HasPassword, me.HasGoogle));

        var cookie = SetCookieHeaderValue.ParseList(response.Headers.GetValues(HeaderNames.SetCookie).ToList())
            .Single(c => c.Name == "oreana.auth");
        Assert.True(cookie.HttpOnly);
        Assert.NotNull(cookie.Expires);
        Assert.InRange(cookie.Expires.Value - DateTimeOffset.UtcNow, TimeSpan.FromDays(179), TimeSpan.FromDays(181));

        Assert.Equal(me, await (await client.GetAsync("/api/auth/me")).ReadAsync<MeResponse>());
    }

    [Fact]
    public async Task One_invite_works_for_several_people()
    {
        var (_, token) = await App.CreateInviteAsync();

        using var first = App.CreateClient();
        using var second = App.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await first.RegisterAsync(token)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await second.RegisterAsync(token)).StatusCode);
    }

    [Fact]
    public async Task Registering_needs_an_invite_that_is_not_expired_or_revoked()
    {
        var (revoked, revokedToken) = await App.CreateInviteAsync();
        var admin = await App.CreateUserAsync(isAdmin: true);
        using (var adminClient = App.CreateClientFor(admin))
        {
            Assert.Equal(HttpStatusCode.NoContent, (await adminClient.DeleteAsync($"/api/admin/invites/{revoked.Id}")).StatusCode);
        }

        var expiredToken = await CreateExpiredInviteAsync(admin.Id);
        using var client = App.CreateClient();

        foreach (var token in new[] { revokedToken, expiredToken, "unknown" })
        {
            await TestAccounts.AssertErrorAsync(await client.RegisterAsync(token), ApiErrorCode.InviteInvalid);
            var status = await (await client.GetAsync($"/api/auth/invites/{token}")).ReadAsync<InviteStatusResponse>();
            Assert.False(status.Valid);
        }

        await TestAccounts.AssertErrorAsync(await client.RegisterAsync(""), ApiErrorCode.InviteInvalid);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Theory]
    [InlineData("", "ok@example.test", "long-enough", ApiErrorCode.DisplayNameInvalid, "displayName")]
    [InlineData("   ", "ok@example.test", "long-enough", ApiErrorCode.DisplayNameInvalid, "displayName")]
    [InlineData("Name that is far too long for a token label", "ok@example.test", "long-enough", ApiErrorCode.DisplayNameInvalid, "displayName")]
    [InlineData("Brunhild", "not-an-address", "long-enough", ApiErrorCode.EmailInvalid, "email")]
    [InlineData("Brunhild", "Brunhild <b@example.test>", "long-enough", ApiErrorCode.EmailInvalid, "email")]
    [InlineData("Brunhild", "", "long-enough", ApiErrorCode.EmailInvalid, "email")]
    [InlineData("Brunhild", null, "short", ApiErrorCode.PasswordTooShort, "password")]
    public async Task Registering_checks_the_form(
        string displayName, string? email, string password, ApiErrorCode code, string field)
    {
        var (_, token) = await App.CreateInviteAsync();
        using var client = App.CreateClient();

        var response = await client.RegisterAsync(token, email, displayName, password);

        await TestAccounts.AssertErrorAsync(response, code, field);
    }

    [Fact]
    public async Task Registering_refuses_an_address_that_is_taken()
    {
        var existing = await App.CreateUserAsync();
        var (_, token) = await App.CreateInviteAsync();
        using var client = App.CreateClient();

        var response = await client.RegisterAsync(token, existing.Email!.ToUpperInvariant());

        await TestAccounts.AssertErrorAsync(response, ApiErrorCode.EmailTaken, "email");
    }

    [Fact]
    public async Task A_local_account_with_the_admin_address_is_not_admin()
    {
        var adminEmail = TestAccounts.NewEmail();
        await using var app = fixture.CreateApp(configuration: new Dictionary<string, string?> { ["Admin:Email"] = adminEmail });
        var (_, token) = await app.CreateInviteAsync();
        using var client = app.CreateClient();

        var me = await (await client.RegisterAsync(token, adminEmail)).ReadAsync<MeResponse>();

        Assert.False(me.IsAdmin);
        Assert.False((await app.FindUserAsync(me.Id)).IsAdmin);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/invites")).StatusCode);
    }

    [Fact]
    public async Task Signing_in_with_email_and_password()
    {
        var user = await App.CreateUserAsync("Gimli");
        using var client = App.CreateClient();

        var response = await client.LoginAsync($" {user.Email!.ToUpperInvariant()} ");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(user.Id, (await response.ReadAsync<MeResponse>()).Id);
        Assert.Contains(response.Headers.GetValues(HeaderNames.SetCookie), c => c.StartsWith("oreana.auth=") && c.Contains("expires="));
        Assert.Equal("Gimli", (await (await client.GetAsync("/api/auth/me")).ReadAsync<MeResponse>()).DisplayName);
    }

    [Fact]
    public async Task Wrong_passwords_unknown_addresses_and_google_only_accounts_are_invalid_credentials()
    {
        var user = await App.CreateUserAsync();
        var googleOnly = await App.CreateUserAsync(withPassword: false);
        using var client = App.CreateClient();

        await TestAccounts.AssertErrorAsync(await client.LoginAsync(user.Email!, "wrong-password"), ApiErrorCode.InvalidCredentials);
        await TestAccounts.AssertErrorAsync(await client.LoginAsync(TestAccounts.NewEmail()), ApiErrorCode.InvalidCredentials);
        await TestAccounts.AssertErrorAsync(await client.LoginAsync(googleOnly.Email!, ""), ApiErrorCode.InvalidCredentials);
        await TestAccounts.AssertErrorAsync(await client.LoginAsync("not-an-address"), ApiErrorCode.InvalidCredentials);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Five_wrong_passwords_lock_the_account()
    {
        var user = await App.CreateUserAsync();
        using var client = App.CreateClient();

        for (var attempt = 1; attempt < 5; attempt++)
        {
            await TestAccounts.AssertErrorAsync(await client.LoginAsync(user.Email!, "wrong-password"), ApiErrorCode.InvalidCredentials);
        }

        await TestAccounts.AssertErrorAsync(await client.LoginAsync(user.Email!, "wrong-password"), ApiErrorCode.LockedOut);
        await TestAccounts.AssertErrorAsync(await client.LoginAsync(user.Email!), ApiErrorCode.LockedOut);
    }

    [Fact]
    public async Task Signing_out_ends_the_session()
    {
        var user = await App.CreateUserAsync();
        using var client = App.CreateClient();
        await client.LoginAsync(user.Email!);

        var response = await client.PostAsync("/api/auth/logout", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
    }

    [Fact]
    public async Task Me_is_unauthorized_without_sign_in()
    {
        using var client = App.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await client.PutAsJsonAsync("/api/auth/me", new UpdateProfileRequest("Name"))).StatusCode);
    }

    [Fact]
    public async Task Changing_the_display_name()
    {
        var user = await App.CreateUserAsync("Alt");
        using var client = App.CreateClientFor(user);

        var response = await client.PutAsJsonAsync("/api/auth/me", new UpdateProfileRequest("  Neu  "));
        var tooLong = await client.PutAsJsonAsync("/api/auth/me", new UpdateProfileRequest(new string('x', AppUser.DisplayNameMaxLength + 1)));

        Assert.Equal("Neu", (await response.ReadAsync<MeResponse>()).DisplayName);
        await TestAccounts.AssertErrorAsync(tooLong, ApiErrorCode.DisplayNameInvalid, "displayName");
        Assert.Equal("Neu", (await App.FindUserAsync(user.Id)).DisplayName);
    }

    [Fact]
    public async Task The_testing_invite_endpoint_exists_only_in_the_E2E_environment()
    {
        using var client = App.CreateClient();
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync("/api/testing/invites", null)).StatusCode);

        await using var e2e = fixture.CreateApp(environment: TestingEndpoints.Environment);
        using var e2eClient = e2e.CreateClient();
        var response = await e2eClient.PostAsync("/api/testing/invites", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var invite = await response.ReadAsync<CreatedInviteResponse>();
        Assert.StartsWith("http://localhost/einladung/", invite.Url);
        Assert.Equal(HttpStatusCode.OK, (await e2eClient.RegisterAsync(invite.Url.Split('/')[^1])).StatusCode);

        // A second call reuses the creator.
        Assert.Equal(HttpStatusCode.OK, (await e2eClient.PostAsync("/api/testing/invites", null)).StatusCode);
    }

    private async Task<string> CreateExpiredInviteAsync(Guid createdBy)
    {
        var token = $"expired-{Guid.NewGuid():N}";
        await using var scope = App.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var createdAt = DateTimeOffset.UtcNow - RegistrationInvite.Lifetime - TimeSpan.FromMinutes(1);
        db.RegistrationInvites.Add(new RegistrationInvite
        {
            TokenHash = Invites.Hash(token),
            CreatedByUserId = createdBy,
            CreatedAt = createdAt,
            ExpiresAt = createdAt + RegistrationInvite.Lifetime,
        });
        await db.SaveChangesAsync();
        return token;
    }
}
