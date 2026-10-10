using OreanasOffice.Server.Data;
using OreanasOffice.Server.Health;
using OreanasOffice.Server.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.AddPersistence();
builder.AddDataProtectionKeys();
builder.AddForwardedHeaders();
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseForwardedHeaders();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseFrontendStaticFiles();

app.MapHealthEndpoints();

app.Run();

public partial class Program;
