using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Tests;

// Stands in for the Foundry image model in every test app, so no test sends a real request
// (knowledge/implementation-plan.md: lanes test against a fake image client). By default
// it answers with the guide itself as a PNG and fixed token use. Tests queue other answers
// with Enqueue, or hold requests with Gate, and read what was sent from Requests. The app
// is shared by the "App" collection, whose tests run one after another; call Reset first.
public sealed class FakeImageClient : IImageClient
{
    public static readonly ImageUsage DefaultUsage = new(InputImageTokens: 1536, InputTextTokens: 385, OutputTokens: 1372);

    private readonly ConcurrentQueue<Func<ImageEditRequest, CancellationToken, Task<ImageResult>>> _answers = new();

    public ConcurrentQueue<ImageEditRequest> Requests { get; } = new();

    // While set, each request waits until the gate opens: lets a test see a job Running.
    public TaskCompletionSource? Gate { get; set; }

    public void Reset()
    {
        _answers.Clear();
        Requests.Clear();
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
