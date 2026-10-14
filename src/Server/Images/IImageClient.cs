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
}

// Width and Height in pixels: the guide's size, both multiples of 16, which the request
// asks for exactly. Quality, OutputFormat and OutputCompression as in ImageOptions.
public record ImageEditRequest(
    string Prompt,
    byte[] GuidePng,
    int Width,
    int Height,
    string Quality,
    string OutputFormat,
    int OutputCompression);

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
