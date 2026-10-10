using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Hosting;

namespace OreanasOffice.Server.Data;

public static class PersistenceExtensions
{
    public static WebApplicationBuilder AddPersistence(this WebApplicationBuilder builder)
    {
        // The connection string is read when a context is created, not here, so
        // the build-time OpenAPI run needs none.
        builder.Services.AddDbContext<AppDbContext>(options =>
            options.UseSqlServer(
                builder.Configuration.GetConnectionString("Database")
                    ?? throw new InvalidOperationException("ConnectionStrings:Database is not set."),
                // A paused Azure SQL serverless database can take about a minute to
                // resume and fails with transient errors (such as 40613) meanwhile.
                // These retries wait up to roughly 90 s in total. Code that opens its
                // own transaction must run it through CreateExecutionStrategy().
                sql => sql.EnableRetryOnFailure(
                    maxRetryCount: 8,
                    maxRetryDelay: TimeSpan.FromSeconds(15),
                    errorNumbersToAdd: null)));

        builder.Services.AddSingleton<DatabaseState>();
        if (!BuildTime.IsGeneratingOpenApiDocument)
        {
            builder.Services.AddHostedService<DatabaseMigrator>();
        }

        return builder;
    }
}
