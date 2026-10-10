namespace OreanasOffice.Server.Hosting;

public static class StaticFileExtensions
{
    // Stage 1 backend lane: cache headers for the built frontend in wwwroot.
    public static WebApplication UseFrontendStaticFiles(this WebApplication app)
    {
        app.UseDefaultFiles();
        app.UseStaticFiles();
        return app;
    }
}
