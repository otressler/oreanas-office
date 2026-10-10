// Blob Storage for Data Protection keys now, images later.
// Shared key access is off: the app reaches it only through its managed identity.

@description('Azure region.')
param location string

@description('Storage account name (3-24 lowercase letters and digits, globally unique).')
@minLength(3)
@maxLength(24)
param name string

@description('Blob containers to create.')
param containerNames string[]

@description('Days to keep deleted blobs and containers.')
param softDeleteDays int = 7

resource account 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: name
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-01-01' = {
  parent: account
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: softDeleteDays
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: softDeleteDays
    }
  }
}

resource containers 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = [
  for containerName in containerNames: {
    parent: blobService
    name: containerName
    properties: {
      publicAccess: 'None'
    }
  }
]

output name string = account.name
output blobEndpoint string = account.properties.primaryEndpoints.blob
