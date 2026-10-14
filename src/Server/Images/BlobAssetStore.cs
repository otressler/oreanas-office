using Azure.Storage.Blobs;

namespace OreanasOffice.Server.Images;

// The private "assets" container in the app's storage account; created at startup like the
// Data Protection keys' container. Contract stub; lane: job queue.
public sealed class BlobAssetStore(BlobServiceClient blobs) : IAssetStore
{
    public const string Container = "assets";

    private readonly BlobContainerClient _container = blobs.GetBlobContainerClient(Container);

    public Task SaveAsync(string blobName, byte[] content, string contentType, CancellationToken cancellationToken) =>
        throw new NotImplementedException();

    public Task<Stream?> OpenReadAsync(string blobName, CancellationToken cancellationToken) =>
        throw new NotImplementedException();
}
