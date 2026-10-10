// Grants a principal Storage Blob Data Contributor on a storage account.

@description('Storage account name.')
param storageAccountName string

@description('Object (principal) id of the identity that gets access.')
param principalId string

@description('Stable name of that identity (for example the container app name), used to name the assignment. The principal id is only known at deploy time, so it can\'t name it.')
param principalName string

// Storage Blob Data Contributor
var roleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
)

resource account 'Microsoft.Storage/storageAccounts@2025-01-01' existing = {
  name: storageAccountName
}

resource roleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, principalName, roleDefinitionId)
  scope: account
  properties: {
    roleDefinitionId: roleDefinitionId
    principalId: principalId
    principalType: 'ServicePrincipal'
  }
}
