using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;

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
        var frame = Frame(asset);
        return new MapBackground(
            asset.Id,
            asset.OwnerId,
            asset.Status,
            asset.Origin,
            asset.Status == AssetStatus.Done ? Url(asset.Id) : null,
            asset.GridWidth ?? 0,
            asset.GridHeight ?? 0,
            frame.X,
            frame.Y,
            frame.Width,
            frame.Height,
            outdated,
            !outdated && asset.Origin == AssetOrigin.Generated && asset.LayoutHash != mapFingerprint,
            asset.Status == AssetStatus.Failed ? asset.Failure : null,
            asset.CreatedAt,
            asset.FinishedAt,
            asset.RefinedFromAssetId,
            asset.Instruction);
    }

    // Made for the map's current size. An upload fits every size: it isn't painted to the
    // layout, and the DM places it by hand (knowledge/domain/battle-map.md, "Background image").
    public static bool Fits(Asset asset, int mapWidth, int mapHeight) =>
        asset.Origin == AssetOrigin.Uploaded || (asset.GridWidth == mapWidth && asset.GridHeight == mapHeight);

    // Where the picture lies before the DM moves it, in cells. Generated: its frame. Uploaded:
    // as large as fits into the map it was uploaded for, centred, keeping its aspect.
    public static (double X, double Y, double Width, double Height) Frame(Asset asset)
    {
        if (asset.Origin == AssetOrigin.Uploaded)
        {
            double mapWidth = asset.GridWidth ?? 1;
            double mapHeight = asset.GridHeight ?? 1;
            double pixelWidth = asset.PixelWidth ?? 1;
            double pixelHeight = asset.PixelHeight ?? 1;
            var scale = Math.Min(mapWidth / pixelWidth, mapHeight / pixelHeight);
            var width = pixelWidth * scale;
            var height = pixelHeight * scale;
            return ((mapWidth - width) / 2, (mapHeight - height) / 2, width, height);
        }

        return (asset.FrameX ?? 0, asset.FrameY ?? 0, asset.FrameWidth ?? asset.GridWidth ?? 0, asset.FrameHeight ?? asset.GridHeight ?? 0);
    }

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

    // What the board draws under the grid, or null for the plain rendering: the picture at
    // the DM's placement while that was made for it, else at its frame.
    public static async Task<BoardBackground?> BoardAsync(
        AppDbContext db,
        Guid? assetId,
        (int Width, int Height)? size,
        BackgroundPlacement? placement,
        CancellationToken cancellationToken)
    {
        if (await UsableAsync(db, assetId, size, cancellationToken) is not { } asset)
        {
            return null;
        }

        if (placement is not null && placement.AssetId == asset.Id && placement.IsValid())
        {
            return new BoardBackground(asset.Id, Url(asset.Id), placement.X, placement.Y, placement.Width, placement.Height, placement.Rotation);
        }

        var frame = Frame(asset);
        return new BoardBackground(asset.Id, Url(asset.Id), frame.X, frame.Y, frame.Width, frame.Height, 0);
    }

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

    // What the month has used, for the lists of backgrounds, icons and portraits.
    public static async Task<ImageBudgetResponse> BudgetAsync(
        AppDbContext db, ImageOptions options, TimeProvider time, CancellationToken cancellationToken)
    {
        var monthStart = MonthStart(time.GetUtcNow());
        var spent = await SpentSinceAsync(db, monthStart, cancellationToken);
        return new ImageBudgetResponse(spent, options.MonthlyLimitUsd, monthStart, options.Configured);
    }

    // Rates are per million tokens.
    public static decimal Cost(ImageUsage usage, ImageOptions options) =>
        Math.Round(
            ((usage.InputImageTokens * options.ImageInputUsdPerMillion)
                + (usage.InputTextTokens * options.TextInputUsdPerMillion)
                + (usage.OutputTokens * options.OutputUsdPerMillion)) / 1_000_000m,
            6);
}
