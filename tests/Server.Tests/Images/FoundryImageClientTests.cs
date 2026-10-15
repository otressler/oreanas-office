using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Tests.Images;

// The Foundry /images/edits call (.claude/skills/image-assets/references/foundry-api.md)
// against a fake handler: no network.
public sealed class FoundryImageClientTests
{
    private static readonly byte[] Guide = [1, 2, 3, 4];
    private static readonly byte[] Picture = [9, 8, 7];

    private static readonly ImageEditRequest Request = new("Male die Halle.", Guide, 1536, 960, "high", "jpeg", 85);

    [Fact]
    public async Task Sends_the_guide_as_a_multipart_edit_and_reads_the_image_and_usage()
    {
        var handler = new Handler(_ => Json(HttpStatusCode.OK, $$"""
            {
              "created": 1,
              "data": [{ "b64_json": "{{Convert.ToBase64String(Picture)}}" }],
              "output_format": "jpeg",
              "usage": {
                "input_tokens": 1921,
                "input_tokens_details": { "image_tokens": 1536, "text_tokens": 385 },
                "output_tokens": 1372,
                "total_tokens": 3293
              }
            }
            """, ("apim-request-id", "req-1")));
        var client = Client(handler, "https://foundry.test/openai/v1/");

        var result = await client.EditAsync(Request, CancellationToken.None);

        Assert.Equal(Picture, result.Image);
        Assert.Equal(("image/jpeg", new ImageUsage(1536, 385, 1372), "req-1"), (result.ContentType, result.Usage, result.RequestId));
        var sent = Assert.Single(handler.Requests);
        Assert.Equal((HttpMethod.Post, "https://foundry.test/openai/v1/images/edits"), (sent.Method, sent.Url));
        Assert.Equal("Bearer secret-key", sent.Authorization);
        Assert.StartsWith("multipart/form-data", sent.ContentType);
        Assert.Equal(
            new Dictionary<string, string>
            {
                ["model"] = "gpt-image-test",
                ["prompt"] = "Male die Halle.",
                ["size"] = "1536x960",
                ["quality"] = "high",
                ["output_format"] = "jpeg",
                ["output_compression"] = "85",
                ["n"] = "1",
            },
            sent.Fields);
        var image = Assert.Single(sent.Files);
        Assert.Equal(("image", "guide.png", "image/png"), (image.Name, image.FileName, image.ContentType));
        Assert.Equal(Guide, image.Content);
    }

    [Fact]
    public async Task A_refinement_sends_the_picture_then_the_guide_as_image_array()
    {
        var handler = new Handler(_ => Json(HttpStatusCode.OK, $$"""{ "data": [{ "b64_json": "{{Convert.ToBase64String(Picture)}}" }] }"""));
        byte[] earlier = [1, 2, 3];

        await Client(handler).EditAsync(Request with { Picture = new ImageInput(earlier, "image/jpeg") }, CancellationToken.None);

        var sent = Assert.Single(handler.Requests);
        Assert.Equal(
            [("image[]", "picture.jpg", "image/jpeg"), ("image[]", "guide.png", "image/png")],
            sent.Files.Select(f => (f.Name, f.FileName, f.ContentType)));
        Assert.Equal([earlier, Guide], sent.Files.Select(f => f.Content));
    }

    [Fact]
    public async Task The_content_type_follows_the_requested_format_when_the_answer_doesnt_say()
    {
        var handler = new Handler(_ => Json(HttpStatusCode.OK, $$"""{ "data": [{ "b64_json": "{{Convert.ToBase64String(Picture)}}" }] }"""));

        var result = await Client(handler).EditAsync(Request with { OutputFormat = "png" }, CancellationToken.None);

        Assert.Equal(("image/png", new ImageUsage(0, 0, 0), (string?)null), (result.ContentType, result.Usage, result.RequestId));
    }

    [Fact]
    public async Task A_429_says_how_long_to_wait()
    {
        var seconds = new Handler(_ => Json((HttpStatusCode)429, "{}", ("Retry-After", "12")));
        var date = new Handler(_ =>
        {
            var response = Json((HttpStatusCode)429, "{}");
            response.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(DateTimeOffset.UtcNow.AddMinutes(2));
            return response;
        });
        var text = new Handler(_ => Json((HttpStatusCode)429, """{ "error": { "message": "Please retry after 7 seconds." } }"""));
        var nothing = new Handler(_ => Json((HttpStatusCode)429, "{}"));

        var fromSeconds = await Assert.ThrowsAsync<ImageRateLimitedException>(() => Client(seconds).EditAsync(Request, CancellationToken.None));
        var fromDate = await Assert.ThrowsAsync<ImageRateLimitedException>(() => Client(date).EditAsync(Request, CancellationToken.None));
        var fromText = await Assert.ThrowsAsync<ImageRateLimitedException>(() => Client(text).EditAsync(Request, CancellationToken.None));
        var byDefault = await Assert.ThrowsAsync<ImageRateLimitedException>(() => Client(nothing).EditAsync(Request, CancellationToken.None));

        Assert.Equal(TimeSpan.FromSeconds(12), fromSeconds.RetryAfter);
        Assert.InRange(fromDate.RetryAfter, TimeSpan.FromSeconds(100), TimeSpan.FromSeconds(121));
        Assert.Equal(TimeSpan.FromSeconds(7), fromText.RetryAfter);
        Assert.Equal(TimeSpan.FromSeconds(30), byDefault.RetryAfter);
    }

    [Fact]
    public async Task A_400_is_a_rejection_with_the_servers_message()
    {
        var handler = new Handler(_ => Json(HttpStatusCode.BadRequest, """{ "error": { "code": "moderation_blocked", "message": "Your request was rejected by the safety system." } }"""));

        var rejected = await Assert.ThrowsAsync<ImageRejectedException>(() => Client(handler).EditAsync(Request, CancellationToken.None));

        Assert.Equal("Your request was rejected by the safety system.", rejected.Message);
    }

    [Fact]
    public async Task Other_failures_are_worth_trying_again()
    {
        var handler = new Handler(_ => Json(HttpStatusCode.InternalServerError, """{ "error": { "message": "Upstream timeout" } }"""));

        var error = await Assert.ThrowsAsync<HttpRequestException>(() => Client(handler).EditAsync(Request, CancellationToken.None));

        Assert.Equal(HttpStatusCode.InternalServerError, error.StatusCode);
        Assert.DoesNotContain("secret-key", error.Message);
    }

    private static readonly ImageGenerateRequest Generate = new("Token icon for a tabletop battle map: Goblin.", 1024, 1024, "high", "transparent", "png");

    [Fact]
    public async Task Text_to_image_sends_json_and_reads_the_image_and_usage()
    {
        var handler = new Handler(_ => Json(HttpStatusCode.OK, $$"""
            {
              "data": [{ "b64_json": "{{Convert.ToBase64String(Picture)}}" }],
              "output_format": "png",
              "usage": { "input_tokens_details": { "image_tokens": 0, "text_tokens": 40 }, "output_tokens": 1500 }
            }
            """, ("x-request-id", "req-2")));

        var result = await Client(handler, "https://foundry.test/openai/v1/").GenerateAsync(Generate, CancellationToken.None);

        Assert.Equal(Picture, result.Image);
        Assert.Equal(("image/png", new ImageUsage(0, 40, 1500), "req-2"), (result.ContentType, result.Usage, result.RequestId));
        var sent = Assert.Single(handler.Requests);
        Assert.Equal((HttpMethod.Post, "https://foundry.test/openai/v1/images/generations"), (sent.Method, sent.Url));
        Assert.Equal(("Bearer secret-key", "application/json"), (sent.Authorization, sent.ContentType));
        Assert.Equal(
            new Dictionary<string, string>
            {
                ["model"] = "gpt-image-test",
                ["prompt"] = "Token icon for a tabletop battle map: Goblin.",
                ["size"] = "1024x1024",
                ["quality"] = "high",
                ["background"] = "transparent",
                ["output_format"] = "png",
                ["n"] = "1",
            },
            sent.Fields);
        Assert.Empty(sent.Files);
    }

    [Fact]
    public async Task Text_to_image_fails_like_an_edit()
    {
        var busy = new Handler(_ => Json((HttpStatusCode)429, "{}", ("Retry-After", "5")));
        var rejected = new Handler(_ => Json(HttpStatusCode.BadRequest, """{ "error": { "message": "Your request was rejected by the safety system." } }"""));
        var broken = new Handler(_ => Json(HttpStatusCode.BadGateway, "{}"));

        var wait = await Assert.ThrowsAsync<ImageRateLimitedException>(() => Client(busy).GenerateAsync(Generate, CancellationToken.None));
        var refusal = await Assert.ThrowsAsync<ImageRejectedException>(() => Client(rejected).GenerateAsync(Generate, CancellationToken.None));
        var error = await Assert.ThrowsAsync<HttpRequestException>(() => Client(broken).GenerateAsync(Generate, CancellationToken.None));

        Assert.Equal(TimeSpan.FromSeconds(5), wait.RetryAfter);
        Assert.Equal("Your request was rejected by the safety system.", refusal.Message);
        Assert.Equal(HttpStatusCode.BadGateway, error.StatusCode);
    }

    // A restyled portrait: one PNG input, a transparent PNG back, no compression.
    [Fact]
    public async Task An_edit_can_ask_for_a_transparent_png()
    {
        var handler = new Handler(_ => Json(HttpStatusCode.OK, $$"""{ "data": [{ "b64_json": "{{Convert.ToBase64String(Picture)}}" }] }"""));

        await Client(handler).EditAsync(Request with { OutputFormat = "png", Background = "transparent" }, CancellationToken.None);

        var sent = Assert.Single(handler.Requests);
        Assert.Equal(("transparent", "png"), (sent.Fields["background"], sent.Fields["output_format"]));
        Assert.DoesNotContain("output_compression", sent.Fields.Keys);
        Assert.Equal("image", Assert.Single(sent.Files).Name);
    }

    [Fact]
    public async Task A_background_edit_sends_no_background_field()
    {
        var handler = new Handler(_ => Json(HttpStatusCode.OK, $$"""{ "data": [{ "b64_json": "{{Convert.ToBase64String(Picture)}}" }] }"""));

        await Client(handler).EditAsync(Request, CancellationToken.None);

        Assert.DoesNotContain("background", Assert.Single(handler.Requests).Fields.Keys);
    }

    private static FoundryImageClient Client(Handler handler, string endpoint = "https://foundry.test/openai/v1") =>
        new(new HttpClient(handler), Options.Create(new ImageOptions
        {
            Endpoint = endpoint,
            ApiKey = "secret-key",
            Deployment = "gpt-image-test",
        }));

    private static HttpResponseMessage Json(HttpStatusCode status, string body, params (string Name, string Value)[] headers)
    {
        var response = new HttpResponseMessage(status) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
        foreach (var (name, value) in headers)
        {
            response.Headers.TryAddWithoutValidation(name, value);
        }

        return response;
    }

    private sealed record SentFile(string Name, string? FileName, string? ContentType, byte[] Content);

    private sealed record SentRequest(
        HttpMethod Method, string Url, string? Authorization, string? ContentType, Dictionary<string, string> Fields, List<SentFile> Files);

    private sealed class Handler(Func<HttpRequestMessage, HttpResponseMessage> answer) : HttpMessageHandler
    {
        public List<SentRequest> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var fields = new Dictionary<string, string>();
            var files = new List<SentFile>();
            if (request.Content is MultipartFormDataContent form)
            {
                foreach (var part in form)
                {
                    var disposition = part.Headers.ContentDisposition!;
                    var name = disposition.Name!.Trim('"');
                    if (disposition.FileName is { } fileName)
                    {
                        files.Add(new SentFile(name, fileName.Trim('"'), part.Headers.ContentType?.MediaType, await part.ReadAsByteArrayAsync(cancellationToken)));
                    }
                    else
                    {
                        fields[name] = await part.ReadAsStringAsync(cancellationToken);
                    }
                }
            }
            else if (request.Content is { } content)
            {
                // A JSON body: each property as text.
                using var json = System.Text.Json.JsonDocument.Parse(await content.ReadAsStringAsync(cancellationToken));
                foreach (var property in json.RootElement.EnumerateObject())
                {
                    fields[property.Name] = property.Value.ToString();
                }
            }

            Requests.Add(new SentRequest(
                request.Method,
                request.RequestUri!.ToString(),
                request.Headers.Authorization?.ToString(),
                request.Content?.Headers.ContentType?.MediaType,
                fields,
                files));
            return answer(request);
        }
    }
}
