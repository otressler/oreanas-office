using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Health;
using OreanasOffice.Server.Hosting;
using OreanasOffice.Server.Sessions;

var builder = WebApplication.CreateBuilder(args);

builder.AddPersistence();
builder.AddDataProtectionKeys();
builder.AddForwardedHeaders();
builder.AddApiJson();
builder.AddAccounts();
builder.AddAppAuthorization();
builder.Services.AddOpenApi();

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

if (app.Environment.IsEnvironment(TestingEndpoints.Environment))
{
    app.MapTestingEndpoints();
}

app.Run();

public partial class Program;
