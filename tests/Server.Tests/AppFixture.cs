using Microsoft.Data.SqlClient;
using Testcontainers.Azurite;
using Testcontainers.MsSql;

[assembly: AssemblyFixture(typeof(OreanasOffice.Server.Tests.AppHost))]

namespace OreanasOffice.Server.Tests;

// One SQL Server and one Azurite container, a fake frontend build and a running app for
// the whole test run, started when the first AppFixture needs them, so a run of only the
// Unit tests needs no Docker. (xUnit creates assembly fixtures up front.)
public sealed class AppHost : IAsyncDisposable
{
    private readonly MsSqlContainer _sql = new MsSqlBuilder("mcr.microsoft.com/mssql/server:2022-latest").Build();
    private readonly AzuriteContainer _azurite = new AzuriteBuilder("mcr.microsoft.com/azure-storage/azurite:latest")
        .WithInMemoryPersistence()
        // Azure.Storage.Blobs speaks a newer API version than Azurite has caught up with.
        .WithCommand("--skipApiVersionCheck")
        .Build();

    private readonly Lazy<Task> _start;

    public AppHost() => _start = new(StartAsync);

    public string DatabaseConnectionString { get; private set; } = "";
    public string StorageConnectionString => _azurite.GetConnectionString();
    public string WebRoot { get; } = FakeWebRoot.Create();
    public AppFactory App { get; private set; } = null!;

    public Task EnsureStartedAsync() => _start.Value;

    private async Task StartAsync()
    {
        await Task.WhenAll(_sql.StartAsync(), _azurite.StartAsync());

        DatabaseConnectionString = new SqlConnectionStringBuilder(_sql.GetConnectionString())
        {
            InitialCatalog = "OreanasOffice",
        }.ConnectionString;

        App = new AppFactory(DatabaseConnectionString, StorageConnectionString, WebRoot, runsImageJobs: true);
        App.StartServer();
    }

    public async ValueTask DisposeAsync()
    {
        if (_start.IsValueCreated)
        {
            await App.DisposeAsync();
            await Task.WhenAll(_sql.DisposeAsync().AsTask(), _azurite.DisposeAsync().AsTask());
        }

        Directory.Delete(WebRoot, recursive: true);
    }
}

// The shared app for a test class: `public sealed class XTests(AppFixture fixture) :
// IClassFixture<AppFixture>`. Classes run in parallel, so each test makes its own users and
// campaigns and doesn't count on site-wide state. Tests that do share the "Images"
// collection, whose classes run one after another.
public sealed class AppFixture(AppHost host) : IAsyncLifetime
{
    public string DatabaseConnectionString => host.DatabaseConnectionString;
    public string StorageConnectionString => host.StorageConnectionString;
    public string WebRoot => host.WebRoot;

    // The app against the healthy containers. Tests may create more with CreateApp.
    public AppFactory App => host.App;

    // Another app on the same database and storage. Without runsImageJobs it has no image
    // job worker: a worker puts every Running job back in the queue when it starts and takes
    // jobs of the shared app, so only the Images collection's restart tests ask for one.
    public AppFactory CreateApp(
        string? databaseConnectionString = null,
        IReadOnlyDictionary<string, string?>? configuration = null,
        string environment = AppFactory.TestingEnvironment,
        bool runsImageJobs = false) =>
        new(databaseConnectionString ?? DatabaseConnectionString, StorageConnectionString, WebRoot, configuration, environment, runsImageJobs);

    public ValueTask InitializeAsync() => new(host.EnsureStartedAsync());

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;
}

// The image pipeline's tests: one fake image client and job queue in the shared app, a
// site-wide budget, and app restarts that put every Running job back in the queue.
[CollectionDefinition("Images")]
public sealed class ImagesCollection;
