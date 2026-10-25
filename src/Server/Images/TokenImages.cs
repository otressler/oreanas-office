using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Images;

// Shared rules for token icons and portraits (knowledge/features/token-icons.md), the
// icons of custom statuses (knowledge/features/statuses.md) and campaign covers
// (knowledge/domain/campaign.md): how a version looks to the app, where its picture lies,
// and the owner's pick. Covers are another kind of asset with the same versions, jobs and
// picking, so they share the token images' contracts.
public static class TokenImages
{
    public static TokenImage ToView(Asset asset) => new(
        asset.Id,
        asset.OwnerType,
        asset.OwnerId,
        asset.Origin,
        asset.Status,
        asset.Status == AssetStatus.Done ? MapBackgrounds.Url(asset.Id) : null,
        asset.Status == AssetStatus.Failed ? asset.Failure : null,
        asset.SourceAssetId,
        asset.CreatedAt,
        asset.FinishedAt);

    // tokens/creature-type/{ownerId}/{assetId}.webp, tokens/character/… or tokens/status/…;
    // covers/campaign/{campaignId}/{assetId}.webp.
    public static string BlobName(AssetOwnerType ownerType, Guid ownerId, Guid assetId) =>
        ownerType == AssetOwnerType.Campaign
            ? $"covers/campaign/{ownerId}/{assetId}.webp"
            : $"tokens/{Folder(ownerType)}/{ownerId}/{assetId}.webp";

    // A campaign's versions are covers; everyone else's are token icons.
    public static AssetKind KindOf(AssetOwnerType ownerType) =>
        ownerType == AssetOwnerType.Campaign ? AssetKind.CampaignCover : AssetKind.TokenIcon;

    // The owner's versions: generated, uploaded and restyled.
    public static IQueryable<Asset> VersionsOf(AppDbContext db, AssetOwnerType ownerType, Guid ownerId)
    {
        var kind = KindOf(ownerType);
        return db.Assets.Where(a => a.Kind == kind && a.OwnerType == ownerType && a.OwnerId == ownerId);
    }

    // Newest first, with the pick and what the month has used.
    public static async Task<TokenImagesResponse> ListAsync(
        AppDbContext db,
        AssetOwnerType ownerType,
        Guid ownerId,
        Guid? pickedAssetId,
        ImageOptions options,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        var versions = await VersionsOf(db, ownerType, ownerId).AsNoTracking()
            .OrderByDescending(a => a.CreatedAt)
            .ThenBy(a => a.Id)
            .ToListAsync(cancellationToken);
        var budget = await MapBackgrounds.BudgetAsync(db, options, time, cancellationToken);
        return new TokenImagesResponse(pickedAssetId, [.. versions.Select(ToView)], budget);
    }

    // Whether the owner has a queued or running job: one at a time (GenerationRunning).
    public static Task<bool> JobRunningAsync(AppDbContext db, AssetOwnerType ownerType, Guid ownerId, CancellationToken cancellationToken) =>
        VersionsOf(db, ownerType, ownerId)
            .AnyAsync(a => a.Status == AssetStatus.Queued || a.Status == AssetStatus.Running, cancellationToken);

    // A Done version of the owner, or null.
    public static Task<Asset?> FinishedAsync(
        AppDbContext db, AssetOwnerType ownerType, Guid ownerId, Guid assetId, CancellationToken cancellationToken) =>
        VersionsOf(db, ownerType, ownerId).AsNoTracking()
            .SingleOrDefaultAsync(a => a.Id == assetId && a.Status == AssetStatus.Done, cancellationToken);

    // Sets CreatureType.IconAssetId, Character.TokenAssetId, StatusDefinition.IconAssetId or
    // Campaign.CoverAssetId. Not part of the creature type's sync item: its Version and
    // UpdatedAt stay as they are. False when the owner is gone.
    public static async Task<bool> PickAsync(
        AppDbContext db, AssetOwnerType ownerType, Guid ownerId, Guid? assetId, CancellationToken cancellationToken)
    {
        var updated = ownerType switch
        {
            AssetOwnerType.CreatureType => await db.CreatureTypes
                .Where(t => t.Id == ownerId)
                .ExecuteUpdateAsync(set => set.SetProperty(t => t.IconAssetId, assetId), cancellationToken),
            AssetOwnerType.Character => await db.Characters
                .Where(c => c.Id == ownerId)
                .ExecuteUpdateAsync(set => set.SetProperty(c => c.TokenAssetId, assetId), cancellationToken),
            AssetOwnerType.Status => await db.StatusDefinitions
                .Where(s => s.Id == ownerId)
                .ExecuteUpdateAsync(set => set.SetProperty(s => s.IconAssetId, assetId), cancellationToken),
            AssetOwnerType.Campaign => await db.Campaigns
                .Where(c => c.Id == ownerId)
                .ExecuteUpdateAsync(set => set.SetProperty(c => c.CoverAssetId, assetId), cancellationToken),
            _ => throw new ArgumentOutOfRangeException(nameof(ownerType), ownerType, "Only creature types, characters, statuses and campaigns have pictures to pick."),
        };
        return updated > 0;
    }

    private static string Folder(AssetOwnerType ownerType) => ownerType switch
    {
        AssetOwnerType.CreatureType => "creature-type",
        AssetOwnerType.Character => "character",
        AssetOwnerType.Status => "status",
        _ => throw new ArgumentOutOfRangeException(nameof(ownerType), ownerType, "Only creature types, characters and statuses have token images."),
    };
}
