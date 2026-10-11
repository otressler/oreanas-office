<#
.SYNOPSIS
Serves the production container from this machine at https://dev.oreanas-office.otressler.de,
so phones on the home network can test the PWA before production.

.DESCRIPTION
Starts the production container and a Traefik proxy (docker compose profiles "app"
and "phone") on this machine. Traefik gets a Let's Encrypt certificate through the
INWX DNS challenge, so the machine never has to be reachable from the internet. The
site works only inside the home network.

One-time setup:
- INWX: an A record for dev.oreanas-office.otressler.de pointing to this machine's
  address on the home network (for example 192.168.178.69). Give the machine a fixed
  address in the router. Switching to another dev machine means changing the record;
  the script warns when it doesn't point here.
- Home DNS (Pi-hole on the homeserver): nothing to do, as long as no wildcard
  for otressler.de sends the name to the homeserver, and Pi-hole's upstream doesn't
  hide answers that point into the home network. If the upstream is a Fritz!Box,
  add otressler.de to its DNS rebind protection exceptions.
- .env in the repository root (gitignored): INWX_USERNAME and INWX_PASSWORD, plus
  INWX_SHARED_SECRET if the INWX account uses 2FA.
- Firewall: allow inbound TCP 443 from the home network. On Windows, as admin:
  New-NetFirewallRule -DisplayName "Oreanas Office 443" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow -Profile Private

.EXAMPLE
pwsh scripts/phone.ps1
Builds and starts the current working tree.

.EXAMPLE
pwsh scripts/phone.ps1 -Stop
Stops the app container and Traefik. SQL Server and Azurite keep running.
#>
param(
    [string]$Domain = 'dev.oreanas-office.otressler.de',
    [switch]$Stop
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$compose = @('compose', '-f', "$root/docker-compose.yml", '--profile', 'app', '--profile', 'phone')

if ($Stop) {
    docker @compose stop traefik app
    return
}

$envFile = "$root/.env"
$hasCredentials = $env:INWX_PASSWORD -or ((Test-Path $envFile) -and (Select-String -Path $envFile -Pattern '^\s*INWX_PASSWORD=.+' -Quiet))
if (-not $hasCredentials) {
    throw 'INWX_USERNAME and INWX_PASSWORD are missing from .env. See Get-Help scripts/phone.ps1.'
}

# Phones resolve the domain through the same router, so if it doesn't point at this
# machine here, it won't on the phones either.
$localAddresses = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
    Where-Object { $_.OperationalStatus -eq 'Up' } |
    ForEach-Object { $_.GetIPProperties().UnicastAddresses.Address } |
    Where-Object { $_.AddressFamily -eq 'InterNetwork' } |
    ForEach-Object { $_.ToString() }
try {
    $resolved = [System.Net.Dns]::GetHostAddresses($Domain) |
        Where-Object { $_.AddressFamily -eq 'InterNetwork' } |
        ForEach-Object { $_.ToString() }
}
catch {
    $resolved = @()
}
if (-not $resolved) {
    Write-Warning "$Domain doesn't resolve. Check the A record at INWX and the router's DNS rebind protection."
}
elseif (-not ($resolved | Where-Object { $_ -in $localAddresses })) {
    Write-Warning "$Domain points to $($resolved -join ', '), not to this machine ($($localAddresses -join ', ')). Change the A record at INWX."
}

docker @compose up --build --detach
if ($LASTEXITCODE -ne 0) { throw 'docker compose failed.' }

# The first certificate takes a minute or two while the DNS challenge propagates.
# Any HTTP answer over valid HTTPS means DNS, certificate, Traefik and app all work;
# /api/health may still say 503 while the database starts.
if ($resolved) {
    Write-Host "Waiting for https://$Domain ..."
    $deadline = (Get-Date).AddMinutes(4)
    while ($true) {
        try {
            Invoke-WebRequest "https://$Domain/api/health" -TimeoutSec 5 -SkipHttpErrorCheck | Out-Null
            break
        }
        catch {
            if ((Get-Date) -gt $deadline) {
                throw "https://$Domain doesn't answer. See: docker compose logs traefik app"
            }
            Start-Sleep -Seconds 5
        }
    }
}

Write-Host ""
Write-Host "Ready: https://$Domain"
Write-Host "Stop with: pwsh scripts/phone.ps1 -Stop"
