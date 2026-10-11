using System.Net;

namespace OreanasOffice.Server.Tests;

[Collection("App")]
public sealed class AuthorizationTests(AppFixture fixture)
{
    [Fact]
    public async Task Campaign_routes_need_a_signed_in_user()
    {
        using var client = fixture.App.CreateClient();

        var response = await client.GetAsync($"/api/campaigns/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Campaign_routes_refuse_non_members()
    {
        var user = await fixture.App.CreateUserAsync();
        using var client = fixture.App.CreateClientFor(user);

        var response = await client.GetAsync($"/api/campaigns/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Admin_routes_refuse_users_who_are_not_admin()
    {
        var user = await fixture.App.CreateUserAsync();
        using var client = fixture.App.CreateClientFor(user);

        var response = await client.GetAsync("/api/admin/invites");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }
}
