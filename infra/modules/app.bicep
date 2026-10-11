// Container Apps environment (Consumption only) and the app itself.

@description('Azure region.')
param location string

@description('Container Apps environment name.')
param environmentName string

@description('Container app name.')
param appName string

@description('Log Analytics workspace that receives the container logs.')
param logAnalyticsWorkspaceName string

@description('Container image to run.')
param containerImage string

@description('GitHub user name for pulling from ghcr.io. Empty if the package is public.')
param ghcrUsername string

@description('GitHub personal access token with read:packages. Empty if the package is public.')
@secure()
param ghcrToken string

@description('Database connection string (no secret: it uses the managed identity).')
param databaseConnectionString string

@description('Blob service endpoint, for example https://<account>.blob.core.windows.net/.')
param blobServiceUri string

@description('Custom host name, for example oreanas-office.otressler.de. Empty for none.')
param customDomainName string

@description('Whether the managed certificate for customDomainName already exists. See infra/deploy.ps1.')
param customDomainCertificateExists bool

@description('Google OAuth client id. Empty turns Google sign-in off.')
param googleClientId string

@description('Google OAuth client secret.')
@secure()
param googleClientSecret string

@description('The site admin\'s Google address. Empty for no admin.')
param adminEmail string

resource workspace 'Microsoft.OperationalInsights/workspaces@2025-02-01' existing = {
  name: logAnalyticsWorkspaceName
}

// No workloadProfiles: a Consumption-only environment. Dedicated workload profiles bill while idle.
resource environment 'Microsoft.App/managedEnvironments@2025-07-01' = {
  name: environmentName
  location: location
  properties: {
    zoneRedundant: false
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
  }
}

var usePrivateRegistry = !empty(ghcrToken)
var useGoogle = !empty(googleClientId) && !empty(googleClientSecret)

// A managed certificate can only be issued for a host name the app already has, and the app can
// only bind a certificate that exists. So the first deployment with a custom domain adds the host
// name without a certificate and requests one; the next binds it. infra/deploy.ps1 runs both.
var hasCustomDomain = !empty(customDomainName)
var certificateName = 'cert-${appName}'

resource app 'Microsoft.App/containerApps@2025-07-01' = {
  name: appName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: environment.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 8080
        // auto = HTTP/1.1 and HTTP/2; WebSockets (SignalR, stage 4) work with it.
        transport: 'auto'
        allowInsecure: false
        customDomains: hasCustomDomain
          ? [
              customDomainCertificateExists
                ? {
                    name: customDomainName
                    bindingType: 'SniEnabled'
                    certificateId: '${environment.id}/managedCertificates/${certificateName}'
                  }
                : {
                    name: customDomainName
                    bindingType: 'Disabled'
                  }
            ]
          : []
      }
      secrets: concat(
        usePrivateRegistry
          ? [
              {
                name: 'ghcr-token'
                value: ghcrToken
              }
            ]
          : [],
        useGoogle
          ? [
              {
                name: 'google-client-secret'
                value: googleClientSecret
              }
            ]
          : []
      )
      registries: usePrivateRegistry
        ? [
            {
              server: 'ghcr.io'
              username: ghcrUsername
              passwordSecretRef: 'ghcr-token'
            }
          ]
        : []
    }
    template: {
      containers: [
        {
          name: 'app'
          image: containerImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: concat(
            [
              {
                name: 'ASPNETCORE_ENVIRONMENT'
                value: 'Production'
              }
              {
                name: 'ConnectionStrings__Database'
                value: databaseConnectionString
              }
              {
                name: 'Storage__BlobServiceUri'
                value: blobServiceUri
              }
            ],
            useGoogle
              ? [
                  {
                    name: 'Authentication__Google__ClientId'
                    value: googleClientId
                  }
                  {
                    name: 'Authentication__Google__ClientSecret'
                    secretRef: 'google-client-secret'
                  }
                ]
              : [],
            empty(adminEmail)
              ? []
              : [
                  {
                    name: 'Admin__Email'
                    value: adminEmail
                  }
                ]
          )
          // No probes on purpose: Container Apps then uses its default TCP startup, liveness and
          // readiness probes on port 8080. Never point any probe at /api/health: it answers 503
          // for up to a minute while a paused database resumes, which would hold back or restart
          // the replica.
          //
          // Production config the app reads: no ConnectionStrings__Storage here (that switches the
          // app to connection-string mode), and no AZURE_CLIENT_ID (system-assigned identity).
        }
      ]
      scale: {
        // 0: scale to zero between sessions. 1: SignalR runs in-process with the board
        // state in memory, so there must never be a second replica.
        minReplicas: 0
        maxReplicas: 1
      }
    }
  }
}

// Free certificate from DigiCert, renewed by Azure. Validated through the CNAME record, which has
// to point at the app's default host name, plus the TXT record asuid.<host> with the
// environment's customDomainVerificationId.
resource certificate 'Microsoft.App/managedEnvironments/managedCertificates@2025-07-01' = if (hasCustomDomain && !customDomainCertificateExists) {
  parent: environment
  name: certificateName
  location: location
  dependsOn: [app]
  properties: {
    subjectName: customDomainName
    domainControlValidation: 'CNAME'
  }
}

output name string = app.name
output fqdn string = app.properties.configuration.ingress.fqdn
output principalId string = app.identity.principalId
output environmentName string = environment.name
output customDomainVerificationId string = environment.properties.customDomainConfiguration.customDomainVerificationId
output certificateName string = certificateName
