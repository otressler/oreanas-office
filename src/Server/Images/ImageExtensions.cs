using Azure.Core;
using Azure.Identity;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OreanasOffice.Server.Hosting;

namespace OreanasOffice.Server.Images;

public static class ImageExtensions
{
    // Map backgrounds: the job queue and its worker, the image model client, the asset store
    // and the editor's hub. Needs AddDataProtectionKeys first for the BlobServiceClient, also
    // while the build writes openapi.json.
    // Tests replace IImageClient with a fake (tests/Server.Tests/FakeImageClient.cs).
    public static WebApplicationBuilder AddImages(this WebApplicationBuilder builder)
    {
        builder.Services.Configure<ImageOptions>(builder.Configuration.GetSection(ImageOptions.Section));
        builder.Services.AddSingleton<ImageJobQueue>();
        builder.Services.AddSingleton<ImageEvents>();
        // One credential for the app's lifetime, so its token cache survives between requests.
        // Creating it makes no network calls.
        builder.Services.TryAddSingleton<TokenCredential>(_ => new DefaultAzureCredential());
        builder.Services.AddHttpClient<IImageClient, FoundryImageClient>(http => http.Timeout = TimeSpan.FromMinutes(3));
        builder.Services.TryAddSingleton<IAssetStore, BlobAssetStore>();
        if (!BuildTime.IsGeneratingOpenApiDocument)
        {
            builder.Services.AddHostedService<ImageJobWorker>();
        }

        return builder;
    }

    public static IEndpointRouteBuilder MapImageHub(this IEndpointRouteBuilder app)
    {
        app.MapHub<ImageHub>(ImageHub.Path);
        return app;
    }
}
