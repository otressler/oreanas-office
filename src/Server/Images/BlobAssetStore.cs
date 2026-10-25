using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

namespace OreanasOffice.Server.Images;

// The private "assets" container in the app's storage account, created on the first save
// (reading a missing container just finds no blob).
public sealed class BlobAssetStore(BlobServiceClient blobs) : IAssetStore
{
    public const string Container = "assets";

    private readonly BlobContainerClient _container = blobs.GetBlobContainerClient(Container);
    private readonly SemaphoreSlim _creating = new(1, 1);
    private volatile bool _created;

    public async Task SaveAsync(string blobName, byte[] content, string contentType, CancellationToken cancellationToken)
    {
        await EnsureContainerAsync(cancellationToken);
        await _container.GetBlobClient(blobName).UploadAsync(
            new BinaryData(content),
            new BlobUploadOptions { HttpHeaders = new BlobHttpHeaders { ContentType = contentType } },
            cancellationToken);
    }

    public async Task<Stream?> OpenReadAsync(string blobName, CancellationToken cancellationToken)
    {
        try
        {
            var download = await _container.GetBlobClient(blobName).DownloadStreamingAsync(cancellationToken: cancellationToken);
            return download.Value.Content;
        }
        catch (RequestFailedException ex) when (ex.Status == StatusCodes.Status404NotFound)
        {
            return null;
        }
    }

    public async Task DeleteAsync(string blobName, CancellationToken cancellationToken)
    {
        try
        {
            await _container.GetBlobClient(blobName).DeleteIfExistsAsync(cancellationToken: cancellationToken);
        }
        catch (RequestFailedException ex) when (ex.Status == StatusCodes.Status404NotFound)
        {
            // The container doesn't exist yet, so neither does the blob.
        }
    }

    private async Task EnsureContainerAsync(CancellationToken cancellationToken)
    {
        if (_created)
        {
            return;
        }

        await _creating.WaitAsync(cancellationToken);
        try
        {
            if (!_created)
            {
                await _container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: cancellationToken);
                _created = true;
            }
        }
        finally
        {
            _creating.Release();
        }
    }
}
