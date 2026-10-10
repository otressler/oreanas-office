namespace OreanasOffice.Server.Health;

public static class HealthEndpoints
{
    // Stage 1 backend lane: report whether the database is reachable and migrated.
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/health", () => Results.Ok(new HealthResponse("ok")));
        return app;
    }
}

public record HealthResponse(string Status);
