using Microsoft.Extensions.Options;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;

namespace OreanasOffice.Server.Sync;

public static class SyncProtocol
{
    // Raised whenever the sync format changes; the app sends it in VersionHeader.
    public const int CurrentVersion = 1;

    public const string VersionHeader = "X-Sync-Version";

    public const int MaxFetchIds = 500;
}

public sealed class SyncOptions
{
    public const string Section = "Sync";

    // The oldest app version that may sync (knowledge/decisions/offline-prep-pwa.md,
    // "Special cases"). Older ones get 426 and keep their local data.
    public int MinimumVersion { get; set; } = SyncProtocol.CurrentVersion;
}

public static class SyncExtensions
{
    public static WebApplicationBuilder AddSync(this WebApplicationBuilder builder)
    {
        builder.Services.Configure<SyncOptions>(builder.Configuration.GetSection(SyncOptions.Section));
        return builder;
    }

    // Push, the version list and the fetch. Every request needs a sync version header at
    // or above the minimum (426 SyncOutdated otherwise).
    public static IEndpointRouteBuilder MapSyncEndpoints(this IEndpointRouteBuilder app)
    {
        var sync = app.MapGroup("/api/sync")
            .WithTags("Sync")
            .AddEndpointFilter<SyncVersionFilter>();

        sync.MapPost("/push", SyncEndpoints.Push)
            .RequireAuthorization()
            .Produces<ApiError>(StatusCodes.Status426UpgradeRequired);
        sync.MapGet("/campaigns/{campaignId:guid}/versions", SyncEndpoints.Versions)
            .RequireAuthorization(Policies.CampaignDm)
            .Produces<ApiError>(StatusCodes.Status426UpgradeRequired);
        sync.MapPost("/campaigns/{campaignId:guid}/items", SyncEndpoints.Fetch)
            .RequireAuthorization(Policies.CampaignDm)
            .Produces<ApiError>(StatusCodes.Status426UpgradeRequired);
        return app;
    }
}

// Answers 426 when the header is missing, unparsable or below the minimum.
internal sealed class SyncVersionFilter(IOptions<SyncOptions> options) : IEndpointFilter
{
    public ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var header = context.HttpContext.Request.Headers[SyncProtocol.VersionHeader].ToString();
        return int.TryParse(header, out var version) && version >= options.Value.MinimumVersion
            ? next(context)
            : ValueTask.FromResult<object?>(
                Results.Json(new ApiError(ApiErrorCode.SyncOutdated), statusCode: StatusCodes.Status426UpgradeRequired));
    }
}
