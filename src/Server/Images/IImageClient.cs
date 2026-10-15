namespace OreanasOffice.Server.Images;

// The image model (Foundry, gpt-image-2.5-flare; .claude/skills/image-assets/references/
// foundry-api.md). FoundryImageClient calls /images/edits; tests use a fake. One request
// at a time: the worker spaces them (ImageOptions.MinRequestInterval).
public interface IImageClient
{
    // Repaints the guide. Throws ImageRateLimitedException on 429, ImageRejectedException
    // when the model refuses the request (400: moderation, bad input), and other
    // exceptions for anything worth trying again.
    Task<ImageResult> EditAsync(ImageEditRequest request, CancellationToken cancellationToken);

    // Paints from the prompt alone (POST /images/generations): token icons and portraits.
    // Throws as EditAsync.
    Task<ImageResult> GenerateAsync(ImageGenerateRequest request, CancellationToken cancellationToken);
}

// Width and Height in pixels: the guide's size, both multiples of 16, which the request
// asks for exactly. Quality, OutputFormat and OutputCompression as in ImageOptions. Picture:
// for a refinement the version to edit, sent before the guide. GuidePng is the one input
// image: a map's guide, or for a restyled portrait the uploaded version as PNG.
// Background: "transparent" for a restyled portrait; null leaves it out.
public record ImageEditRequest(
    string Prompt,
    byte[] GuidePng,
    int Width,
    int Height,
    string Quality,
    string OutputFormat,
    int OutputCompression,
    ImageInput? Picture = null,
    string? Background = null);

// A text-to-image request. Background: "transparent" for tokens, which need PNG (or WebP)
// output to keep the alpha channel.
public record ImageGenerateRequest(
    string Prompt,
    int Width,
    int Height,
    string Quality,
    string Background,
    string OutputFormat);

public record ImageInput(byte[] Content, string ContentType);

// ContentType: image/jpeg or image/png (the edits endpoint refuses WebP). RequestId: the
// response's id, logged.
public record ImageResult(byte[] Image, string ContentType, ImageUsage Usage, string? RequestId);

// From the response's `usage`: input image and text tokens, output tokens.
public record ImageUsage(int InputImageTokens, int InputTextTokens, int OutputTokens);

public sealed class ImageRateLimitedException(TimeSpan retryAfter)
    : Exception($"The image model is busy; retry after {retryAfter}.")
{
    public TimeSpan RetryAfter { get; } = retryAfter;
}

public sealed class ImageRejectedException(string message) : Exception(message);
