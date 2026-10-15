// Oreana's Office: production infrastructure, deployed to one resource group.
// See infra/README.md for what this creates, what it costs and how to deploy it.
targetScope = 'resourceGroup'

@description('Azure region. Defaults to the resource group\'s region.')
param location string = resourceGroup().location

@description('Region of the Container Apps environment and the app. Defaults to location. Can differ because Container Apps had no capacity in Germany West Central on 2026-10-11.')
param appLocation string = location

@description('Base name used for the resources.')
@minLength(3)
@maxLength(20)
param baseName string = 'oreanas'

@description('Container image to run. The default is a public placeholder that listens on 8080, so the first deployment works before CI has pushed an image. On later runs pass the image that is currently live, or this resets it.')
param containerImage string = 'mcr.microsoft.com/dotnet/samples:aspnetapp'

@description('GitHub user name for pulling images from ghcr.io. Leave empty with ghcrToken if the package is public.')
param ghcrUsername string = ''

@description('GitHub personal access token (classic) with read:packages. Leave empty if the package is public.')
@secure()
param ghcrToken string = ''

@description('Microsoft Entra admin of the SQL server: sign-in name (UPN).')
param sqlEntraAdminLogin string

@description('Microsoft Entra admin of the SQL server: object id of that user.')
param sqlEntraAdminObjectId string

@description('Optional: your public IP address, so you can run infra/sql/grant-app-access.sql from your machine. Empty for none.')
param sqlClientIpAddress string = ''

@description('Email address for the budget alerts.')
param budgetContactEmail string

@description('First day of the first budget month (yyyy-MM-01). Defaults to the current month.')
param budgetStartDate string = utcNow('yyyy-MM-01')

@description('Log Analytics daily ingestion cap in GB (a string, because Bicep has no decimals).')
param logDailyQuotaGb string = '0.1'

@description('Optional custom host name for the app, for example oreanas-office.otressler.de. Needs a CNAME to appFqdn and a TXT record asuid.<host> with customDomainVerificationId. Empty for none.')
param customDomainName string = ''

@description('Whether the app\'s managed certificate already exists. infra/deploy.ps1 sets this; false on the first deployment with a custom domain.')
param customDomainCertificateExists bool = false

@description('Google OAuth client id for "Sign in with Google". Empty turns Google sign-in off.')
param googleClientId string = ''

@description('Google OAuth client secret. Stored as a Container Apps secret.')
@secure()
param googleClientSecret string = ''

@description('The site admin\'s Google address (Admin:Email). Becomes admin on its first verified Google sign-in.')
param adminEmail string = ''

@description('The Foundry image deployment\'s OpenAI v1 endpoint for map backgrounds. Empty turns generation off.')
param imagesEndpoint string = ''

@description('The Foundry image deployment\'s API key. Stored as a Container Apps secret.')
@secure()
param imagesApiKey string = ''

@description('The image deployment\'s name, for example gpt-image-2.5-sunburst.')
param imagesDeployment string = ''

var suffix = uniqueString(resourceGroup().id)
var appName = '${baseName}-office'
var databaseName = 'OreanasOffice'
var storageAccountName = take('st${baseName}${suffix}', 24)
var logAnalyticsWorkspaceName = 'log-${baseName}'

module logging 'modules/logging.bicep' = {
  name: 'logging'
  params: {
    location: location
    name: logAnalyticsWorkspaceName
    dailyQuotaGb: logDailyQuotaGb
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    name: storageAccountName
    containerNames: ['dataprotection']
  }
}

module sql 'modules/sql.bicep' = {
  name: 'sql'
  params: {
    location: location
    serverName: 'sql-${baseName}-${suffix}'
    databaseName: databaseName
    entraAdminLogin: sqlEntraAdminLogin
    entraAdminObjectId: sqlEntraAdminObjectId
    clientIpAddress: sqlClientIpAddress
  }
}

module app 'modules/app.bicep' = {
  name: 'app'
  dependsOn: [logging]
  params: {
    location: appLocation
    environmentName: 'cae-${baseName}'
    appName: appName
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    containerImage: containerImage
    ghcrUsername: ghcrUsername
    ghcrToken: ghcrToken
    // No password: the app signs in with its system-assigned managed identity.
    databaseConnectionString: 'Server=tcp:${sql.outputs.serverFqdn},1433;Database=${sql.outputs.databaseName};Authentication=Active Directory Managed Identity;Encrypt=True;TrustServerCertificate=False;Connect Timeout=30'
    blobServiceUri: storage.outputs.blobEndpoint
    customDomainName: customDomainName
    customDomainCertificateExists: customDomainCertificateExists
    googleClientId: googleClientId
    googleClientSecret: googleClientSecret
    adminEmail: adminEmail
    imagesEndpoint: imagesEndpoint
    imagesApiKey: imagesApiKey
    imagesDeployment: imagesDeployment
  }
}

module blobAccess 'modules/blob-access.bicep' = {
  name: 'blob-access'
  // Runs after storage implicitly: the app module already takes storage's blob endpoint.
  params: {
    storageAccountName: storageAccountName
    principalId: app.outputs.principalId
    principalName: appName
  }
}

module budgets 'modules/budgets.bicep' = {
  name: 'budgets'
  params: {
    amounts: [10, 30]
    contactEmail: budgetContactEmail
    startDate: budgetStartDate
  }
}

@description('Public address of the app: the custom domain if there is one.')
output appUrl string = 'https://${empty(customDomainName) ? app.outputs.fqdn : customDomainName}'

@description('Default host name of the app (the CNAME target for a custom domain).')
output appFqdn string = app.outputs.fqdn

@description('Custom host name, empty for none.')
output customDomainName string = customDomainName

@description('Value of the TXT record asuid.<custom host> that proves you own the domain.')
output customDomainVerificationId string = app.outputs.customDomainVerificationId

@description('Name of the app\'s managed certificate in the Container Apps environment.')
output certificateName string = app.outputs.certificateName

@description('Container Apps environment name.')
output environmentName string = app.outputs.environmentName

@description('Container app name; also the display name of its managed identity (use it in grant-app-access.sql).')
output appName string = app.outputs.name

@description('Name of the app\'s system-assigned managed identity.')
output appIdentityName string = app.outputs.name

@description('Object (principal) id of the app\'s managed identity.')
output appPrincipalId string = app.outputs.principalId

@description('SQL server host name.')
output sqlServerFqdn string = sql.outputs.serverFqdn

@description('Database name.')
output databaseName string = sql.outputs.databaseName

@description('Blob service endpoint.')
output blobEndpoint string = storage.outputs.blobEndpoint
