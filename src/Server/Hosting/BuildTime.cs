using System.Reflection;

namespace OreanasOffice.Server.Hosting;

public static class BuildTime
{
    // True while `dotnet build` runs the app through dotnet-getdocument to write
    // openapi.json. Background work and external services are skipped then, so
    // the build never connects to the database or Blob Storage.
    public static bool IsGeneratingOpenApiDocument { get; } =
        Assembly.GetEntryAssembly()?.GetName().Name == "GetDocument.Insider";
}
