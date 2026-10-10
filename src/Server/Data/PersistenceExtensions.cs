using Microsoft.EntityFrameworkCore;

namespace OreanasOffice.Server.Data;

public static class PersistenceExtensions
{
    // Stage 1 backend lane: connection resiliency for Azure SQL resume, and
    // applying migrations on startup without blocking Kestrel.
    public static WebApplicationBuilder AddPersistence(this WebApplicationBuilder builder)
    {
        builder.Services.AddDbContext<AppDbContext>(options =>
            options.UseSqlServer(builder.Configuration.GetConnectionString("Database")));
        return builder;
    }
}
