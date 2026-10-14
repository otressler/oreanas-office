namespace OreanasOffice.Server.Images;

// The "Images" configuration section. Endpoint, ApiKey and Deployment name the Foundry
// deployment (knowledge/decisions/image-generation-approach.md); without them the server
// runs, and generating answers ImagesUnavailable. Locally they come from the AZURE_* values
// in .env (scripts/dev.ps1); in production from Container Apps secrets.
public sealed class ImageOptions
{
    public const string Section = "Images";

    // https://<resource>.services.ai.azure.com/openai/v1, the OpenAI-compatible v1 API.
    public string? Endpoint { get; set; }

    public string? ApiKey { get; set; }

    // The deployment name, sent as `model`.
    public string? Deployment { get; set; }

    public bool Configured =>
        !string.IsNullOrWhiteSpace(Endpoint) && !string.IsNullOrWhiteSpace(ApiKey) && !string.IsNullOrWhiteSpace(Deployment);

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
}
