using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Tests;

// Invites, registrations and API errors for the account tests.
public static class TestAccounts
{
    // Like the app's JSON settings: enums as camelCase strings.
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static string NewEmail() => $"{Guid.NewGuid():N}@example.test";

    // An invite created by a fresh admin, and the token from its link.
    public static async Task<(CreatedInviteResponse Invite, string Token)> CreateInviteAsync(this AppFactory app)
    {
        var admin = await app.CreateUserAsync("Admin", isAdmin: true);
        using var client = app.CreateClientFor(admin);
        var response = await client.PostAsync("/api/admin/invites", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var invite = (await response.Content.ReadFromJsonAsync<CreatedInviteResponse>(Json))!;
        return (invite, invite.Url.Split('/')[^1]);
    }

    public static Task<HttpResponseMessage> RegisterAsync(
        this HttpClient client, string inviteToken, string? email = null, string displayName = "Neu", string password = TestUsers.Password) =>
        client.PostAsJsonAsync("/api/auth/register", new RegisterRequest(inviteToken, displayName, email ?? NewEmail(), password), Json);

    public static Task<HttpResponseMessage> LoginAsync(this HttpClient client, string email, string password = TestUsers.Password) =>
        client.PostAsJsonAsync("/api/auth/login", new LoginRequest(email, password), Json);

    public static async Task<T> ReadAsync<T>(this HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<T>(Json))!;

    public static async Task AssertErrorAsync(HttpResponseMessage response, ApiErrorCode code, string? field = null)
    {
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(new ApiError(code, field), await response.ReadAsync<ApiError>());
    }

    public static async Task<AppUser> FindUserAsync(this AppFactory app, Guid id)
    {
        await using var scope = app.Services.CreateAsyncScope();
        return (await scope.ServiceProvider.GetRequiredService<UserManager<AppUser>>().FindByIdAsync(id.ToString()))!;
    }
}
