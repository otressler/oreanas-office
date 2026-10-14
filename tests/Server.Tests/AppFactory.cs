using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;

namespace OreanasOffice.Server.Tests;

// `configuration` adds settings such as a Google client or Admin:Email.
public sealed class AppFactory(
    string databaseConnectionString,
    string storageConnectionString,
    string webRoot,
    IReadOnlyDictionary<string, string?>? configuration = null,
    string environment = AppFactory.TestingEnvironment)
    : WebApplicationFactory<Program>
{
    public const string TestingEnvironment = "Testing";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Not Development, so appsettings.Development.json's local connection strings stay out.
        builder.UseEnvironment(environment);
        builder.UseWebRoot(webRoot);
        builder.ConfigureAppConfiguration(config => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Database"] = databaseConnectionString,
            ["ConnectionStrings:Storage"] = storageConnectionString,
        }));

        // UseSetting, unlike ConfigureAppConfiguration, is visible while Program.cs
        // still configures services, where AddAccounts reads the Google client.
        foreach (var (key, value) in FakeImageClientExtensions.Settings.Concat(configuration ?? new Dictionary<string, string?>()))
        {
            builder.UseSetting(key, value);
        }

        builder.ConfigureTestServices(services =>
        {
            services.AddTestAuth();
            services.AddFakeGoogleAnswers();
            services.AddFakeImageClient();
        });
    }
}
