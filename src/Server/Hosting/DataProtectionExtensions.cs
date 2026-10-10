namespace OreanasOffice.Server.Hosting;

public static class DataProtectionExtensions
{
    // Stage 1 backend lane: persist Data Protection keys to Blob Storage.
    public static WebApplicationBuilder AddDataProtectionKeys(this WebApplicationBuilder builder)
    {
        return builder;
    }
}
