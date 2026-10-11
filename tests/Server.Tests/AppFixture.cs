using Microsoft.Data.SqlClient;
using Testcontainers.Azurite;
using Testcontainers.MsSql;

namespace OreanasOffice.Server.Tests;

// One SQL Server and one Azurite container, a fake frontend build and a running
// app, shared by every test class in the "App" collection.
public sealed class AppFixture : IAsyncLifetime
{
    private readonly MsSqlContainer _sql = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private readonly AzuriteContainer _azurite = new AzuriteBuilder("mcr.microsoft.com/azure-storage/azurite:latest")
        .WithInMemoryPersistence()
        // Azure.Storage.Blobs speaks a newer API version than Azurite has caught up with.
        .WithCommand("--skipApiVersionCheck")
        .Build();

    public string DatabaseConnectionString { get; private set; } = "";
    public string StorageConnectionString => _azurite.GetConnectionString();
    public string WebRoot { get; } = FakeWebRoot.Create();

    // The app against the healthy containers. Tests may create more with CreateApp.
    public AppFactory App { get; private set; } = null!;

    public AppFactory CreateApp(
        string? databaseConnectionString = null,
        IReadOnlyDictionary<string, string?>? configuration = null,
        string environment = AppFactory.TestingEnvironment) =>
        new(databaseConnectionString ?? DatabaseConnectionString, StorageConnectionString, WebRoot, configuration, environment);

    public async Task InitializeAsync()
    {
        await Task.WhenAll(_sql.StartAsync(), _azurite.StartAsync());

        DatabaseConnectionString = new SqlConnectionStringBuilder(_sql.GetConnectionString())
        {
            InitialCatalog = "OreanasOffice",
        }.ConnectionString;

        App = CreateApp();
        App.StartServer();
    }

    public async Task DisposeAsync()
    {
        await App.DisposeAsync();
        await Task.WhenAll(_sql.DisposeAsync().AsTask(), _azurite.DisposeAsync().AsTask());
        Directory.Delete(WebRoot, recursive: true);
    }
}

[CollectionDefinition("App")]
public sealed class AppCollection : ICollectionFixture<AppFixture>;
