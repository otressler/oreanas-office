using System.Net;

namespace OreanasOffice.Server.Tests;

[Collection("App")]
public sealed class StaticFileTests(AppFixture fixture)
{
    [Theory]
    [InlineData("/")]
    [InlineData("/index.html")]
    [InlineData("/sw.js")]
    [InlineData("/registerSW.js")]
    [InlineData("/workbox-3e5a1b2c.js")]
    [InlineData("/manifest.webmanifest")]
    public async Task Shell_files_are_revalidated(string path)
    {
        using var client = fixture.App.CreateClient();

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.CacheControl!.NoCache);
    }

    [Fact]
    public async Task Hashed_assets_are_cached_for_a_year()
    {
        using var client = fixture.App.CreateClient();

        var response = await client.GetAsync("/assets/index-Bx7k2Q.js");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("public, max-age=31536000, immutable", response.Headers.CacheControl!.ToString());
    }

    [Fact]
    public async Task Client_routes_get_the_app_shell()
    {
        using var client = fixture.App.CreateClient();

        var response = await client.GetAsync("/campaigns/1");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(FakeWebRoot.IndexHtml, await response.Content.ReadAsStringAsync());
        Assert.True(response.Headers.CacheControl!.NoCache);
    }

    [Theory]
    [InlineData("/api/nope")]
    [InlineData("/api")]
    [InlineData("/hubs/nope")]
    [InlineData("/assets/missing.js")]
    public async Task Unknown_api_hub_and_file_paths_are_not_found(string path)
    {
        using var client = fixture.App.CreateClient();

        var response = await client.GetAsync(path);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
