namespace OreanasOffice.Server.Images;

// The private "assets" blob container (knowledge/decisions/persistence.md). Images never
// change once written, so a blob name is used once.
public interface IAssetStore
{
    Task SaveAsync(string blobName, byte[] content, string contentType, CancellationToken cancellationToken);

    // Null when the blob doesn't exist.
    Task<Stream?> OpenReadAsync(string blobName, CancellationToken cancellationToken);
}
