using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Tests;

[Collection("App")]
public sealed class AdminTests(AppFixture fixture)
{
    private AppFactory App => fixture.App;

    [Fact]
    public async Task Creating_an_invite_shows_the_link_once_and_stores_only_a_hash()
    {
        var before = DateTimeOffset.UtcNow;

        var (invite, token) = await App.CreateInviteAsync();

        Assert.Equal($"http://localhost/einladung/{token}", invite.Url);
        Assert.Matches("^[A-Za-z0-9_-]{43}$", token);
        Assert.InRange(invite.ExpiresAt - before, TimeSpan.FromHours(4) - TimeSpan.FromMinutes(1), TimeSpan.FromHours(4) + TimeSpan.FromMinutes(1));

        await using var scope = App.Services.CreateAsyncScope();
        var stored = await scope.ServiceProvider.GetRequiredService<AppDbContext>().RegistrationInvites.SingleAsync(i => i.Id == invite.Id);
        Assert.Equal(Invites.Hash(token), stored.TokenHash);
        Assert.Matches("^[0-9a-f]{64}$", stored.TokenHash);
        Assert.Equal(stored.CreatedAt + RegistrationInvite.Lifetime, stored.ExpiresAt);
    }

    [Fact]
    public async Task Listing_shows_usable_invites_newest_first()
    {
        var admin = await App.CreateUserAsync(isAdmin: true);
        using var client = App.CreateClientFor(admin);
        var older = await (await client.PostAsync("/api/admin/invites", null)).ReadAsync<CreatedInviteResponse>();
        var revoked = await (await client.PostAsync("/api/admin/invites", null)).ReadAsync<CreatedInviteResponse>();
        var newer = await (await client.PostAsync("/api/admin/invites", null)).ReadAsync<CreatedInviteResponse>();
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/admin/invites/{revoked.Id}")).StatusCode);

        var invites = await (await client.GetAsync("/api/admin/invites")).ReadAsync<List<InviteResponse>>();

        var ids = invites.Select(i => i.Id).ToList();
        Assert.DoesNotContain(revoked.Id, ids);
        Assert.True(ids.IndexOf(newer.Id) < ids.IndexOf(older.Id) && ids.IndexOf(newer.Id) >= 0);
        Assert.All(invites, i => Assert.True(i.ExpiresAt > DateTimeOffset.UtcNow));
        Assert.Equal(invites.OrderByDescending(i => i.CreatedAt).Select(i => i.Id), ids);
    }

    [Fact]
    public async Task Revoking_an_unknown_invite_is_not_found()
    {
        var admin = await App.CreateUserAsync(isAdmin: true);
        using var client = App.CreateClientFor(admin);

        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/admin/invites/{Guid.NewGuid()}")).StatusCode);
    }

    [Fact]
    public async Task Listing_users_by_display_name_with_their_sign_in_methods()
    {
        var admin = await App.CreateUserAsync("Admin", isAdmin: true);
        var zora = await App.CreateUserAsync("Zora");
        var arne = await App.CreateUserAsync("Arne", withPassword: false);
        await using (var scope = App.Services.CreateAsyncScope())
        {
            var users = scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();
            var result = await users.AddLoginAsync((await users.FindByIdAsync(arne.Id.ToString()))!, new UserLoginInfo("Google", $"google-{Guid.NewGuid():N}", "Google"));
            Assert.True(result.Succeeded);
        }

        using var client = App.CreateClientFor(admin);
        var list = await (await client.GetAsync("/api/admin/users")).ReadAsync<List<UserSummaryResponse>>();

        var ids = list.Select(u => u.Id).ToList();
        Assert.InRange(ids.IndexOf(arne.Id), 0, ids.IndexOf(zora.Id) - 1);
        Assert.Contains(new UserSummaryResponse(zora.Id, "Zora", zora.Email!, HasPassword: true, HasGoogle: false), list);
        Assert.Contains(new UserSummaryResponse(arne.Id, "Arne", arne.Email!, HasPassword: false, HasGoogle: true), list);
    }

    [Fact]
    public async Task A_reset_link_sets_a_new_password_once_and_ends_a_lockout()
    {
        var user = await App.CreateUserAsync();
        using var anonymous = App.CreateClient();
        for (var attempt = 0; attempt < 5; attempt++)
        {
            await anonymous.LoginAsync(user.Email!, "wrong-password");
        }

        var before = DateTimeOffset.UtcNow;
        var link = await CreateResetLinkAsync(user.Id);
        Assert.StartsWith($"http://localhost/passwort-zuruecksetzen?benutzer={user.Id}&token=", link.Url);
        Assert.InRange(link.ExpiresAt - before, TimeSpan.FromHours(24) - TimeSpan.FromMinutes(1), TimeSpan.FromHours(24) + TimeSpan.FromMinutes(1));
        var request = ResetRequest(link, "new-password");

        Assert.Equal(HttpStatusCode.NoContent, (await anonymous.PostAsJsonAsync("/api/auth/password-reset", request)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await anonymous.LoginAsync(user.Email!, "new-password")).StatusCode);
        await TestAccounts.AssertErrorAsync(
            await anonymous.PostAsJsonAsync("/api/auth/password-reset", request with { NewPassword = "another-password" }),
            ApiErrorCode.ResetLinkInvalid);
    }

    [Fact]
    public async Task A_reset_link_gives_a_google_only_account_its_first_password()
    {
        var user = await App.CreateUserAsync(withPassword: false);
        var link = await CreateResetLinkAsync(user.Id);
        using var anonymous = App.CreateClient();

        var response = await anonymous.PostAsJsonAsync("/api/auth/password-reset", ResetRequest(link, "first-password"));

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var me = await (await anonymous.LoginAsync(user.Email!, "first-password")).ReadAsync<MeResponse>();
        Assert.True(me.HasPassword);
    }

    [Fact]
    public async Task A_short_password_keeps_the_reset_link_working()
    {
        var user = await App.CreateUserAsync();
        var link = await CreateResetLinkAsync(user.Id);
        using var anonymous = App.CreateClient();

        await TestAccounts.AssertErrorAsync(
            await anonymous.PostAsJsonAsync("/api/auth/password-reset", ResetRequest(link, "short")),
            ApiErrorCode.PasswordTooShort,
            "newPassword");

        Assert.Equal(HttpStatusCode.NoContent,
            (await anonymous.PostAsJsonAsync("/api/auth/password-reset", ResetRequest(link, "long-enough"))).StatusCode);
    }

    [Fact]
    public async Task Bad_reset_links_are_refused()
    {
        var user = await App.CreateUserAsync();
        var other = await App.CreateUserAsync();
        var link = await CreateResetLinkAsync(user.Id);
        var request = ResetRequest(link, "new-password");
        using var anonymous = App.CreateClient();

        foreach (var bad in new[] { request with { Token = "nonsense" }, request with { Token = "" }, request with { UserId = other.Id }, request with { UserId = Guid.NewGuid() } })
        {
            await TestAccounts.AssertErrorAsync(await anonymous.PostAsJsonAsync("/api/auth/password-reset", bad), ApiErrorCode.ResetLinkInvalid);
        }

        Assert.Equal(HttpStatusCode.OK, (await anonymous.LoginAsync(user.Email!)).StatusCode);
    }

    [Fact]
    public async Task A_reset_link_for_an_unknown_user_is_not_found()
    {
        var admin = await App.CreateUserAsync(isAdmin: true);
        using var client = App.CreateClientFor(admin);

        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"/api/admin/users/{Guid.NewGuid()}/reset-link", null)).StatusCode);
    }

    [Theory]
    [InlineData("GET", "/api/admin/users")]
    [InlineData("POST", "/api/admin/invites")]
    [InlineData("POST", "/api/admin/users/00000000-0000-0000-0000-000000000001/reset-link")]
    public async Task Admin_routes_need_the_admin(string method, string path)
    {
        var user = await App.CreateUserAsync();
        using var client = App.CreateClientFor(user);
        using var anonymous = App.CreateClient();

        Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.SendAsync(new HttpRequestMessage(new HttpMethod(method), path))).StatusCode);
    }

    private async Task<ResetLinkResponse> CreateResetLinkAsync(Guid userId)
    {
        var admin = await App.CreateUserAsync(isAdmin: true);
        using var client = App.CreateClientFor(admin);
        var response = await client.PostAsync($"/api/admin/users/{userId}/reset-link", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return await response.ReadAsync<ResetLinkResponse>();
    }

    // What the frontend's reset page reads from the link.
    private static ResetPasswordRequest ResetRequest(ResetLinkResponse link, string newPassword)
    {
        var query = QueryHelpers.ParseQuery(new Uri(link.Url).Query);
        return new ResetPasswordRequest(Guid.Parse(query["benutzer"]!), query["token"]!, newPassword);
    }
}
