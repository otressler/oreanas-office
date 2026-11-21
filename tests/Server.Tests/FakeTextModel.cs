using System.Collections.Concurrent;
using System.Net;
using System.Text;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OreanasOffice.Server.Spells;

namespace OreanasOffice.Server.Tests;

// Stands in for the text model (knowledge/decisions/text-model.md) in every test app, so no
// test sends a real request. Answers come from Answer, by the request's purpose; without one
// it throws. Only SpellImportTests set answers, and its tests run one after another.
public sealed class FakeTextModel : ITextModelClient
{
    public bool Configured { get; set; } = true;

    public Func<TextModelRequest, TextModelResult>? Answer { get; set; }

    public ConcurrentQueue<TextModelRequest> Requests { get; } = new();

    public void Reset()
    {
        Configured = true;
        Answer = null;
        Requests.Clear();
    }

    public Task<TextModelResult> CompleteJsonAsync(TextModelRequest request, CancellationToken cancellationToken)
    {
        Requests.Enqueue(request);
        return Answer is { } answer
            ? Task.FromResult(answer(request))
            : Task.FromException<TextModelResult>(new TextModelException("No fake answer."));
    }
}

// The wiki's pages by slug ("moonbeam"); every other page is a 404.
public sealed class FakeWiki : HttpMessageHandler
{
    public ConcurrentDictionary<string, string> Pages { get; } = new();

    public ConcurrentQueue<Uri> Requests { get; } = new();

    // The client factory disposes handlers it rotates out; this one lives as long as the app.
    protected override void Dispose(bool disposing)
    {
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Requests.Enqueue(request.RequestUri!);
        var slug = request.RequestUri!.AbsolutePath.TrimStart('/').Replace("spell:", "", StringComparison.Ordinal);
        return Task.FromResult(Pages.TryGetValue(slug, out var html)
            ? new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(html, Encoding.UTF8, "text/html") }
            : new HttpResponseMessage(HttpStatusCode.NotFound) { Content = new StringContent("<html>not found</html>") });
    }
}

public static class FakeTextModelExtensions
{
    public static void AddFakeTextModel(this IServiceCollection services)
    {
        services.RemoveAll<ITextModelClient>();
        services.AddSingleton<FakeTextModel>();
        services.AddSingleton<ITextModelClient>(sp => sp.GetRequiredService<FakeTextModel>());
        services.AddSingleton<FakeWiki>();
        services.AddHttpClient(SpellImport.WikiClient).ConfigurePrimaryHttpMessageHandler(sp => sp.GetRequiredService<FakeWiki>());
    }
}
