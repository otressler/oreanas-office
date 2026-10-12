# Deploys infra/main.bicep to a resource group. Run by the project owner, signed in with `az login`.
#
# The deployment variables come from .env.prod in the repository root (gitignored; copy
# .env.prod.example). Variables already set in the shell win over the file, so a one-off
# override needs no edit. Without the file, set them all in the shell:
#
#   $env:SQL_ENTRA_ADMIN_LOGIN     = 'you@example.com'
#   $env:SQL_ENTRA_ADMIN_OBJECT_ID = '<your Entra object id>'
#   $env:BUDGET_CONTACT_EMAIL      = 'you@example.com'
#   $env:GOOGLE_CLIENT_ID          = '<Google OAuth client id>'
#   $env:GOOGLE_CLIENT_SECRET      = '<Google OAuth client secret>'
#   $env:ADMIN_EMAIL               = '<the site admin Google address>'
#   $env:GHCR_USERNAME             = '<github user>'        # optional, private package only
#   $env:GHCR_TOKEN                = '<PAT with read:packages>'   # optional, private package only
#   $env:SQL_CLIENT_IP             = '<your public IP>'      # optional
#   pwsh infra/deploy.ps1 -ResourceGroup rg-ot-oreanasoffice-prod-001
#
# -EnvFile <path> reads another file instead of .env.prod.
#
# If the container app already exists, the image it runs now is kept (CONTAINER_IMAGE),
# so a re-deploy doesn't roll the app back to the placeholder image.
#
# Custom domain (customDomainName in main.bicepparam): if its managed certificate doesn't exist
# yet, the first run adds the host name and requests the certificate, then a second run binds it
# (CUSTOM_DOMAIN_CERTIFICATE_EXISTS). The DNS records must exist before that, see infra/README.md.
param(
    [Parameter(Mandatory)] [string] $ResourceGroup,
    [switch] $WhatIf,
    [string] $EnvFile
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

# Reads KEY=VALUE lines into the process environment. Blank lines and lines starting with #
# are skipped; a value may be wrapped in single or double quotes. There are no inline
# comments, because a secret may contain #. Values are never printed.
function Import-EnvFile([string] $Path) {
    # Set by this script from what is live in Azure; a fixed value would roll the app back.
    $scriptOwned = 'CONTAINER_IMAGE', 'CUSTOM_DOMAIN_CERTIFICATE_EXISTS'
    $loaded = @()
    $lineNumber = 0
    foreach ($line in Get-Content -LiteralPath $Path) {
        $lineNumber++
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        if ($trimmed -notmatch '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            throw "${Path}:${lineNumber}: expected KEY=VALUE."
        }
        $name = $Matches[1]
        $value = $Matches[2]
        if ($value.Length -ge 2 -and $value[0] -eq $value[-1] -and $value[0] -in "'", '"') {
            $value = $value.Substring(1, $value.Length - 2)
        }
        if ($name -in $scriptOwned) {
            throw "${Path}:${lineNumber}: $name is set by deploy.ps1 itself; remove it from the file."
        }
        # An empty value (GHCR_TOKEN=) means not set; the shell may still set it.
        if (-not $value -or [Environment]::GetEnvironmentVariable($name)) { continue }
        [Environment]::SetEnvironmentVariable($name, $value)
        $loaded += $name
    }
    if ($loaded) { Write-Host "From $(Split-Path $Path -Leaf): $($loaded -join ', ')" }
}

if ($EnvFile) {
    if (-not (Test-Path -LiteralPath $EnvFile)) { throw "$EnvFile doesn't exist." }
    Import-EnvFile $EnvFile
}
else {
    $defaultEnvFile = Join-Path (Split-Path $PSScriptRoot -Parent) '.env.prod'
    if (Test-Path -LiteralPath $defaultEnvFile) { Import-EnvFile $defaultEnvFile }
}
$env:SQL_CLIENT_IP = (Invoke-RestMethod https://api.ipify.org)

foreach ($name in 'SQL_ENTRA_ADMIN_LOGIN', 'SQL_ENTRA_ADMIN_OBJECT_ID', 'BUDGET_CONTACT_EMAIL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'ADMIN_EMAIL') {
    if (-not [Environment]::GetEnvironmentVariable($name)) { throw "Set $name in .env.prod or `$env:$name (see infra/README.md)." }
}

$appName = 'oreanas-office'
$environmentName = 'cae-oreanas'
$certificateName = "cert-$appName"

$existing = az containerapp list --resource-group $ResourceGroup --query "[?name=='$appName'].properties.template.containers[0].image | [0]" --output tsv
if ($existing) {
    Write-Host "Keeping the live image: $existing"
    $env:CONTAINER_IMAGE = $existing
}

# Provisioning state of the app's managed certificate, or nothing if it (or the environment) doesn't exist.
function Get-CertificateState {
    $environments = az containerapp env list --resource-group $ResourceGroup --query "[?name=='$environmentName'] | length(@)" --output tsv
    if ($environments -eq '0') { return $null }
    az containerapp env certificate list --name $environmentName --resource-group $ResourceGroup --managed-certificates-only `
        --query "[?name=='$certificateName'].properties.provisioningState | [0]" --output tsv
}

$certificateExists = (Get-CertificateState) -eq 'Succeeded'
$env:CUSTOM_DOMAIN_CERTIFICATE_EXISTS = "$certificateExists".ToLower()

# main.bicepparam names its template (using 'main.bicep'), so no --template-file.
$params = Join-Path $PSScriptRoot 'main.bicepparam'
if ($WhatIf) {
    az deployment group what-if --name main --resource-group $ResourceGroup --parameters $params
    return
}

$outputs = az deployment group create --name main --resource-group $ResourceGroup --parameters $params `
    --query properties.outputs --output json

if (-not $certificateExists -and ($outputs | ConvertFrom-Json).customDomainName.value) {
    $state = Get-CertificateState
    if ($state -ne 'Succeeded') {
        throw "The managed certificate $certificateName is '$state', not 'Succeeded'. Check the CNAME and asuid TXT records (infra/README.md), then run this script again."
    }
    Write-Host 'Certificate issued. Binding it to the custom domain.'
    $env:CUSTOM_DOMAIN_CERTIFICATE_EXISTS = 'true'
    $outputs = az deployment group create --name main --resource-group $ResourceGroup --parameters $params `
        --query properties.outputs --output json
}

$outputs
