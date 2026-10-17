using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.SignalR;
using OreanasOffice.Server.Hosting;

namespace OreanasOffice.Server.Table;

public static class TableExtensions
{
    // SignalR inside the app (knowledge/decisions/realtime-sync.md), with the same JSON
    // as the API: camelCase enums, strict numbers.
    public static WebApplicationBuilder AddTable(this WebApplicationBuilder builder)
    {
        builder.Services.Configure<TableOptions>(builder.Configuration.GetSection(TableOptions.Section));
        builder.Services.AddScoped<TableMoves>();
        builder.Services.AddScoped<TableStatuses>();
        builder.Services.AddScoped<TableRemovals>();
        builder.Services.AddScoped<TablePings>();
        builder.Services.AddScoped<TableFanOut>();
        builder.Services.AddScoped<TableFog>();
        builder.Services.AddScoped<TableSpawns>();
        builder.Services.AddSingleton<TablePingLimiter>();
        builder.Services.AddSingleton<TableActivity>();
        builder.Services.AddSingleton<TablePreviews>();
        builder.Services.AddSingleton<TableConnections>();
        builder.Services.AddSingleton<TableBroadcaster>();
        builder.Services.AddSingleton<TablePresence>();
        builder.Services.AddSingleton<TableActivityFilter>();
        if (!BuildTime.IsGeneratingOpenApiDocument)
        {
            builder.Services.AddHostedService<TableIdleTimeout>();
        }

        builder.Services.AddSignalR()
            .AddHubOptions<TableHub>(options => options.AddFilter<TableActivityFilter>())
            .AddJsonProtocol(options =>
            {
                options.PayloadSerializerOptions.NumberHandling = JsonNumberHandling.Strict;
                options.PayloadSerializerOptions.Converters.Add(
                    new JsonStringEnumConverter(JsonNamingPolicy.CamelCase, allowIntegerValues: false));
            });
        return builder;
    }

    public static IEndpointRouteBuilder MapTableHub(this IEndpointRouteBuilder app)
    {
        app.MapHub<TableHub>(TableHub.Path);
        return app;
    }
}

public sealed class TableOptions
{
    public const string Section = "Table";

    // knowledge/decisions/realtime-sync.md: a forgotten tab mustn't keep the container
    // awake. Idle means no call from the device, MarkActive included.
    public TimeSpan IdleTimeout { get; set; } = TimeSpan.FromMinutes(30);

    // How often idle connections are looked for; in memory only, never the database.
    public TimeSpan IdleCheckInterval { get; set; } = TimeSpan.FromMinutes(1);

    // How long a person who lost their last connection still shows as connected in the
    // row of avatars (knowledge/features/shared-table.md, "Who's here").
    public TimeSpan PresenceGrace { get; set; } = TimeSpan.FromSeconds(10);
}
