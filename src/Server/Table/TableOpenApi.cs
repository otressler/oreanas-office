using System.Text.Json.Nodes;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace OreanasOffice.Server.Table;

// The hub isn't an HTTP endpoint, so OpenAPI doesn't see its types. This adds them to
// openapi.json, with the hub's method names as two string enums, so `npm run gen:api`
// gives the frontend the same contract the server compiles against.
public sealed class TableOpenApi : IOpenApiDocumentTransformer
{
    private static readonly Type[] Messages =
        [typeof(MoveTokenRequest), typeof(TokenMovedEvent), typeof(HubResult), typeof(MoveResult)];

    public async Task TransformAsync(
        OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        foreach (var type in Messages)
        {
            document.AddComponent(type.Name, await context.GetOrCreateSchemaAsync(type, null, cancellationToken));
        }

        // The generator inlines MoveResult.Move and drops its nullability; it is null
        // whenever Error is set.
        if (document.Components?.Schemas?[nameof(MoveResult)] is OpenApiSchema result && result.Properties is { } properties)
        {
            properties["move"] = new OpenApiSchema
            {
                OneOf = [new OpenApiSchemaReference(nameof(TokenMovedEvent), document), new OpenApiSchema { Type = JsonSchemaType.Null }],
            };
        }

        document.AddComponent("TableHubMethod", MethodNames<ITableHub>());
        document.AddComponent("TableClientMethod", MethodNames<ITableClient>());
    }

    public static IReadOnlyList<string> MethodNamesOf<T>() =>
        [.. typeof(T).GetMethods().Select(m => m.Name).Order(StringComparer.Ordinal)];

    private static OpenApiSchema MethodNames<T>() => new()
    {
        Type = JsonSchemaType.String,
        Enum = [.. MethodNamesOf<T>().Select(name => (JsonNode)JsonValue.Create(name))],
    };
}
