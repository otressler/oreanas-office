# Starts local development: SQL Server and Azurite in Docker, the backend with
# hot reload on http://localhost:5080, and the Vite dev server.
# Open http://localhost:5173.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent

docker compose -f "$root/docker-compose.yml" up -d sql azurite

if (-not (Test-Path "$root/src/web/node_modules")) {
    npm --prefix "$root/src/web" install
}

# The Foundry image deployment from .env (the image-assets skill reads the same values), so
# the editor can generate backgrounds. Without them generating answers ImagesUnavailable.
$envFile = Join-Path $root '.env'
if (Test-Path -LiteralPath $envFile) {
    $images = @{ AZURE_OPENAI_ENDPOINT = 'Images__Endpoint'; AZURE_API_KEY = 'Images__ApiKey'; AZURE_IMAGE_DEPLOYMENT = 'Images__Deployment' }
    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$' -and $images.ContainsKey($Matches[1])) {
            [Environment]::SetEnvironmentVariable($images[$Matches[1]], $Matches[2].Trim('"', "'"))
        }
    }
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
