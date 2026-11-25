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

    // Campaign covers (knowledge/domain/campaign.md): the model paints a 3:2 picture at
    // CoverRequestWidth × CoverRequestHeight; the server keeps a CoverWidth × CoverHeight
    // WebP, enough for a card about 600 CSS pixels wide on a sharp screen. Uploads are
    // cropped to the same size.
    public string CoverQuality { get; set; } = "high";

    public int CoverRequestWidth { get; set; } = 1536;

    public int CoverRequestHeight { get; set; } = 1024;

    public int CoverWidth { get; set; } = 1200;

    public int CoverHeight { get; set; } = 800;

    // The style block of every cover, word for word, in the look of the landing page's
    // pictures (.claude/skills/image-assets/references/prompts.md, "Campaign cover").
    public string CoverStyle { get; set; } =
        "Dark fantasy digital painting in the manner of cinematic role-playing game key art: deep near-black shadows, warm candle-gold and ember-red light, painterly brush texture, dramatic rim light, drifting smoke.";

    // Uploaded portraits: the largest request body accepted, and the largest edge in pixels
    // the server decodes. The app crops and shrinks a photo before uploading it.
    public int UploadMaxBytes { get; set; } = 10 * 1024 * 1024;

    public int UploadMaxPixels { get; set; } = 8192;

    // Uploaded map backgrounds (knowledge/features/ai-map-generation.md, "Uploads"): bought
    // battle maps are large files, so they get their own limit. The server keeps a WebP whose
    // long edge is at most BackgroundPixels, which phones still draw smoothly.
    public int BackgroundUploadMaxBytes { get; set; } = 25 * 1024 * 1024;

    public int BackgroundPixels { get; set; } = 4096;

    // The text and vision model for spell import (knowledge/decisions/text-model.md): a
    // deployment on the same endpoint, signed in the same way. The project owner chose
    // gpt-6-luna on 2026-11-21; an empty value turns spell import off.
    public string? TextDeployment { get; set; } = "gpt-6-luna";

    public bool TextConfigured => !string.IsNullOrWhiteSpace(Endpoint) && !string.IsNullOrWhiteSpace(TextDeployment);

    // Sent as reasoning_effort; empty leaves it out for a model without reasoning. Medium
    // since the project owner asked for it on 2026-11-21 (knowledge/decisions/text-model.md).
    public string? TextReasoningEffort { get; set; } = "medium";

    // Per million tokens (third-party price lists, 2026-11-21; the invoice confirms them).
    public decimal TextModelInputUsdPerMillion { get; set; } = 0.10m;

    public decimal TextModelOutputUsdPerMillion { get; set; } = 0.50m;

    // A spell import waits this long for the wiki and for each model call.
    public TimeSpan TextModelTimeout { get; set; } = TimeSpan.FromMinutes(2);

    // The wiki spell import reads (knowledge/features/spell-cards.md).
    public string SpellWikiBaseUrl { get; set; } = "https://dnd2024.wikidot.com";

    // The suggestion queue fetches wiki pages at most this often (knowledge/features/spell-cards.md,
    // "Planned", step 5), so a run of 330 spells doesn't hit the wiki all at once.
    public TimeSpan SpellWikiInterval { get; set; } = TimeSpan.FromSeconds(3);

    // Book photos for spell import: the largest upload, and the long edge sent to the model.
    public int SpellPhotoMaxBytes { get; set; } = 15 * 1024 * 1024;

    public int SpellPhotoPixels { get; set; } = 2048;

    // Spell card art (knowledge/features/spell-cards.md, "Art studio"): the model paints a
    // 7:12 picture at SpellArtRequestWidth × SpellArtRequestHeight; the server keeps a WebP of
    // SpellArtWidth × SpellArtHeight, enough for a card on a sharp phone screen.
    public string SpellArtQuality { get; set; } = "high";

    public int SpellArtRequestWidth { get; set; } = 1008;

    public int SpellArtRequestHeight { get; set; } = 1728;

    public int SpellArtWidth { get; set; } = 672;

    public int SpellArtHeight { get; set; } = 1152;

    // The spell-cards studio's style block (prompts/style.txt). The subject goes after its
    // first line, as "Subject: …". Since 2026-11-24 the headroom follows the scene's own
    // setting: with only outdoor examples, indoor scenes got sky and a castle above the room.
    public string SpellArtStyle { get; set; } =
        """
        Digital fantasy concept art, painted with loose visible acrylic brush strokes, flat painterly shapes with simplified forms, minimal blending, matte finish, limited moody palette, bold value contrast, rough expressive edges like a production concept painting.
        Vertical portrait 7:12 composition (tall tarot card format) with generous headroom: the top quarter of the image is calm, low-detail background where a title will be overlaid, with no heads, faces, hands or key action in it. That headroom is part of the scene's own setting: outdoors sky, treetops, haze or distant scenery; indoors the ceiling, rafters, vaults or a dim upper wall; underground the dark cave roof. The whole image is one coherent place: never open a room to the sky or paint a landscape above an indoor scene. Place the main subject and the action in the middle band of the frame, roughly between 25 % and 85 % of the image height, and keep the bottom eighth simple ground. No text, no border, no fine detail rendering, no glossy highlights, no photorealism.
        Optimised for professional print: slightly raise overall brightness (+10-15 %). Lift midtones and dark areas and keep detail readable in the shadows, no crushed blacks, no very harsh contrast. Natural, rich, print-friendly colours, no extremely saturated RGB or neon colours. Realistic CMYK colour feel, soft tonal gradients without banding, detailed midtones. No exaggerated HDR or over-sharpening. Maximum ink coverage 280 %.
        """;
}
