using Microsoft.Extensions.Options;

namespace OreanasOffice.Server.Images;

// POST {Endpoint}/images/edits as multipart form: model, prompt, size WxH, quality,
// output_format, output_compression and the guide as `image`
// (.claude/skills/image-assets/references/foundry-api.md). Reads data[0].b64_json and
// `usage`. 429 → ImageRateLimitedException with the Retry-After wait; 400 →
// ImageRejectedException. Contract stub; lane: job queue.
public sealed class FoundryImageClient(HttpClient http, IOptions<ImageOptions> options) : IImageClient
{
    private readonly HttpClient _http = http;
    private readonly ImageOptions _options = options.Value;

    public Task<ImageResult> EditAsync(ImageEditRequest request, CancellationToken cancellationToken) =>
        throw new NotImplementedException();
}
