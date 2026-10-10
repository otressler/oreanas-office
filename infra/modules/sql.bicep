// Azure SQL logical server (Microsoft Entra-only sign-in) and one database on the free offer.
// Free offer: 100,000 vCore-seconds, 32 GB data and 32 GB backup per month, serverless General Purpose.
// https://learn.microsoft.com/azure/azure-sql/database/free-offer

@description('Azure region.')
param location string

@description('Logical server name (globally unique, lowercase).')
param serverName string

@description('Database name.')
param databaseName string

@description('Microsoft Entra admin of the server: sign-in name (UPN), for example you@example.com.')
param entraAdminLogin string

@description('Microsoft Entra admin of the server: object id of that user.')
param entraAdminObjectId string

@description('Optional public IP address that may reach the server, for running the grant script from your machine. Empty for none.')
param clientIpAddress string = ''

@description('Minutes without connections before the database pauses. 15 is the minimum.')
@minValue(15)
param autoPauseDelayMinutes int = 60

resource server 'Microsoft.Sql/servers@2025-01-01' = {
  name: serverName
  location: location
  properties: {
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      azureADOnlyAuthentication: true
      principalType: 'User'
      login: entraAdminLogin
      sid: entraAdminObjectId
      tenantId: tenant().tenantId
    }
  }
}

// Consumption Container Apps have no fixed outbound IP, so allow Azure services.
// 0.0.0.0 - 0.0.0.0 is the documented "Allow Azure services and resources" rule.
resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2025-01-01' = {
  parent: server
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource allowClient 'Microsoft.Sql/servers/firewallRules@2025-01-01' = if (!empty(clientIpAddress)) {
  parent: server
  name: 'AllowOwnerClient'
  properties: {
    startIpAddress: clientIpAddress
    endIpAddress: clientIpAddress
  }
}

resource database 'Microsoft.Sql/servers/databases@2025-01-01' = {
  parent: server
  name: databaseName
  location: location
  // Serverless General Purpose, standard-series (Gen5), at most 1 vCore.
  // The app is tiny; a low ceiling also caps how fast the free allowance can burn.
  sku: {
    name: 'GP_S_Gen5'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 1
  }
  properties: {
    useFreeLimit: true
    // "Continue using database for additional charges": a busy month costs a few cents
    // instead of taking the app offline. This choice can't be switched back to AutoPause.
    freeLimitExhaustionBehavior: 'BillOverUsage'
    minCapacity: json('0.5')
    autoPauseDelay: autoPauseDelayMinutes
    maxSizeBytes: 34359738368 // 32 GB, the free data allowance
    requestedBackupStorageRedundancy: 'Local'
    zoneRedundant: false
    collation: 'SQL_Latin1_General_CP1_CI_AS'
  }
}

output serverName string = server.name
output serverFqdn string = server.properties.fullyQualifiedDomainName
output databaseName string = database.name
