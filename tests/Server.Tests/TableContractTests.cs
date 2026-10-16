using System.Text.Json;
using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Tests;

// The hub contract the frontend codes against (src/web/src/table/hub.ts) comes from
// openapi.json. Its method lists must be the hub's interfaces, so a renamed method
// can't reach the frontend unnoticed.
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class TableContractTests
{
    [Fact]
    public void The_OpenAPI_document_lists_the_hub_methods()
    {
        Assert.Equal(TableOpenApi.MethodNamesOf<ITableHub>(), EnumIn("TableHubMethod"));
    }

    [Fact]
    public void The_OpenAPI_document_lists_the_client_messages()
    {
        Assert.Equal(TableOpenApi.MethodNamesOf<ITableClient>(), EnumIn("TableClientMethod"));
    }

    [Fact]
    public void The_hub_implements_the_contract()
    {
        Assert.True(typeof(ITableHub).IsAssignableFrom(typeof(TableHub)));
    }

    private static List<string> EnumIn(string schema)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "openapi.json")));
        return [.. document.RootElement
            .GetProperty("components").GetProperty("schemas").GetProperty(schema).GetProperty("enum")
            .EnumerateArray().Select(value => value.GetString()!)];
    }
}
