using Microsoft.EntityFrameworkCore;

namespace OreanasOffice.Server.Data;

// Applies migrations in the background so Kestrel serves the app shell and the
// health endpoint while a paused Azure SQL database resumes. Retries until the
// database answers, then stops for good, so it never keeps the database awake.
public sealed class DatabaseMigrator(
    IServiceScopeFactory scopeFactory,
    DatabaseState state,
    ILogger<DatabaseMigrator> logger) : BackgroundService
{
    private static readonly TimeSpan FirstDelay = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan MaxDelay = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var delay = FirstDelay;
        while (true)
        {
            try
            {
                await using var scope = scopeFactory.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await db.Database.MigrateAsync(stoppingToken);
                state.MarkMigrated();
                logger.LogInformation("Database migrations applied");
                return;
            }
            catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
            {
                logger.LogWarning(ex, "Database not ready, retrying migrations in {Delay}", delay);
            }

            await Task.Delay(delay, stoppingToken);
            delay = TimeSpan.FromTicks(Math.Min(delay.Ticks * 2, MaxDelay.Ticks));
        }
    }
}
