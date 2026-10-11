using System.Text.Json;
using System.Text.Json.Serialization;

namespace OreanasOffice.Server.Api;

public static class JsonExtensions
{
    // Enums travel as camelCase strings ("dm", "planned", "medium"), matching the
    // knowledge base, and the OpenAPI document lists them as string unions. Numbers
    // are strict: the web defaults also accept "6" for 6, which makes the document
    // type every integer as `number | string` in TypeScript.
    public static WebApplicationBuilder AddApiJson(this WebApplicationBuilder builder)
    {
        builder.Services.ConfigureHttpJsonOptions(options =>
        {
            options.SerializerOptions.NumberHandling = JsonNumberHandling.Strict;
            options.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
        });
        return builder;
    }
}
