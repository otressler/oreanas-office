using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Health;

public static class HealthEndpoints
{
    private static readonly TimeSpan DatabaseCheckTimeout = TimeSpan.FromSeconds(5);

    // Readiness for the PWA's waking screen: 200 once the database is migrated and
    // answers, 503 while it is still resuming. Every call opens a connection, which
    // wakes a paused Azure SQL database. Never use this as a liveness probe: it
    // would restart a healthy container whose database is merely paused.
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/health", GetHealth)
            .WithTags("Health")
            .Produces<HealthResponse>(StatusCodes.Status503ServiceUnavailable);
        return app;
    }

    private static async Task<Results<Ok<HealthResponse>, JsonHttpResult<HealthResponse>>> GetHealth(
        DatabaseState state, AppDbContext db, CancellationToken cancellationToken)
    {
        if (state.IsMigrated && await CanConnectAsync(db, cancellationToken))
        {
            return TypedResults.Ok(new HealthResponse("ok"));
        }

        return TypedResults.Json(new HealthResponse("waking"), statusCode: StatusCodes.Status503ServiceUnavailable);
    }

    // Capped so clients get a quick answer and retry, instead of waiting through
    // the whole resume.
    private static async Task<bool> CanConnectAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(DatabaseCheckTimeout);
        try
        {
            return await db.Database.CanConnectAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return false;
        }
    }
}

public record HealthResponse(string Status);
