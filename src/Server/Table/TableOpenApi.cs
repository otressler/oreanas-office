using System.Reflection;
using System.Text.Json;
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
        [
            typeof(MoveTokenRequest), typeof(TokenMovedEvent), typeof(MovePreviewEvent), typeof(MovePreviewClearedEvent),
            typeof(HubResult), typeof(MoveResult),
            typeof(BoardCell), typeof(PingRequest), typeof(DrawArrowRequest), typeof(PingedEvent), typeof(ArrowDrawnEvent),
            typeof(AddStatusRequest), typeof(RemoveStatusRequest), typeof(SetStatusLevelRequest),
            typeof(TokenStatusesChangedEvent), typeof(StatusResult),
            typeof(TokenRemovedEvent), typeof(TokenRestoredEvent),
            typeof(WatchSessionRequest), typeof(WatchedSession), typeof(WatchedCharacter), typeof(WatchResult),
            typeof(EncounterStartedEvent), typeof(PlayModeChangedEvent), typeof(PresenceChangedEvent),
            typeof(ChangeFogRequest), typeof(FogChangedEvent), typeof(TokenNumber), typeof(SetTokensHiddenRequest),
            typeof(TokenRevealedEvent), typeof(TokenHiddenEvent), typeof(SpawnCreaturesRequest), typeof(SpawnedCreature),
            typeof(SpawnResult), typeof(TokensAddedEvent),
            typeof(Encounters.InitiativeEntry), typeof(Encounters.InitiativeView), typeof(SetInitiativeRequest),
            typeof(InitiativeChangedEvent), typeof(InitiativeResult), typeof(InitiativeRollResult),
        ];

    public async Task TransformAsync(
        OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        foreach (var type in Messages)
        {
            document.AddComponent(type.Name, await context.GetOrCreateSchemaAsync(type, null, cancellationToken));
        }

        // The generator inlines nested records and drops their nullability (MoveResult.Move is
        // null whenever Error is set; PingRequest.Cell is null for a token ping). Every
        // property of a message whose type has a component of its own becomes a reference,
        // nullable where the C# property is.
        var nullability = new NullabilityInfoContext();
        foreach (var type in Messages)
        {
            if (document.Components?.Schemas?[type.Name] is not OpenApiSchema schema || schema.Properties is not { } properties)
            {
                continue;
            }

            foreach (var parameter in type.GetConstructors().Single().GetParameters())
            {
                var name = JsonNamingPolicy.CamelCase.ConvertName(parameter.Name!);
                if (Reference(document, parameter.ParameterType) is not { } reference)
                {
                    continue;
                }

                properties[name] = nullability.Create(parameter).WriteState == NullabilityState.Nullable
                    ? new OpenApiSchema { OneOf = [reference, new OpenApiSchema { Type = JsonSchemaType.Null }] }
                    : reference;
            }
        }

        document.AddComponent("TableHubMethod", MethodNames<ITableHub>());
        document.AddComponent("TableClientMethod", MethodNames<ITableClient>());
    }

    // A reference to the type's component, or to an array of it for a list; null for types
    // without a component of their own (strings, ids, numbers).
    private static IOpenApiSchema? Reference(OpenApiDocument document, Type type)
    {
        if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(List<>))
        {
            return Reference(document, type.GetGenericArguments()[0]) is { } item
                ? new OpenApiSchema { Type = JsonSchemaType.Array, Items = item }
                : null;
        }

        var underlying = Nullable.GetUnderlyingType(type) ?? type;
        return underlying.IsClass && underlying != typeof(string) && document.Components?.Schemas?.ContainsKey(underlying.Name) == true
            ? new OpenApiSchemaReference(underlying.Name, document)
            : null;
    }

    public static IReadOnlyList<string> MethodNamesOf<T>() =>
        [.. typeof(T).GetMethods().Select(m => m.Name).Order(StringComparer.Ordinal)];

    private static OpenApiSchema MethodNames<T>() => new()
    {
        Type = JsonSchemaType.String,
        Enum = [.. MethodNamesOf<T>().Select(name => (JsonNode)JsonValue.Create(name))],
    };
}
