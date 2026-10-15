using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;

namespace OreanasOffice.Server.Images;

// POST {Endpoint}/images/edits as multipart form: model, prompt, size WxH, quality,
// output_format, output_compression, n = 1 and the guide as `image`
// (.claude/skills/image-assets/references/foundry-api.md). Reads data[0].b64_json and
// `usage`. 429 → ImageRateLimitedException with the Retry-After wait; 400 →
// ImageRejectedException. The API key goes only into the Authorization header.
public sealed partial class FoundryImageClient(HttpClient http, IOptions<ImageOptions> options) : IImageClient
{
    public static readonly TimeSpan DefaultRetryAfter = TimeSpan.FromSeconds(30);

    private readonly HttpClient _http = http;
    private readonly ImageOptions _options = options.Value;

    public async Task<ImageResult> EditAsync(ImageEditRequest request, CancellationToken cancellationToken)
    {
        if (!_options.Configured)
        {
            throw new InvalidOperationException("No image model is configured.");
        }

        var form = new MultipartFormDataContent
        {
            { new StringContent(_options.Deployment!), "model" },
            { new StringContent(request.Prompt), "prompt" },
            { new StringContent($"{request.Width}x{request.Height}"), "size" },
            { new StringContent(request.Quality), "quality" },
            { new StringContent(request.OutputFormat), "output_format" },
            { new StringContent(request.OutputCompression.ToString(CultureInfo.InvariantCulture)), "output_compression" },
            { new StringContent("1"), "n" },
        };
        // A refinement sends the picture to edit first, then the guide; several images go
        // as image[], one as image.
        if (request.Picture is { } picture)
        {
            AddImage(form, "image[]", picture.Content, picture.ContentType, $"picture.{(picture.ContentType == "image/png" ? "png" : "jpg")}");
            AddImage(form, "image[]", request.GuidePng, "image/png", "guide.png");
        }
        else
        {
            AddImage(form, "image", request.GuidePng, "image/png", "guide.png");
        }

        using var message = new HttpRequestMessage(HttpMethod.Post, $"{_options.Endpoint!.TrimEnd('/')}/images/edits") { Content = form };
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.ApiKey);

        using var response = await _http.SendAsync(message, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (response.StatusCode == HttpStatusCode.TooManyRequests)
        {
            throw new ImageRateLimitedException(RetryAfter(response, body));
        }

        if (response.StatusCode == HttpStatusCode.BadRequest)
        {
            throw new ImageRejectedException(ErrorMessage(body));
        }

        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"The image model answered {(int)response.StatusCode}: {ErrorMessage(body)}", null, response.StatusCode);
        }

        return Parse(body, request.OutputFormat, RequestId(response));
    }

    private static ImageResult Parse(string body, string requestedFormat, string? requestId)
    {
        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;
        var data = root.GetProperty("data");
        if (data.GetArrayLength() == 0 || !data[0].TryGetProperty("b64_json", out var b64) || b64.GetString() is not { } encoded)
        {
            throw new InvalidOperationException("The image model answered without an image.");
        }

        var format = root.TryGetProperty("output_format", out var f) && f.ValueKind == JsonValueKind.String
            ? f.GetString()!
            : requestedFormat;

        var (imageTokens, textTokens, outputTokens) = (0, 0, 0);
        if (root.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
        {
            if (usage.TryGetProperty("input_tokens_details", out var details) && details.ValueKind == JsonValueKind.Object)
            {
                imageTokens = Int(details, "image_tokens");
                textTokens = Int(details, "text_tokens");
            }

            outputTokens = Int(usage, "output_tokens");
        }

        return new ImageResult(
            Convert.FromBase64String(encoded),
            ContentType(format),
            new ImageUsage(imageTokens, textTokens, outputTokens),
            requestId);
    }

    private static int Int(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.TryGetInt32(out var number) ? number : 0;

    public static string ContentType(string outputFormat) => outputFormat.ToLowerInvariant() switch
    {
        "webp" => "image/webp",
        "jpeg" or "jpg" => "image/jpeg",
        _ => "image/png",
    };

    // Retry-After in seconds or as a date; else the body's "retry after N seconds"; else 30 s.
    private static TimeSpan RetryAfter(HttpResponseMessage response, string body)
    {
        if (response.Headers.RetryAfter is { } header)
        {
            if (header.Delta is { } delta)
            {
                return delta;
            }

            if (header.Date is { } date)
            {
                var wait = date - DateTimeOffset.UtcNow;
                return wait > TimeSpan.Zero ? wait : TimeSpan.Zero;
            }
        }

        var match = RetryAfterText().Match(body);
        return match.Success ? TimeSpan.FromSeconds(int.Parse(match.Groups[1].Value, CultureInfo.InvariantCulture)) : DefaultRetryAfter;
    }

    // error.message from the JSON body, else the start of the body.
    private static string ErrorMessage(string body)
    {
        try
        {
            using var json = JsonDocument.Parse(body);
            if (json.RootElement.TryGetProperty("error", out var error)
                && error.ValueKind == JsonValueKind.Object
                && error.TryGetProperty("message", out var message)
                && message.GetString() is { Length: > 0 } text)
            {
                return text;
            }
        }
        catch (JsonException)
        {
        }

        return body.Length <= 500 ? body : body[..500];
    }

    private static string? RequestId(HttpResponseMessage response) =>
        response.Headers.TryGetValues("apim-request-id", out var apim) ? apim.FirstOrDefault()
        : response.Headers.TryGetValues("x-request-id", out var id) ? id.FirstOrDefault()
        : null;

    [GeneratedRegex(@"retry after (\d+) second", RegexOptions.IgnoreCase)]
    private static partial Regex RetryAfterText();

    private static void AddImage(MultipartFormDataContent form, string name, byte[] content, string contentType, string fileName)
    {
        var image = new ByteArrayContent(content);
        image.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        form.Add(image, name, fileName);
    }
}
