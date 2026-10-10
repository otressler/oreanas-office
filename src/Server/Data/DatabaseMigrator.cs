using System.Data.Common;
using System.Net.Sockets;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace OreanasOffice.Server.Data;

// Applies migrations in the background so Kestrel serves the app shell and the
// health endpoint while a paused Azure SQL database resumes. Retries while the
// database is unreachable, then stops for good, so it never keeps the database
// awake. It gives up at once on errors that waiting won't fix, and after
// GiveUpAfter on an unreachable database; the next cold start tries again.
public sealed class DatabaseMigrator(
    IServiceScopeFactory scopeFactory,
    DatabaseState state,
    ILogger<DatabaseMigrator> logger,
    TimeProvider time) : BackgroundService
{
    private static readonly TimeSpan FirstDelay = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan MaxDelay = TimeSpan.FromSeconds(30);
    internal static readonly TimeSpan GiveUpAfter = TimeSpan.FromMinutes(5);

    // Sign-in and permission errors: the database is awake but refuses the app.
    // 18456 login failed, 4060 cannot open database, 229/262/297/300/916/2760
    // missing permissions (e.g. grant-app-access.sql hasn't been run).
    private static readonly HashSet<int> PermanentSqlErrors = [18456, 4060, 229, 262, 297, 300, 916, 2760];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var giveUpAt = time.GetUtcNow() + GiveUpAfter;
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
                if (!IsUnreachable(ex))
                {
                    state.MarkFailed();
                    logger.LogError(ex, "Database migrations failed with an error that retrying won't fix");
                    return;
                }

                if (time.GetUtcNow() + delay > giveUpAt)
                {
                    state.MarkFailed();
                    logger.LogError(ex, "Database still unreachable after {GiveUpAfter}; giving up", GiveUpAfter);
                    return;
                }

                logger.LogWarning(ex, "Database not ready, retrying migrations in {Delay}", delay);
            }

            await Task.Delay(delay, time, stoppingToken);
            delay = TimeSpan.FromTicks(Math.Min(delay.Ticks * 2, MaxDelay.Ticks));
        }
    }

    // True for errors that mean "not awake yet": connection failures, timeouts
    // and the execution strategy running out of transient retries.
    internal static bool IsUnreachable(Exception ex) => ex switch
    {
        RetryLimitExceededException => true,
        SqlException sql => !PermanentSqlErrors.Contains(sql.Number),
        DbException or TimeoutException or SocketException => true,
        _ => false,
    };
}
