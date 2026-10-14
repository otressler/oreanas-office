using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Campaigns;

namespace OreanasOffice.Server.Images;

// knowledge/domain/asset.md: a generated or uploaded image. The rows are also the job
// queue (knowledge/decisions/hosting.md): a queued job survives the container stopping,
// and ImageJobWorker picks it up when it starts again. Stage 7 makes map backgrounds;
// stage 8 adds token icons and portraits.
public class Asset
{
    public const int PromptMaxLength = 4000;

    public Guid Id { get; set; }

    public AssetKind Kind { get; set; }

    // What the asset belongs to: for a map background the battle map it was generated for.
    // A map copied from the store points to its source's background, so OwnerId stays the
    // source map (knowledge/domain/battle-map.md, "Store").
    public AssetOwnerType OwnerType { get; set; }

    public Guid OwnerId { get; set; }

    // The owner's campaign. Its members may load the image, and so may members of
    // campaigns whose map or encounter points to it (knowledge/decisions/persistence.md).
    public Guid CampaignId { get; set; }

    public AssetOrigin Origin { get; set; }

    public AssetStatus Status { get; set; }

    // The full prompt sent to the model, and the deployment and quality used, so a
    // result can be repeated or tweaked later.
    public string? Prompt { get; set; }

    public string? Model { get; set; }

    public string? Quality { get; set; }

    // Where the image lies in the private "assets" blob container; set when Done.
    public string? BlobName { get; set; }

    public string? ContentType { get; set; }

    // Map backgrounds: the map's size when the job was queued. A background is outdated
    // while the map has another size (knowledge/domain/battle-map.md, "Background image").
    public int? GridWidth { get; set; }

    public int? GridHeight { get; set; }

    // Map backgrounds: where the picture lies relative to the map, in cells. A map wider
    // than 3:1 is padded to 3:1 (knowledge/decisions/image-generation-approach.md), so the
    // picture can start left of or above the map's first cell (FrameX/FrameY negative) and
    // cover more cells than the map has. Without padding: 0, 0, GridWidth, GridHeight.
    public int? FrameX { get; set; }

    public int? FrameY { get; set; }

    public int? FrameWidth { get; set; }

    public int? FrameHeight { get; set; }

    // Map backgrounds: LayoutFingerprint of the map when the job was queued, so the editor
    // can say the layout changed since the image was made.
    public string? LayoutHash { get; set; }

    // What the generation cost, from the response's token use and the configured rates;
    // counted against the monthly limit (knowledge/decisions/image-budget.md).
    public decimal? CostUsd { get; set; }

    // Why the job failed, for the editor; null unless Failed.
    public AssetFailure? Failure { get; set; }

    // Requests sent for this job, failed ones included; the worker gives up after
    // ImageOptions.MaxAttempts.
    public int Attempts { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Guid? CreatedByUserId { get; set; }

    public DateTimeOffset? StartedAt { get; set; }

    // When the job ended, Done or Failed. The monthly limit counts Done jobs by this time.
    public DateTimeOffset? FinishedAt { get; set; }

    public Campaign Campaign { get; set; } = null!;
}

public enum AssetKind
{
    MapBackground,
    TokenIcon,
}

public enum AssetOwnerType
{
    BattleMap,
    CreatureType,
    Character,
}

public enum AssetOrigin
{
    Generated,
    Uploaded,
}

// Queued → Running → Done | Failed. A Running job found at startup was cut off by a
// restart and goes back to Queued.
public enum AssetStatus
{
    Queued,
    Running,
    Done,
    Failed,
}

// Rejected: the model refused the request (moderation, a bad input); trying again
// won't help. Error: no image after MaxAttempts tries.
public enum AssetFailure
{
    Rejected,
    Error,
}

internal sealed class AssetConfiguration : IEntityTypeConfiguration<Asset>
{
    public void Configure(EntityTypeBuilder<Asset> asset)
    {
        asset.Property(a => a.Prompt).HasMaxLength(Asset.PromptMaxLength);
        asset.Property(a => a.Model).HasMaxLength(100);
        asset.Property(a => a.Quality).HasMaxLength(20);
        asset.Property(a => a.BlobName).HasMaxLength(200);
        asset.Property(a => a.ContentType).HasMaxLength(100);
        asset.Property(a => a.LayoutHash).HasMaxLength(64);
        asset.Property(a => a.CostUsd).HasPrecision(10, 6);
        asset.HasOne(a => a.Campaign).WithMany().HasForeignKey(a => a.CampaignId).OnDelete(DeleteBehavior.Cascade);
        asset.HasOne<AppUser>().WithMany().HasForeignKey(a => a.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);

        // The versions of one map, newest first; the queue in order; the month's spending.
        asset.HasIndex(a => new { a.OwnerType, a.OwnerId, a.CreatedAt });
        asset.HasIndex(a => new { a.Status, a.CreatedAt });
        asset.HasIndex(a => a.FinishedAt);
    }
}
