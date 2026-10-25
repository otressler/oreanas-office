using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Health;
using OreanasOffice.Server.Hosting;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Statuses;
using OreanasOffice.Server.Sync;
using OreanasOffice.Server.Table;

var builder = WebApplication.CreateBuilder(args);

builder.AddPersistence();
builder.AddDataProtectionKeys();
builder.AddForwardedHeaders();
builder.AddApiJson();
builder.AddAccounts();
builder.AddAppAuthorization();
builder.AddTable();
builder.AddSync();
builder.AddImages();
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer<TableOpenApi>();
    options.AddDocumentTransformer<ImageOpenApi>();
});

var app = builder.Build();

app.UseForwardedHeaders();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseFrontendStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapHealthEndpoints();
app.MapAuthEndpoints();
app.MapAdminEndpoints();
app.MapCampaignEndpoints();
app.MapCharacterEndpoints();
app.MapSessionEndpoints();
app.MapEncounterEndpoints();
app.MapSyncEndpoints();
app.MapMapStoreEndpoints();
app.MapImageEndpoints();
app.MapTokenImageEndpoints();
app.MapCampaignCoverEndpoints();
app.MapStatusEndpoints();
app.MapTableHub();
app.MapImageHub();

if (TestingEndpoints.IsMappedIn(app.Environment))
{
    app.MapTestingEndpoints();
}

app.Run();

public partial class Program;
