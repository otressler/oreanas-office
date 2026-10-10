# Starts local development: SQL Server and Azurite in Docker, the backend with
# hot reload on http://localhost:5080, and the Vite dev server.
# Open http://localhost:5173.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

docker compose -f "$root/docker-compose.yml" up -d sql azurite

if (-not (Test-Path "$root/src/web/node_modules")) {
    npm --prefix "$root/src/web" install
}

$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = 'http://localhost:5080'
$server = Start-Process dotnet -ArgumentList 'watch', '--project', "$root/src/Server", '--no-launch-profile' -PassThru -NoNewWindow
try {
    npm --prefix "$root/src/web" run dev
}
finally {
    Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
}
