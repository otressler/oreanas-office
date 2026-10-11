# Deploys infra/main.bicep to a resource group. Run by the project owner, signed in with `az login`.
#
#   $env:SQL_ENTRA_ADMIN_LOGIN     = 'you@example.com'
#   $env:SQL_ENTRA_ADMIN_OBJECT_ID = '<your Entra object id>'
#   $env:BUDGET_CONTACT_EMAIL      = 'you@example.com'
#   $env:GHCR_USERNAME             = '<github user>'        # optional, private package only
#   $env:GHCR_TOKEN                = '<PAT with read:packages>'   # optional, private package only
#   $env:SQL_CLIENT_IP             = '<your public IP>'      # optional
#   pwsh infra/deploy.ps1 -ResourceGroup rg-ot-oreanasoffice-prod-001
#
# If the container app already exists, the image it runs now is kept (CONTAINER_IMAGE),
# so a re-deploy doesn't roll the app back to the placeholder image.
#
# Custom domain (customDomainName in main.bicepparam): if its managed certificate doesn't exist
# yet, the first run adds the host name and requests the certificate, then a second run binds it
# (CUSTOM_DOMAIN_CERTIFICATE_EXISTS). The DNS records must exist before that, see infra/README.md.
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
