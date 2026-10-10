using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Health;

namespace OreanasOffice.Server.Tests;

[Collection("App")]
public sealed class HealthTests(AppFixture fixture)
{
    // Nothing listens on port 1, so connecting fails at once.
    private const string UnreachableDatabase =
        "Server=127.0.0.1,1;Database=OreanasOffice;User Id=sa;Password=x;Connect Timeout=1;TrustServerCertificate=True";

    [Fact]
    public async Task Returns_ok_once_migrations_are_applied()
    {
        using var client = fixture.App.CreateClient();

        var response = await WaitForHealthyAsync(client, TimeSpan.FromSeconds(60));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ok", (await response.Content.ReadFromJsonAsync<HealthResponse>())!.Status);
        Assert.True(fixture.App.Services.GetRequiredService<DatabaseState>().IsMigrated);
    }

    [Fact]
    public async Task Returns_waking_while_the_database_is_unreachable()
    {
        await using var app = fixture.CreateApp(UnreachableDatabase);
        using var client = app.CreateClient();

        var beforeMigration = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, beforeMigration.StatusCode);
        Assert.Equal("waking", (await beforeMigration.Content.ReadFromJsonAsync<HealthResponse>())!.Status);

        // A database that was migrated and then paused: the connection check fails, within the cap.
        app.Services.GetRequiredService<DatabaseState>().MarkMigrated();
        var stopwatch = Stopwatch.StartNew();
        var afterMigration = await client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.ServiceUnavailable, afterMigration.StatusCode);
        Assert.InRange(stopwatch.Elapsed, TimeSpan.Zero, TimeSpan.FromSeconds(8));
    }

    [Fact]
    public async Task Returns_error_when_the_database_refuses_the_app()
    {
        // The database is awake but the login fails, as when grant-app-access.sql
        // hasn't been run. Waiting won't fix that, so the app stops retrying.
        // Slow on purpose: EF Core itself retries "login failed" for about a minute
        // while checking whether the database exists (new Azure databases need it).
        var wrongPassword = new SqlConnectionStringBuilder(fixture.DatabaseConnectionString) { Password = "wrong" };
        await using var app = fixture.CreateApp(wrongPassword.ConnectionString);
        using var client = app.CreateClient();

        var response = await WaitForStatusAsync(client, HttpStatusCode.InternalServerError, TimeSpan.FromSeconds(150));

        Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("error", (await response.Content.ReadFromJsonAsync<HealthResponse>())!.Status);
        Assert.Equal(MigrationStatus.Failed, app.Services.GetRequiredService<DatabaseState>().Status);
    }

    private static Task<HttpResponseMessage> WaitForHealthyAsync(HttpClient client, TimeSpan timeout) =>
        WaitForStatusAsync(client, HttpStatusCode.OK, timeout);

    private static async Task<HttpResponseMessage> WaitForStatusAsync(
        HttpClient client, HttpStatusCode expected, TimeSpan timeout)
    {
        var deadline = DateTime.UtcNow + timeout;
        while (true)
        {
            var response = await client.GetAsync("/api/health");
            if (response.StatusCode == expected || DateTime.UtcNow > deadline)
            {
                return response;
            }

            await Task.Delay(250);
        }
    }
}
