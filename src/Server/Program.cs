using OreanasOffice.Server.Data;
using OreanasOffice.Server.Health;
using OreanasOffice.Server.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.AddPersistence();
builder.AddDataProtectionKeys();
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseFrontendStaticFiles();

app.MapHealthEndpoints();

app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;
