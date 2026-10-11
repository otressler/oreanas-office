using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;

namespace OreanasOffice.Server.Tests;

public sealed class AppFactory(string databaseConnectionString, string storageConnectionString, string webRoot)
    : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        // Not Development, so appsettings.Development.json's local connection strings stay out.
        builder.UseEnvironment("Testing");
        builder.UseWebRoot(webRoot);
        builder.ConfigureAppConfiguration(config => config.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:Database"] = databaseConnectionString,
            ["ConnectionStrings:Storage"] = storageConnectionString,
        }));
        builder.ConfigureTestServices(services => services.AddTestAuth());
    }
}
