using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Images;

// Shared rules for map backgrounds (knowledge/domain/battle-map.md, "Background image"):
// how a version looks to the editor, when a picked one may be shown, and the month's
// spending (knowledge/decisions/image-budget.md).
public static class MapBackgrounds
{
    public static string Url(Guid assetId) => $"/api/assets/{assetId}";

    // A version as the editor sees it, against the map as it is now. MapId: the map the
    // asset was generated for, which for a store copy's picked background is the source.
    public static MapBackground ToView(Asset asset, int mapWidth, int mapHeight, string mapFingerprint)
    {
        var outdated = !Fits(asset, mapWidth, mapHeight);
        return new MapBackground(
            asset.Id,
            asset.OwnerId,
            asset.Status,
            asset.Status == AssetStatus.Done ? Url(asset.Id) : null,
            asset.GridWidth ?? 0,
            asset.GridHeight ?? 0,
            asset.FrameX ?? 0,
            asset.FrameY ?? 0,
            asset.FrameWidth ?? asset.GridWidth ?? 0,
            asset.FrameHeight ?? asset.GridHeight ?? 0,
            outdated,
            !outdated && asset.LayoutHash != mapFingerprint,
            asset.Status == AssetStatus.Failed ? asset.Failure : null,
            asset.CreatedAt,
            asset.FinishedAt,
            asset.RefinedFromAssetId,
            asset.Instruction);
    }

    // Made for the map's current size.
    public static bool Fits(Asset asset, int mapWidth, int mapHeight) =>
        asset.GridWidth == mapWidth && asset.GridHeight == mapHeight;

    // A background that may be shown on a map of this size, or saved by a copy or an
    // encounter: a finished map background made for this size. Size null: any size, for an
    // encounter's saved background, which was checked when the encounter started.
    public static async Task<Asset?> UsableAsync(
        AppDbContext db, Guid? assetId, (int Width, int Height)? size, CancellationToken cancellationToken)
    {
        if (assetId is not { } id)
        {
            return null;
        }

        var asset = await db.Assets.AsNoTracking()
            .SingleOrDefaultAsync(a => a.Id == id && a.Kind == AssetKind.MapBackground && a.Status == AssetStatus.Done, cancellationToken);
        return asset is not null && (size is not { } s || Fits(asset, s.Width, s.Height)) ? asset : null;
    }

    // What the board draws under the grid, or null for the plain rendering.
    public static async Task<BoardBackground?> BoardAsync(
        AppDbContext db, Guid? assetId, (int Width, int Height)? size, CancellationToken cancellationToken) =>
        await UsableAsync(db, assetId, size, cancellationToken) is { } asset
            ? new BoardBackground(
                asset.Id,
                Url(asset.Id),
                asset.FrameX ?? 0,
                asset.FrameY ?? 0,
                asset.FrameWidth ?? asset.GridWidth ?? 0,
                asset.FrameHeight ?? asset.GridHeight ?? 0)
            : null;

    // The first moment of the current calendar month in UTC.
    public static DateTimeOffset MonthStart(DateTimeOffset now)
    {
        var utc = now.ToUniversalTime();
        return new DateTimeOffset(utc.Year, utc.Month, 1, 0, 0, 0, TimeSpan.Zero);
    }

    // What finished images have cost since monthStart, site-wide.
    public static async Task<decimal> SpentSinceAsync(AppDbContext db, DateTimeOffset monthStart, CancellationToken cancellationToken) =>
        await db.Assets
            .Where(a => a.Status == AssetStatus.Done && a.FinishedAt >= monthStart && a.CostUsd != null)
            .SumAsync(a => a.CostUsd ?? 0m, cancellationToken);

    // Rates are per million tokens.
    public static decimal Cost(ImageUsage usage, ImageOptions options) =>
        Math.Round(
            ((usage.InputImageTokens * options.ImageInputUsdPerMillion)
                + (usage.InputTextTokens * options.TextInputUsdPerMillion)
                + (usage.OutputTokens * options.OutputUsdPerMillion)) / 1_000_000m,
            6);
}
