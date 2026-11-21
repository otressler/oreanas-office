using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Azure.Core;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Spells;

// The text and vision model (knowledge/decisions/text-model.md): gpt-6-luna on the Foundry
// resource of the image model. Tests use a fake.
public interface ITextModelClient
{
    bool Configured { get; }

    // One chat completion whose answer follows the JSON schema strictly. Throws
    // TextModelException when the model or the network fails.
    Task<TextModelResult> CompleteJsonAsync(TextModelRequest request, CancellationToken cancellationToken);
}

// Images: photos sent as image parts after the text, JPEG or PNG.
public record TextModelRequest(
    string Purpose,
    string System,
    string User,
    string SchemaName,
    JsonObject Schema,
    IReadOnlyList<ImageInput>? Images = null,
    int MaxOutputTokens = 16000);

public record TextModelResult(string Json, int InputTokens, int OutputTokens, string? Model);

// Refused: the content filter stopped the answer, or the model refused; trying again with
// the same input won't help.
public sealed class TextModelException(string message, bool refused = false, Exception? inner = null) : Exception(message, inner)
{
    public bool Refused { get; } = refused;
}

// POST {Endpoint}/chat/completions with response_format json_schema (strict). Signs in as
// FoundryImageClient does: the API key when one is set, else a Microsoft Entra token.
public sealed class FoundryTextModelClient(HttpClient http, IOptions<ImageOptions> options, TokenCredential credential) : ITextModelClient
{
    private static readonly TokenRequestContext TokenRequest = new(["https://cognitiveservices.azure.com/.default"]);

    private readonly ImageOptions _options = options.Value;

    public bool Configured => _options.TextConfigured;

    public async Task<TextModelResult> CompleteJsonAsync(TextModelRequest request, CancellationToken cancellationToken)
    {
        if (!Configured)
        {
            throw new InvalidOperationException("No text model is configured.");
        }

        var userContent = new JsonArray { new JsonObject { ["type"] = "text", ["text"] = request.User } };
        foreach (var image in request.Images ?? [])
        {
            userContent.Add(new JsonObject
            {
                ["type"] = "image_url",
                ["image_url"] = new JsonObject
                {
                    ["url"] = $"data:{image.ContentType};base64,{Convert.ToBase64String(image.Content)}",
                    ["detail"] = "high",
                },
            });
        }

        var body = new JsonObject
        {
            ["model"] = _options.TextDeployment,
            ["messages"] = new JsonArray
            {
                new JsonObject { ["role"] = "system", ["content"] = request.System },
                new JsonObject { ["role"] = "user", ["content"] = userContent },
            },
            ["response_format"] = new JsonObject
            {
                ["type"] = "json_schema",
                ["json_schema"] = new JsonObject
                {
                    ["name"] = request.SchemaName,
                    ["strict"] = true,
                    ["schema"] = request.Schema.DeepClone(),
                },
            },
            ["max_completion_tokens"] = request.MaxOutputTokens,
        };
        if (!string.IsNullOrWhiteSpace(_options.TextReasoningEffort))
        {
            body["reasoning_effort"] = _options.TextReasoningEffort;
        }

        using var message = new HttpRequestMessage(HttpMethod.Post, $"{_options.Endpoint!.TrimEnd('/')}/chat/completions")
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json"),
        };
        message.Headers.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            string.IsNullOrWhiteSpace(_options.ApiKey)
                ? (await credential.GetTokenAsync(TokenRequest, cancellationToken)).Token
                : _options.ApiKey);

        HttpResponseMessage response;
        string text;
        try
        {
            response = await http.SendAsync(message, cancellationToken);
            text = await response.Content.ReadAsStringAsync(cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new TextModelException($"The text model couldn't be reached: {ex.Message}", inner: ex);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TextModelException("The text model didn't answer in time.", inner: ex);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                // 400 with content_filter: the prompt was filtered.
                var refused = response.StatusCode == HttpStatusCode.BadRequest && text.Contains("content_filter", StringComparison.Ordinal);
                throw new TextModelException(
                    $"The text model answered {(int)response.StatusCode}: {(text.Length <= 500 ? text : text[..500])}", refused);
            }

            return Parse(text);
        }
    }

    private static TextModelResult Parse(string body)
    {
        using var json = JsonDocument.Parse(body);
        var root = json.RootElement;
        var choice = root.GetProperty("choices")[0];
        var finish = choice.TryGetProperty("finish_reason", out var f) ? f.GetString() : null;
        var messageElement = choice.GetProperty("message");
        if (messageElement.TryGetProperty("refusal", out var refusal) && refusal.ValueKind == JsonValueKind.String)
        {
            throw new TextModelException($"The text model refused: {refusal.GetString()}", refused: true);
        }

        if (finish == "content_filter")
        {
            throw new TextModelException("The content filter stopped the answer.", refused: true);
        }

        if (finish == "length")
        {
            throw new TextModelException("The answer was cut off at the token limit.");
        }

        var content = messageElement.TryGetProperty("content", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
        if (string.IsNullOrWhiteSpace(content))
        {
            throw new TextModelException("The text model answered without content.");
        }

        var (input, output) = (0, 0);
        if (root.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
        {
            input = usage.TryGetProperty("prompt_tokens", out var p) && p.TryGetInt32(out var pn) ? pn : 0;
            output = usage.TryGetProperty("completion_tokens", out var o) && o.TryGetInt32(out var on) ? on : 0;
        }

        var model = root.TryGetProperty("model", out var m) ? m.GetString() : null;
        return new TextModelResult(content, input, output, model);
    }
}
