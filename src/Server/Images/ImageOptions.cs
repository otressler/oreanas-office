namespace OreanasOffice.Server.Images;

// The "Images" configuration section. Endpoint and Deployment name the Foundry deployment
// (knowledge/decisions/image-generation-approach.md); without them the server runs, and
// generating answers ImagesUnavailable. Locally they come from the AZURE_* values in .env
// (scripts/dev.ps1); in production from the container app's settings.
public sealed class ImageOptions
{
    public const string Section = "Images";

    // https://<resource>.services.ai.azure.com/openai/v1, the OpenAI-compatible v1 API.
    public string? Endpoint { get; set; }

    // Optional. Without a key the server signs in with Microsoft Entra ID: the container
    // app's managed identity in production, `az login` locally (knowledge/decisions/hosting.md).
    public string? ApiKey { get; set; }

    // The deployment name, sent as `model`.
    public string? Deployment { get; set; }

    public bool Configured => !string.IsNullOrWhiteSpace(Endpoint) && !string.IsNullOrWhiteSpace(Deployment);

    // knowledge/decisions/image-budget.md: high quality by default, JPEG so phones load a
    // few hundred kilobytes rather than a 2–3 MB PNG. The edits endpoint refuses WebP.
    public string Quality { get; set; } = "high";

    public string OutputFormat { get; set; } = "jpeg";

    public int OutputCompression { get; set; } = 85;

    public decimal MonthlyLimitUsd { get; set; } = 20m;

    // Published rates per million tokens; the Azure invoice confirms them.
    public decimal ImageInputUsdPerMillion { get; set; } = 8m;

    public decimal TextInputUsdPerMillion { get; set; } = 5m;

    public decimal OutputUsdPerMillion { get; set; } = 30m;

    // The deployment allows 2 requests per minute, rejected ones included, so requests
    // start at least this far apart. Tests set it to zero.
    public TimeSpan MinRequestInterval { get; set; } = TimeSpan.FromSeconds(30);

    // Tries per job before it fails; 429 waits don't count.
    public int MaxAttempts { get; set; } = 3;

    // The guide's long edge aims at this many pixels (render_guide.py's --target).
    public int GuideTargetPixels { get; set; } = 1536;

    // Token icons and portraits (knowledge/features/token-icons.md). High quality like
    // backgrounds (project owner, 2026-10-15). The model paints a transparent PNG at
    // TokenRequestPixels square; the server keeps a TokenPixels square WebP, which is plenty
    // for a token of about 64 CSS pixels on a phone screen.
    public string TokenQuality { get; set; } = "high";

    public int TokenRequestPixels { get; set; } = 1024;

    public int TokenPixels { get; set; } = 512;

    // The one style block of every icon and portrait on the site, word for word, so they
    // read as one set (.claude/skills/image-assets/references/prompts.md).
    public string TokenStyle { get; set; } =
        "Painterly fantasy illustration, strong silhouette, rich but not neon colours, soft rim light, readable at small size.";

    // Uploaded portraits: the largest request body accepted, and the largest edge in pixels
    // the server decodes. The app crops and shrinks a photo before uploading it.
    public int UploadMaxBytes { get; set; } = 10 * 1024 * 1024;

    public int UploadMaxPixels { get; set; } = 8192;

    // Uploaded map backgrounds (knowledge/features/ai-map-generation.md, "Uploads"): bought
    // battle maps are large files, so they get their own limit. The server keeps a WebP whose
    // long edge is at most BackgroundPixels, which phones still draw smoothly.
    public int BackgroundUploadMaxBytes { get; set; } = 25 * 1024 * 1024;

    public int BackgroundPixels { get; set; } = 4096;
}
