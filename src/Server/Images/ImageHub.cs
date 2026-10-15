using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Images;

// Tells an open editor that a background job moved on (knowledge/implementation-plan.md,
// stage 7: a "done" notification over SignalR). One group per map. The editor connects only
// while one of its map's jobs is queued or running and disconnects when none is left, since
// an open connection keeps the scale-to-zero container awake. The frontend twin is
// src/web/src/editor/background/hub.ts.
public interface IImageHub
{
    // Adds the connection to the map's group: `dm` members of the map's campaign only.
    // Errors: NotADm (not a dm member), ItemNotFound (no such map in the campaign).
    Task<HubResult> WatchMap(Guid campaignId, Guid mapId);

    // Adds the connection to the group of a creature type's icons or a character's
    // portraits (knowledge/features/token-icons.md), while one of its jobs is queued or
    // running. Creature types: `dm` members only. Characters: the owner and `dm` members.
    // Errors: NotADm (not allowed), ItemNotFound (no such creature type or character in the
    // campaign, or OwnerType BattleMap).
    Task<HubResult> WatchTokenImages(Guid campaignId, AssetOwnerType ownerType, Guid ownerId);
}

public interface IImageHubClient
{
    // A version of the map's background changed status: running, done or failed. Sent to
    // the group of the map the job belongs to (MapBackground.MapId).
    Task BackgroundUpdated(MapBackground background);

    // A version of a creature type's icon or a character's portrait changed status. Sent
    // to the group of its owner (TokenImage.OwnerType and OwnerId).
    Task TokenImageUpdated(TokenImage image);
}

[Authorize]
public sealed class ImageHub(AppDbContext db) : Hub<IImageHubClient>, IImageHub
{
    public const string Path = "/hubs/images";

    public static string GroupName(Guid mapId) => $"map:{mapId}";

    public static string TokenGroupName(AssetOwnerType ownerType, Guid ownerId) => $"token:{ownerType}:{ownerId}";

    public async Task<HubResult> WatchMap(Guid campaignId, Guid mapId)
    {
        var cancellationToken = Context.ConnectionAborted;
        var userId = Context.User!.GetUserId();
        if (!await db.IsCampaignDmAsync(campaignId, userId, cancellationToken))
        {
            return new HubResult(ApiErrorCode.NotADm);
        }

        if (!await db.BattleMaps.AnyAsync(m => m.Id == mapId && m.CampaignId == campaignId, cancellationToken))
        {
            return new HubResult(ApiErrorCode.ItemNotFound);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(mapId), cancellationToken);
        return new HubResult(null);
    }

    public async Task<HubResult> WatchTokenImages(Guid campaignId, AssetOwnerType ownerType, Guid ownerId)
    {
        var cancellationToken = Context.ConnectionAborted;
        var userId = Context.User!.GetUserId();
        var isDm = await db.IsCampaignDmAsync(campaignId, userId, cancellationToken);
        switch (ownerType)
        {
            case AssetOwnerType.CreatureType:
                if (!isDm)
                {
                    return new HubResult(ApiErrorCode.NotADm);
                }

                if (!await db.CreatureTypes.AnyAsync(t => t.Id == ownerId && t.CampaignId == campaignId, cancellationToken))
                {
                    return new HubResult(ApiErrorCode.ItemNotFound);
                }

                break;

            case AssetOwnerType.Character:
                // Members only, so a stranger learns nothing about the campaign's characters.
                if (!isDm && !await db.CampaignMembers.AnyAsync(m => m.CampaignId == campaignId && m.UserId == userId, cancellationToken))
                {
                    return new HubResult(ApiErrorCode.NotADm);
                }

                var owner = await db.Characters
                    .Where(c => c.Id == ownerId && c.CampaignId == campaignId)
                    .Select(c => (Guid?)c.OwnerUserId)
                    .SingleOrDefaultAsync(cancellationToken);
                if (owner is null)
                {
                    return new HubResult(ApiErrorCode.ItemNotFound);
                }

                if (!isDm && owner != userId)
                {
                    return new HubResult(ApiErrorCode.NotADm);
                }

                break;

            default:
                return new HubResult(ApiErrorCode.ItemNotFound);
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, TokenGroupName(ownerType, ownerId), cancellationToken);
        return new HubResult(null);
    }
}

// What the job worker calls to reach open editors.
public sealed class ImageEvents(IHubContext<ImageHub, IImageHubClient> hub)
{
    public Task BackgroundUpdatedAsync(MapBackground background) =>
        hub.Clients.Group(ImageHub.GroupName(background.MapId)).BackgroundUpdated(background);

    public Task TokenImageUpdatedAsync(TokenImage image) =>
        hub.Clients.Group(ImageHub.TokenGroupName(image.OwnerType, image.OwnerId)).TokenImageUpdated(image);
}

// Lists the hub's method names in openapi.json, like TableOpenApi does for the table.
public sealed class ImageOpenApi : IOpenApiDocumentTransformer
{
    public async Task TransformAsync(
        OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        document.AddComponent(nameof(MapBackground), await context.GetOrCreateSchemaAsync(typeof(MapBackground), null, cancellationToken));
        document.AddComponent(nameof(TokenImage), await context.GetOrCreateSchemaAsync(typeof(TokenImage), null, cancellationToken));
        document.AddComponent("ImageHubMethod", MethodNames<IImageHub>());
        document.AddComponent("ImageHubClientMethod", MethodNames<IImageHubClient>());
    }

    private static OpenApiSchema MethodNames<T>() => new()
    {
        Type = JsonSchemaType.String,
        Enum = [.. TableOpenApi.MethodNamesOf<T>().Select(name => (JsonNode)JsonValue.Create(name))],
    };
}
