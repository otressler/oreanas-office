// Parameters for main.bicep. No secret or personal values live here:
// they come from environment variables when you deploy (see infra/README.md).
using 'main.bicep'

// The app runs in West Europe (Amsterdam): Container Apps had no capacity in Germany West Central
// on 2026-10-11. The database, storage and logs stay in the resource group's region (Frankfurt).
param appLocation = 'westeurope'

// Needs a CNAME oreanas-office → the app's default host name and a TXT record
// asuid.oreanas-office with the environment's verification id (see infra/README.md).
// Deploy with infra/deploy.ps1: it requests the certificate and binds it.
param customDomainName = 'oreanas-office.otressler.de'
param customDomainCertificateExists = bool(readEnvironmentVariable('CUSTOM_DOMAIN_CERTIFICATE_EXISTS', 'false'))

param sqlEntraAdminLogin = readEnvironmentVariable('SQL_ENTRA_ADMIN_LOGIN')
param sqlEntraAdminObjectId = readEnvironmentVariable('SQL_ENTRA_ADMIN_OBJECT_ID')
param sqlClientIpAddress = readEnvironmentVariable('SQL_CLIENT_IP', '')

param budgetContactEmail = readEnvironmentVariable('BUDGET_CONTACT_EMAIL')

// Private ghcr.io package: user name + PAT with read:packages. Leave both unset if the package is public.
param ghcrUsername = readEnvironmentVariable('GHCR_USERNAME', '')
param ghcrToken = readEnvironmentVariable('GHCR_TOKEN', '')

// Unset on the first deployment (public placeholder). On later runs set it to the live image,
// otherwise the deployment rolls the app back to the placeholder. infra/deploy.ps1 does this for you.
param containerImage = readEnvironmentVariable('CONTAINER_IMAGE', 'mcr.microsoft.com/dotnet/samples:aspnetapp')
