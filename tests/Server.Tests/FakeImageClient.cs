using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Tests;

// Stands in for the Foundry image model in every test app, so no test sends a real request
// (knowledge/implementation-plan.md: lanes test against a fake image client). By default
// it answers with the guide itself as a PNG and fixed token use; a text-to-image request
// gets TokenPng. Tests queue other answers with Enqueue (both kinds of request share the
// queue), or hold requests with Gate, and read what was sent from Requests or
// GenerateRequests. The app is shared; the "Images" collection runs these tests one after
// another. Call Reset first.
public sealed class FakeImageClient : IImageClient
{
    public static readonly ImageUsage DefaultUsage = new(InputImageTokens: 1536, InputTextTokens: 385, OutputTokens: 1372);

    private readonly ConcurrentQueue<Func<ImageEditRequest, CancellationToken, Task<ImageResult>>> _answers = new();

    public ConcurrentQueue<ImageEditRequest> Requests { get; } = new();

    public ConcurrentQueue<ImageGenerateRequest> GenerateRequests { get; } = new();

    // The default answer to a text-to-image request. Null answers with an empty image;
    // the token image tests set a real transparent PNG.
    public byte[]? TokenPng { get; set; }

    // While set, each request waits until the gate opens: lets a test see a job Running.
    public TaskCompletionSource? Gate { get; set; }

    public void Reset()
    {
        _answers.Clear();
        Requests.Clear();
        GenerateRequests.Clear();
        Gate = null;
    }

    // The next request gets this answer instead of the default.
    public void Enqueue(Func<ImageEditRequest, CancellationToken, Task<ImageResult>> answer) => _answers.Enqueue(answer);

    public void EnqueueFailure(Exception exception) => Enqueue((_, _) => Task.FromException<ImageResult>(exception));

    public async Task<ImageResult> EditAsync(ImageEditRequest request, CancellationToken cancellationToken)
    {
        Requests.Enqueue(request);
        if (Gate is { } gate)
        {
            await gate.Task.WaitAsync(cancellationToken);
        }

        return _answers.TryDequeue(out var answer)
            ? await answer(request, cancellationToken)
            : new ImageResult(request.GuidePng, "image/png", DefaultUsage, RequestId: "fake");
    }

    public async Task<ImageResult> GenerateAsync(ImageGenerateRequest request, CancellationToken cancellationToken)
    {
        GenerateRequests.Enqueue(request);
        if (Gate is { } gate)
        {
            await gate.Task.WaitAsync(cancellationToken);
        }

        // Shares the answer queue with EditAsync; the edit request it gets is a stand-in.
        return _answers.TryDequeue(out var answer)
            ? await answer(new ImageEditRequest(request.Prompt, [], request.Width, request.Height, request.Quality, request.OutputFormat, 0), cancellationToken)
            : new ImageResult(TokenPng ?? [], "image/png", DefaultUsage, RequestId: "fake");
    }
}

public static class FakeImageClientExtensions
{
    // A configured model, so generating isn't refused as ImagesUnavailable, and no wait
    // between requests.
    public static readonly IReadOnlyDictionary<string, string?> Settings = new Dictionary<string, string?>
    {
        ["Images:Endpoint"] = "https://fake.invalid/openai/v1",
        ["Images:ApiKey"] = "fake",
        ["Images:Deployment"] = "fake-image",
        ["Images:MinRequestInterval"] = "00:00:00",
    };

    public static void AddFakeImageClient(this IServiceCollection services)
    {
        services.RemoveAll<IImageClient>();
        services.AddSingleton<FakeImageClient>();
        services.AddSingleton<IImageClient>(sp => sp.GetRequiredService<FakeImageClient>());
    }
}
