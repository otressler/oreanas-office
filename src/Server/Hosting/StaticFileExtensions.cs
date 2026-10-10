using Microsoft.AspNetCore.StaticFiles;

namespace OreanasOffice.Server.Hosting;

public static class StaticFileExtensions
{
    // Files that must be revalidated on every load, so a new deployment reaches
    // the PWA: the shell, the service worker and its helpers, and the manifest.
    private static readonly HashSet<string> RevalidatedFiles =
        new(StringComparer.OrdinalIgnoreCase) { "index.html", "sw.js", "registerSW.js", "manifest.webmanifest" };

    public static WebApplication UseFrontendStaticFiles(this WebApplication app)
    {
        var options = new StaticFileOptions { OnPrepareResponse = SetCacheHeaders };

        app.UseDefaultFiles();
        app.UseStaticFiles(options);

        // Unknown API and hub paths are real 404s, not the app shell.
        app.MapFallback("/api/{**path}", () => TypedResults.NotFound());
        app.MapFallback("/hubs/{**path}", () => TypedResults.NotFound());

        // Every other unknown path is a client-side route.
        app.MapFallbackToFile("index.html", options);
        return app;
    }

    private static void SetCacheHeaders(StaticFileResponseContext context)
    {
        var name = context.File.Name;
        var headers = context.Context.Response.Headers;

        if (RevalidatedFiles.Contains(name) || IsWorkboxScript(name))
        {
            headers.CacheControl = "no-cache";
        }
        else if (context.Context.Request.Path.StartsWithSegments("/assets"))
        {
            // Vite puts a content hash in every file name under /assets.
            headers.CacheControl = "public, max-age=31536000, immutable";
        }
    }

    private static bool IsWorkboxScript(string name) =>
        name.StartsWith("workbox-", StringComparison.OrdinalIgnoreCase)
        && name.EndsWith(".js", StringComparison.OrdinalIgnoreCase);
}
