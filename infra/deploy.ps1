# Deploys infra/main.bicep to a resource group. Run by the project owner, signed in with `az login`.
#
#   $env:SQL_ENTRA_ADMIN_LOGIN     = 'you@example.com'
#   $env:SQL_ENTRA_ADMIN_OBJECT_ID = '<your Entra object id>'
#   $env:BUDGET_CONTACT_EMAIL      = 'you@example.com'
#   $env:GHCR_USERNAME             = '<github user>'        # optional, private package only
#   $env:GHCR_TOKEN                = '<PAT with read:packages>'   # optional, private package only
#   $env:SQL_CLIENT_IP             = '<your public IP>'      # optional
#   pwsh infra/deploy.ps1 -ResourceGroup rg-oreanas-office
#
# If the container app already exists, the image it runs now is kept (CONTAINER_IMAGE),
# so a re-deploy doesn't roll the app back to the placeholder image.
param(
    [Parameter(Mandatory)] [string] $ResourceGroup,
    [switch] $WhatIf
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

foreach ($name in 'SQL_ENTRA_ADMIN_LOGIN', 'SQL_ENTRA_ADMIN_OBJECT_ID', 'BUDGET_CONTACT_EMAIL') {
    if (-not [Environment]::GetEnvironmentVariable($name)) { throw "Set `$env:$name first (see infra/README.md)." }
}

$appName = 'oreanas-office'
$existing = az containerapp list --resource-group $ResourceGroup --query "[?name=='$appName'].properties.template.containers[0].image | [0]" --output tsv
if ($existing) {
    Write-Host "Keeping the live image: $existing"
    $env:CONTAINER_IMAGE = $existing
}

# main.bicepparam names its template (using 'main.bicep'), so no --template-file.
$params = Join-Path $PSScriptRoot 'main.bicepparam'
if ($WhatIf) {
    az deployment group what-if --name main --resource-group $ResourceGroup --parameters $params
}
else {
    az deployment group create --name main --resource-group $ResourceGroup --parameters $params `
        --query properties.outputs --output json
}
