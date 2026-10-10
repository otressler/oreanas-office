using Azure.Identity;
using Azure.Storage.Blobs;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace OreanasOffice.Server.Hosting;

public static class DataProtectionExtensions
{
    public const string KeysContainer = "dataprotection";
    public const string KeysBlob = "keys.xml";

    // The key ring lives in Blob Storage, so sign-in cookies stay valid across
    // cold starts. Keys are not encrypted beyond Azure Storage's own encryption at
    // rest: wrapping them with Key Vault would cost more than this app's budget.
    public static WebApplicationBuilder AddDataProtectionKeys(this WebApplicationBuilder builder)
    {
        var dataProtection = builder.Services.AddDataProtection().SetApplicationName("OreanasOffice");
        if (BuildTime.IsGeneratingOpenApiDocument)
        {
            return builder;
        }

        builder.Services.TryAddSingleton(services =>
            CreateBlobServiceClient(services.GetRequiredService<IConfiguration>()));

        // Registered first so the container exists before Data Protection's own
        // hosted service loads (and on first run creates) the key ring.
        builder.Services.Insert(0, ServiceDescriptor.Singleton<IHostedService, KeysContainerInitializer>());

        dataProtection.PersistKeysToAzureBlobStorage(services => services
            .GetRequiredService<BlobServiceClient>()
            .GetBlobContainerClient(KeysContainer)
            .GetBlobClient(KeysBlob));

        return builder;
    }

    // A connection string for Azurite and the Docker Compose `app` profile;
    // otherwise the account URI with the container app's managed identity.
    // Constructing the client makes no network calls.
    private static BlobServiceClient CreateBlobServiceClient(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("Storage");
        if (!string.IsNullOrEmpty(connectionString))
        {
            return new BlobServiceClient(connectionString);
        }

        var serviceUri = configuration["Storage:BlobServiceUri"]
            ?? throw new InvalidOperationException("Set ConnectionStrings:Storage or Storage:BlobServiceUri.");
        return new BlobServiceClient(new Uri(serviceUri), new DefaultAzureCredential());
    }

    private sealed class KeysContainerInitializer(BlobServiceClient blobs) : IHostedService
    {
        public Task StartAsync(CancellationToken cancellationToken) =>
            blobs.GetBlobContainerClient(KeysContainer).CreateIfNotExistsAsync(cancellationToken: cancellationToken);

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}
