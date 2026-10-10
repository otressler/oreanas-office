// Log Analytics workspace for Container Apps logs.
// Billed per GB ingested; the daily cap keeps a log storm from costing real money.

@description('Azure region.')
param location string

@description('Workspace name.')
param name string

@description('Daily ingestion cap in GB. Ingestion stops for the rest of the day when it is reached.')
param dailyQuotaGb string

resource workspace 'Microsoft.OperationalInsights/workspaces@2025-02-01' = {
  name: name
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: json(dailyQuotaGb)
    }
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
  }
}

output name string = workspace.name
