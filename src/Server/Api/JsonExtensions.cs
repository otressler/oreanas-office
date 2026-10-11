using System.Text.Json;
using System.Text.Json.Serialization;

namespace OreanasOffice.Server.Api;

public static class JsonExtensions
{
    // Enums travel as camelCase strings ("dm", "planned", "medium"), matching the
    // knowledge base, and the OpenAPI document lists them as string unions.
    public static WebApplicationBuilder AddApiJson(this WebApplicationBuilder builder)
    {
        builder.Services.ConfigureHttpJsonOptions(options =>
            options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));
        return builder;
    }
}
