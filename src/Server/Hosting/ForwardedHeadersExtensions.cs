using Microsoft.AspNetCore.HttpOverrides;

namespace OreanasOffice.Server.Hosting;

public static class ForwardedHeadersExtensions
{
    // Azure Container Apps terminates TLS at its ingress and calls the app over
    // HTTP. Trusting its X-Forwarded-Proto makes Request.Scheme "https", so sign-in
    // redirect URIs and secure cookies are right. The ingress's address isn't
    // known in advance, and the container is only reachable through it, so the
    // known networks and proxies are cleared.
    public static WebApplicationBuilder AddForwardedHeaders(this WebApplicationBuilder builder)
    {
        builder.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            options.KnownIPNetworks.Clear();
            options.KnownProxies.Clear();
        });
        return builder;
    }
}
