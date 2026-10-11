using System.Net;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Tests;

// The decisions after Google answers, run through GoogleSignIn against the real
// database, and the parts of the HTTP flow that work without Google.
[Collection("App")]
public sealed class GoogleSignInTests(AppFixture fixture) : IAsyncLifetime
{
    private readonly string _adminEmail = TestAccounts.NewEmail();
    private AsyncServiceScope _scope;

    private AppFactory App => fixture.App;

    private GoogleSignIn Google => ActivatorUtilities.CreateInstance<GoogleSignIn>(
        _scope.ServiceProvider, Options.Create(new AdminOptions { Email = _adminEmail }));

    public Task InitializeAsync()
    {
        _scope = App.Services.CreateAsyncScope();
        return Task.CompletedTask;
    }

    public async Task DisposeAsync() => await _scope.DisposeAsync();

    [Fact]
    public async Task A_new_account_needs_an_invite()
    {
        var (_, token) = await App.CreateInviteAsync();
        var account = NewAccount(givenName: " Eowyn ");

        var outcome = await Google.LoginAsync(account, token);

        var user = AssertSuccess(outcome);
        Assert.Equal(("Eowyn", account.Email, account.Email, false), (user.DisplayName, user.Email, user.UserName, user.IsAdmin));
        Assert.Null(user.PasswordHash);
        Assert.Equal(user.Id, (await FindByLoginAsync(account))?.Id);
    }

    [Fact]
    public async Task Without_a_usable_invite_no_account_is_created()
    {
        var account = NewAccount();

        Assert.Equal(ApiErrorCode.GoogleNoInvite, (await Google.LoginAsync(account, null)).Error);
        Assert.Equal(ApiErrorCode.GoogleNoInvite, (await Google.LoginAsync(account, "")).Error);
        Assert.Equal(ApiErrorCode.InviteInvalid, (await Google.LoginAsync(account, "unknown-token")).Error);
        Assert.Null(await FindByLoginAsync(account));
        Assert.Null(await Users.FindByEmailAsync(account.Email!));
    }

    [Fact]
    public async Task A_linked_account_signs_in_without_an_invite()
    {
        var (_, token) = await App.CreateInviteAsync();
        var account = NewAccount();
        var created = AssertSuccess(await Google.LoginAsync(account, token));

        var outcome = await Google.LoginAsync(account with { Email = "changed@example.test" }, null);

        Assert.Equal(created.Id, AssertSuccess(outcome).Id);
    }

    [Fact]
    public async Task Accounts_are_never_merged_by_email_address()
    {
        var local = await App.CreateUserAsync();
        var (_, token) = await App.CreateInviteAsync();

        var outcome = await Google.LoginAsync(NewAccount(email: local.Email!.ToUpperInvariant()), token);

        Assert.Equal(ApiErrorCode.GoogleEmailTaken, outcome.Error);
        Assert.Empty(await Users.GetLoginsAsync((await Users.FindByIdAsync(local.Id.ToString()))!));
    }

    [Fact]
    public async Task The_display_name_falls_back_to_the_full_name_and_is_shortened()
    {
        var (_, token) = await App.CreateInviteAsync();
        var longName = "Galadriel " + new string('x', 50);

        var fromName = AssertSuccess(await Google.LoginAsync(NewAccount(givenName: " ", name: longName), token));
        var fromEmail = AssertSuccess(await Google.LoginAsync(NewAccount(givenName: null, name: null), token));

        Assert.Equal(longName[..AppUser.DisplayNameMaxLength], fromName.DisplayName);
        Assert.Equal(fromEmail.Email!.Split('@')[0], fromEmail.DisplayName);
    }

    [Fact]
    public async Task The_admin_address_creates_its_account_without_an_invite_and_becomes_admin()
    {
        var outcome = await Google.LoginAsync(NewAccount(email: _adminEmail.ToUpperInvariant()), null);

        var user = AssertSuccess(outcome);
        Assert.True(user.IsAdmin);

        // The claim is in the principal the sign-in cookie is made from.
        using var client = App.CreateClientFor(user);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/invites")).StatusCode);
    }

    [Fact]
    public async Task An_unverified_admin_address_is_an_ordinary_account()
    {
        var account = NewAccount(email: _adminEmail, emailVerified: false);
        Assert.Equal(ApiErrorCode.GoogleNoInvite, (await Google.LoginAsync(account, null)).Error);

        var (_, token) = await App.CreateInviteAsync();
        var user = AssertSuccess(await Google.LoginAsync(account, token));

        Assert.False(user.IsAdmin);
    }

    [Fact]
    public async Task A_linked_account_becomes_admin_when_the_admin_address_signs_in_verified()
    {
        var (_, token) = await App.CreateInviteAsync();
        var unverified = NewAccount(email: _adminEmail, emailVerified: false);
        Assert.False(AssertSuccess(await Google.LoginAsync(unverified, token)).IsAdmin);

        var user = AssertSuccess(await Google.LoginAsync(unverified with { EmailVerified = true }, null));

        Assert.True(user.IsAdmin);
        Assert.True((await App.FindUserAsync(user.Id)).IsAdmin);
    }

    [Fact]
    public async Task A_local_account_with_the_admin_address_stays_ordinary_until_it_links_google()
    {
        var local = await CreateLocalUserAsync(_adminEmail);

        Assert.Equal(ApiErrorCode.GoogleEmailTaken, (await Google.LoginAsync(NewAccount(email: _adminEmail), null)).Error);
        Assert.False((await App.FindUserAsync(local.Id)).IsAdmin);

        // Linking Google, which has verified the address, makes it the admin.
        var linked = AssertSuccess(await Google.LinkAsync(NewAccount(email: _adminEmail), local.Id));

        Assert.True(linked.IsAdmin);
        Assert.True((await App.FindUserAsync(local.Id)).IsAdmin);
    }

    [Fact]
    public async Task Linking_adds_google_to_the_account()
    {
        var local = await App.CreateUserAsync();
        var account = NewAccount();

        var outcome = await Google.LinkAsync(account, local.Id);

        Assert.Equal(local.Id, AssertSuccess(outcome).Id);
        Assert.False(outcome.User!.IsAdmin);
        Assert.Equal(local.Id, (await FindByLoginAsync(account))?.Id);
        Assert.Equal(local.Id, AssertSuccess(await Google.LoginAsync(account, null)).Id);
    }

    [Fact]
    public async Task Linking_a_google_account_that_belongs_to_someone_else_fails()
    {
        var (_, token) = await App.CreateInviteAsync();
        var account = NewAccount();
        var owner = AssertSuccess(await Google.LoginAsync(account, token));
        var local = await App.CreateUserAsync();

        var outcome = await Google.LinkAsync(account, local.Id);

        Assert.Equal(ApiErrorCode.GoogleAccountInUse, outcome.Error);
        Assert.Equal(owner.Id, (await FindByLoginAsync(account))?.Id);
    }

    [Fact]
    public async Task An_account_links_only_one_google_account()
    {
        var local = await App.CreateUserAsync();
        AssertSuccess(await Google.LinkAsync(NewAccount(), local.Id));

        Assert.Equal(ApiErrorCode.GoogleAlreadyLinked, (await Google.LinkAsync(NewAccount(), local.Id)).Error);
    }

    [Fact]
    public async Task Without_a_google_client_the_start_endpoints_report_a_failure()
    {
        var user = await App.CreateUserAsync();
        using var anonymous = App.CreateClient(new() { AllowAutoRedirect = false });
        using var signedIn = App.CreateClient(new() { AllowAutoRedirect = false });
        signedIn.DefaultRequestHeaders.Add(TestAuth.Header, user.Id.ToString());

        foreach (var response in new[]
                 {
                     await anonymous.GetAsync("/api/auth/google/login"),
                     await signedIn.GetAsync("/api/auth/google/link"),
                 })
        {
            Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
            Assert.Equal("/anmelden?fehler=googleFailed", response.Headers.Location?.OriginalString);
        }
    }

    [Fact]
    public async Task With_a_google_client_signing_in_goes_to_google_with_mode_return_path_and_invite()
    {
        await using var app = CreateAppWithGoogle();
        using var client = app.CreateClient(new() { AllowAutoRedirect = false });

        var response = await client.GetAsync("/api/auth/google/login?returnUrl=%2Fkampagnen%2F1&invite=abc");

        var properties = AssertGoogleChallenge(app, response);
        Assert.Equal("/api/auth/google/complete", properties.RedirectUri);
        Assert.Equal("login", properties.Items["oreana:mode"]);
        Assert.Equal("/kampagnen/1", properties.Items["oreana:returnUrl"]);
        Assert.Equal("abc", properties.Items["oreana:invite"]);
    }

    [Theory]
    [InlineData("//evil.example")]
    [InlineData("/\\evil.example")]
    [InlineData("https://evil.example/")]
    [InlineData("/\t/evil.example")]
    [InlineData("kampagnen")]
    [InlineData("")]
    public async Task Return_paths_to_other_sites_are_replaced_with_the_start_page(string returnUrl)
    {
        await using var app = CreateAppWithGoogle();
        using var client = app.CreateClient(new() { AllowAutoRedirect = false });

        var response = await client.GetAsync($"/api/auth/google/login?returnUrl={Uri.EscapeDataString(returnUrl)}");

        Assert.Equal("/", AssertGoogleChallenge(app, response).Items["oreana:returnUrl"]);
    }

    [Fact]
    public async Task Linking_needs_a_signed_in_user_and_remembers_it()
    {
        await using var app = CreateAppWithGoogle();
        var user = await app.CreateUserAsync();
        using var anonymous = app.CreateClient(new() { AllowAutoRedirect = false });
        using var signedIn = app.CreateClient(new() { AllowAutoRedirect = false });
        signedIn.DefaultRequestHeaders.Add(TestAuth.Header, user.Id.ToString());

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/auth/google/link")).StatusCode);
        var properties = AssertGoogleChallenge(app, await signedIn.GetAsync("/api/auth/google/link"));

        Assert.Equal("link", properties.Items["oreana:mode"]);
        Assert.Equal("/profil", properties.Items["oreana:returnUrl"]);
        Assert.Equal(user.Id.ToString(), properties.Items["oreana:userId"]);
    }

    [Fact]
    public async Task A_failed_or_cancelled_google_sign_in_goes_back_to_the_sign_in_page()
    {
        await using var app = CreateAppWithGoogle();
        using var client = app.CreateClient(new() { AllowAutoRedirect = false });

        var cancelled = await client.GetAsync("/api/auth/google/callback?error=access_denied&state=forged");
        var forged = await client.GetAsync("/api/auth/google/callback?code=abc&state=forged");
        var noAnswer = await client.GetAsync("/api/auth/google/complete");

        foreach (var response in new[] { cancelled, forged, noAnswer })
        {
            Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
            Assert.Equal("/anmelden?fehler=googleFailed", response.Headers.Location?.OriginalString);
        }
    }

    [Theory]
    [InlineData("""{"sub":"1","email":"a@example.test","email_verified":true}""", true)]
    [InlineData("""{"sub":"1","email":"a@example.test","email_verified":"true"}""", true)]
    [InlineData("""{"sub":"1","email":"a@example.test","email_verified":false}""", false)]
    [InlineData("""{"sub":"1","email":"a@example.test"}""", false)]
    public async Task Google_userinfo_tells_whether_the_address_is_verified(string userInfo, bool verified)
    {
        await using var app = CreateAppWithGoogle();
        var options = app.Services.GetRequiredService<IOptionsMonitor<GoogleOptions>>().Get(GoogleDefaults.AuthenticationScheme);
        var identity = new ClaimsIdentity();

        using var json = JsonDocument.Parse(userInfo);
        foreach (var action in options.ClaimActions)
        {
            action.Run(json.RootElement, identity, "Google");
        }

        Assert.Equal("a@example.test", identity.FindFirst(ClaimTypes.Email)?.Value);
        Assert.Equal(verified, identity.HasClaim(GoogleClaims.EmailVerified, "true"));
    }

    [Fact]
    public async Task The_options_say_whether_google_is_configured()
    {
        await using var app = CreateAppWithGoogle();

        Assert.True((await (await app.CreateClient().GetAsync("/api/auth/options")).ReadAsync<AuthOptionsResponse>()).GoogleEnabled);
        Assert.False((await (await App.CreateClient().GetAsync("/api/auth/options")).ReadAsync<AuthOptionsResponse>()).GoogleEnabled);
    }

    private UserManager<AppUser> Users => _scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>();

    private Task<AppUser?> FindByLoginAsync(GoogleAccount account) =>
        Users.FindByLoginAsync(GoogleSignIn.Provider, account.ProviderKey);

    private async Task<AppUser> CreateLocalUserAsync(string email)
    {
        var user = new AppUser { DisplayName = "Lokal", Email = email, UserName = email, CreatedAt = DateTimeOffset.UtcNow };
        Assert.True((await Users.CreateAsync(user, TestUsers.Password)).Succeeded);
        return user;
    }

    private static GoogleAccount NewAccount(
        string? email = null, bool emailVerified = true, string? givenName = "Eowyn", string? name = "Eowyn of Rohan") =>
        new($"google-{Guid.NewGuid():N}", email ?? TestAccounts.NewEmail(), emailVerified, givenName, name);

    private static AppUser AssertSuccess(GoogleSignInOutcome outcome)
    {
        Assert.Null(outcome.Error);
        return Assert.IsType<AppUser>(outcome.User);
    }

    private AppFactory CreateAppWithGoogle() => fixture.CreateApp(configuration: new Dictionary<string, string?>
    {
        ["Authentication:Google:ClientId"] = "fake-client-id.apps.googleusercontent.com",
        ["Authentication:Google:ClientSecret"] = "fake-secret",
    });

    // The authentication properties travel encrypted in Google's state parameter.
    private static AuthenticationProperties AssertGoogleChallenge(AppFactory app, HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        var location = response.Headers.Location!;
        Assert.Equal("accounts.google.com", location.Host);

        var query = QueryHelpers.ParseQuery(location.Query);
        Assert.Equal("fake-client-id.apps.googleusercontent.com", query["client_id"]);
        Assert.Equal("http://localhost/api/auth/google/callback", query["redirect_uri"]);
        Assert.Contains("email", query["scope"].ToString());

        var options = app.Services.GetRequiredService<IOptionsMonitor<GoogleOptions>>().Get(GoogleDefaults.AuthenticationScheme);
        return options.StateDataFormat.Unprotect(query["state"])!;
    }
}
