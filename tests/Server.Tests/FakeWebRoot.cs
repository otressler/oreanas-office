namespace OreanasOffice.Server.Tests;

// A stand-in for the Vite build in wwwroot, with the file names that matter for caching.
public static class FakeWebRoot
{
    public const string IndexHtml = "<!doctype html><title>Oreana's Office</title>";

    public static string Create()
    {
        var root = Path.Combine(Path.GetTempPath(), "oreanas-office-tests", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(Path.Combine(root, "assets"));

        File.WriteAllText(Path.Combine(root, "index.html"), IndexHtml);
        File.WriteAllText(Path.Combine(root, "sw.js"), "// service worker");
        File.WriteAllText(Path.Combine(root, "registerSW.js"), "// register");
        File.WriteAllText(Path.Combine(root, "workbox-3e5a1b2c.js"), "// workbox");
        File.WriteAllText(Path.Combine(root, "manifest.webmanifest"), "{}");
        File.WriteAllText(Path.Combine(root, "assets", "index-Bx7k2Q.js"), "// app");
        return root;
    }
}
