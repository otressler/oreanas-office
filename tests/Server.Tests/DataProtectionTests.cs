using Azure.Storage.Blobs;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Hosting;

namespace OreanasOffice.Server.Tests;

[Collection("App")]
public sealed class DataProtectionTests(AppFixture fixture)
{
    [Fact]
    public async Task Keys_are_stored_in_blob_storage_and_survive_a_restart()
    {
        var protectedValue = Protector(fixture.App).Protect("signed in");

        var blob = new BlobServiceClient(fixture.StorageConnectionString)
            .GetBlobContainerClient(DataProtectionExtensions.KeysContainer)
            .GetBlobClient(DataProtectionExtensions.KeysBlob);
        Assert.True(await blob.ExistsAsync());

        // A fresh app instance, like the container after a cold start, reads the same keys.
        await using var restarted = fixture.CreateApp();
        Assert.Equal("signed in", Protector(restarted).Unprotect(protectedValue));
    }

    private static IDataProtector Protector(AppFactory app) =>
        app.Services.GetRequiredService<IDataProtectionProvider>().CreateProtector("tests");
}
