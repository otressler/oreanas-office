# Production infrastructure

Everything for production lives in one resource group and is described by `main.bicep`. Only the project owner deploys it. Background and the cost reasoning: [`knowledge/decisions/hosting.md`](../knowledge/decisions/hosting.md).

Files:

| File | What it is |
|------|------------|
| `main.bicep`, `modules/*.bicep` | The resources below |
| `main.bicepparam` | Parameters. Secrets and personal values come from environment variables, never from the file |
| `deploy.ps1` | Deploys the template, keeps the live container image and binds the custom domain's certificate (see step 4 and step 8) |
| `sql/grant-app-access.sql` | Gives the app's managed identity access to the database (step 5) |

## Resources and monthly cost

Planned use: two 12-hour sessions plus about 10 hours of prep a month, so about 34 active hours. **Regions:** the Container Apps environment and the app run in **West Europe** (Amsterdam), everything else in **Germany West Central** (Frankfurt). Container Apps had no capacity in Frankfurt on 2026-10-11 (`AKSCapacityHeavyUsage`). Prices are retail list prices in USD for the resource's region, taken from the [Azure Retail Prices API](https://prices.azure.com/api/retail/prices) on 2026-10-11. Free grants are from the linked docs.

| Resource | Name | Tier and settings | Expected cost | Source |
|----------|------|-------------------|---------------|--------|
| Container Apps environment | `cae-oreanas` | West Europe. Consumption only (the default "Consumption" workload profile, no dedicated profiles), logs to Log Analytics in Frankfurt | $0. No fee unless you add dedicated profiles, private endpoints or planned maintenance, which this template doesn't | [billing](https://learn.microsoft.com/azure/container-apps/billing) |
| Container app | `oreanas-office` | 0.5 vCPU, 1 GiB, 0–1 replicas, external HTTPS ingress on port 8080, system-assigned identity | **$0**. 34 h uses about 61,000 vCPU-s and 122,000 GiB-s, about a third of the free grant (180,000 vCPU-s, 360,000 GiB-s, 2 M requests per subscription per month). Without the grant it would be about $1.84 ($0.000024/vCPU-s, $0.000003/GiB-s) | [pricing](https://azure.microsoft.com/pricing/details/container-apps/), [billing](https://learn.microsoft.com/azure/container-apps/billing) |
| Azure SQL logical server | `sql-oreanas-<suffix>` | Microsoft Entra-only sign-in (you are the admin), TLS 1.2, firewall: Azure services, plus your IP if you set one | $0 | |
| Azure SQL database | `OreanasOffice` | **Free offer**: serverless General Purpose Gen5, 0.5–1 vCore, auto-pause after 60 min, 32 GB, local backup redundancy, "continue using database for additional charges" when the free amount is used up | **$0**. 34 h at 0.5 vCore is about 61,000 vCore-s, plus up to about 13,000 for the hour before each pause, under the free 100,000. Beyond that: $0.574 per vCore-hour (about $0.16 per 1,000 vCore-s) | [free offer](https://learn.microsoft.com/azure/azure-sql/database/free-offer) |
| Storage account | `storeanas<suffix>` | StorageV2, Standard_LRS, Hot, no public blob access, no shared keys (managed identity only), TLS 1.2, blob and container soft delete for 7 days, container `dataprotection` | **< $0.05**. Under 1 GB at $0.0196/GB, writes $0.054 per 10,000 | Retail Prices API |
| Log Analytics workspace | `log-oreanas` | PerGB2018, 30 days retention, daily cap 0.1 GB | **$0**. The first 5 GB a month per billing account are free, and the cap allows at most about 3 GB. Beyond 5 GB: $2.99/GB. 31 days of retention are included | [pricing](https://azure.microsoft.com/pricing/details/monitor/) |
| Budgets | `budget-10`, `budget-30` | Monthly, on the resource group, email at 100 % actual and 100 % forecast | $0 | |
| Role assignment | | Storage Blob Data Contributor for the app's identity on the storage account | $0 | |
| *Outside this resource group:* role assignment | | Cognitive Services OpenAI User for the app's identity on the Foundry resource, assigned by hand (step 5). The images themselves are billed per token on the Foundry deployment | $0 for the role | |
| Custom domain and managed certificate | `oreanas-office.otressler.de`, `cert-oreanas-office` | Host name on the app, free DigiCert certificate in the environment, renewed by Azure, validated by CNAME | $0. Custom domains and managed certificates are free in Container Apps; the domain is already registered at INWX | [custom domains](https://learn.microsoft.com/azure/container-apps/custom-domains-managed-certificates) |
| *Outside Azure:* GitHub Container Registry | `ghcr.io/otressler/oreanas-office` | Private or public package | $0. GitHub says Container registry storage and bandwidth are currently free | [GitHub Packages billing](https://docs.github.com/billing/concepts/product-billing/github-packages) |
| **Total** | | | **about $0–1 a month** | |

What I couldn't verify without deploying: that Azure accepts the free offer with a 1-vCore maximum (`GP_S_Gen5_1`). The Retail Prices API has a "1 vCore - Free" meter, so it should work. If the deployment rejects it, change `capacity: 1` to `2` in `modules/sql.bicep`. The free use stays the same because billing follows actual use, with a minimum of 0.5 vCore while the database runs.

## Deploy, step by step

You need the Azure CLI (2.61 or newer), PowerShell 7, and for step 5 [`sqlcmd`](https://learn.microsoft.com/sql/tools/sqlcmd/sqlcmd-download-install) (`winget install sqlcmd`). The commands are for PowerShell, run from the repository root.

### 1. Sign in and register the resource providers

```powershell
az login
az account set --subscription "<subscription name or id>"
foreach ($ns in 'Microsoft.App', 'Microsoft.OperationalInsights', 'Microsoft.Sql', 'Microsoft.Storage', 'Microsoft.Consumption') {
    az provider register --namespace $ns --wait
}
```

### 2. Create the resource group

Germany West Central (Frankfurt) is the closest region. The app itself goes to West Europe (`appLocation` in `main.bicepparam`), see above. All free SQL databases in a subscription share one region, so if you already have a free database elsewhere, use that region.

```powershell
az group create --name rg-ot-oreanasoffice-prod-001 --location germanywestcentral
```

### 3. Decide how Azure pulls the image

New packages on ghcr.io are private. Choose one:

- **Private package (recommended): a token.** Create a classic personal access token on GitHub (Settings → Developer settings → Personal access tokens → Tokens (classic)) with only the `read:packages` scope and a long expiry. Fine-grained tokens don't work with GitHub Packages. Put it in `GHCR_TOKEN` in step 4. When it expires, set a new one and run step 4 again.
- **Public package.** Leave `GHCR_USERNAME` and `GHCR_TOKEN` unset. After the first CI run has pushed the image, open the package on GitHub (your profile → Packages → oreanas-office → Package settings) and change its visibility to public. Then re-run the failed workflow. The image has no secrets in it, but anyone could download the app.

### 4. Deploy the template

```powershell
# Either fill in .env.prod (copy .env.prod.example in the repository root; gitignored) ...
Copy-Item .env.prod.example .env.prod   # then edit it

# ... or set the variables in the shell (these win over .env.prod):
$env:SQL_ENTRA_ADMIN_LOGIN     = az ad signed-in-user show --query userPrincipalName --output tsv
$env:SQL_ENTRA_ADMIN_OBJECT_ID = az ad signed-in-user show --query id --output tsv
$env:BUDGET_CONTACT_EMAIL      = 'you@example.com'
$env:GOOGLE_CLIENT_ID          = '<Google OAuth client id>'                  # Google Cloud Console → Google Auth Platform → Clients
$env:GOOGLE_CLIENT_SECRET      = '<Google OAuth client secret>'
$env:ADMIN_EMAIL               = '<your Google address>'                     # becomes site admin on its first Google sign-in
$env:AZURE_OPENAI_ENDPOINT     = 'https://<resource>.services.ai.azure.com/openai/v1'   # the Foundry image deployment, as in .env
$env:AZURE_IMAGE_DEPLOYMENT    = '<image deployment name>'                   # no key: the app signs in with its identity (step 5)
$env:SQL_CLIENT_IP             = (Invoke-RestMethod https://api.ipify.org)   # lets you run step 5 from this machine
$env:GHCR_USERNAME             = 'otressler'                                 # private package only
$env:GHCR_TOKEN                = '<classic PAT with read:packages>'          # private package only

pwsh infra/deploy.ps1 -ResourceGroup rg-ot-oreanasoffice-prod-001 -WhatIf   # preview
pwsh infra/deploy.ps1 -ResourceGroup rg-ot-oreanasoffice-prod-001
```

`deploy.ps1` first reads `.env.prod` if it exists (`-EnvFile <path>` for another file), without overwriting variables already set in the shell, and lists the names it took from the file (never the values). An empty line like `GHCR_TOKEN=` counts as not set. It then runs `az deployment group create --name main --resource-group rg-ot-oreanasoffice-prod-001 --parameters infra/main.bicepparam`. If the app already exists, it first sets `CONTAINER_IMAGE` to the image that's live now. **Always deploy with the script**, or set `CONTAINER_IMAGE` yourself. Otherwise a re-deploy switches the app back to the placeholder image (`mcr.microsoft.com/dotnet/samples:aspnetapp`, a public sample that listens on 8080 like our app).

Keep the outputs. You need `appUrl`, `sqlServerFqdn` and `appName` next. To see them again:

```powershell
az deployment group show --resource-group rg-ot-oreanasoffice-prod-001 --name main --query properties.outputs
```

### 5. Give the app access to the database and the image model

Do this before the real app is first deployed (step 7). The app applies its migrations on startup and can't reach the database before this.

```powershell
sqlcmd -S "<sqlServerFqdn>" -d OreanasOffice --authentication-method ActiveDirectoryDefault -i infra/sql/grant-app-access.sql
```

The last query should list `db_datareader`, `db_datawriter` and `db_ddladmin`. Alternative: open the database in the Azure portal → Query editor, sign in with Microsoft Entra, and paste the script.

The first connection may take up to a minute while the paused database resumes. If you don't need the firewall rule for your IP any more, run step 4 again without `SQL_CLIENT_IP`.

The app calls the Foundry image deployment with its managed identity, not an API key. The Foundry resource lives outside this resource group (`ot-mf-privateai` in `rg-ot-mpn-ai`), so the template doesn't assign the role; do it once by hand:

```powershell
$principal = az containerapp show --name oreanas-office --resource-group rg-ot-oreanasoffice-prod-001 --query identity.principalId --output tsv
$foundry   = az cognitiveservices account show --name ot-mf-privateai --resource-group rg-ot-mpn-ai --query id --output tsv
az role assignment create --assignee-object-id $principal --assignee-principal-type ServicePrincipal `
    --role "Cognitive Services OpenAI User" --scope $foundry
```

The role can take a few minutes to apply. Until then, generating a background fails with 401 or 403 from the image model.

### 6. Let GitHub Actions deploy (OIDC, no stored Azure secret)

```powershell
$rg       = 'rg-ot-oreanasoffice-prod-001'
$clientId = az ad app create --display-name oreanas-office-github --query appId --output tsv
$spId     = az ad sp create --id $clientId --query id --output tsv

@'
{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:otressler@19148386/oreanas-office@1413688368:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}
'@ | Set-Content federated-credential.json
az ad app federated-credential create --id $clientId --parameters federated-credential.json
Remove-Item federated-credential.json

# Least privilege: Contributor on the container app and its environment, not on the resource group.
# Updating an app also needs the environment's "join" permission, which Reader doesn't include.
$appResourceId = az containerapp show --name oreanas-office --resource-group $rg --query id --output tsv
$envResourceId = az containerapp env show --name cae-oreanas --resource-group $rg --query id --output tsv
foreach ($scope in $appResourceId, $envResourceId) {
    az role assignment create --assignee-object-id $spId --assignee-principal-type ServicePrincipal `
        --role Contributor --scope $scope
}
```

GitHub puts the owner's and the repository's numeric IDs into the token's subject (`otressler@19148386`, `oreanas-office@1413688368`), so a deleted and recreated repository with the same name can't deploy. The subject has to match character for character. If a login fails with `AADSTS700213`, the `azure/login` step prints the subject it presented; put that into the credential.

This identity can change the container app (its image, settings, secrets) and its Container Apps environment, and nothing else. It can't read the database, the storage account or other resources.

### 7. Set the repository variables

With the [GitHub CLI](https://cli.github.com/), from the repository folder:

```powershell
gh variable set AZURE_CLIENT_ID       --body $clientId
gh variable set AZURE_TENANT_ID       --body (az account show --query tenantId --output tsv)
gh variable set AZURE_SUBSCRIPTION_ID --body (az account show --query id --output tsv)
gh variable set AZURE_RESOURCE_GROUP  --body rg-ot-oreanasoffice-prod-001
gh variable set AZURE_CONTAINER_APP   --body oreanas-office
gh variable set DEPLOY_ENABLED        --body true
```

Or set them in GitHub under Settings → Secrets and variables → Actions → Variables. None of them are secret. The next push to `main` builds the image, pushes it to `ghcr.io/otressler/oreanas-office` (tagged with the commit SHA and `latest`) and switches the app to it. To pause deployments, set `DEPLOY_ENABLED` to `false`.

### 8. Custom domain

The app answers at `https://oreanas-office.otressler.de` (`customDomainName` in `main.bicepparam`). Azure only serves a host name it knows, so this needs DNS records at INWX and a deployment.

**On a brand-new setup**, the environment and its default host name don't exist before the first deployment. Comment out `customDomainName` for the first `deploy.ps1` run in step 4, then come back here.

Read the two values from Azure:

```powershell
$rg = 'rg-ot-oreanasoffice-prod-001'
az containerapp show --name oreanas-office --resource-group $rg --query properties.configuration.ingress.fqdn --output tsv
az containerapp env show --name cae-oreanas --resource-group $rg --query properties.customDomainConfiguration.customDomainVerificationId --output tsv
```

Create these records for `otressler.de` at INWX:

| Type | Name | Value |
|------|------|-------|
| CNAME | `oreanas-office` | the app's default host name (first command) |
| TXT | `asuid.oreanas-office` | the verification ID (second command) |

The template validates the certificate through the CNAME, which is Microsoft's recommended setup for a subdomain. An A record to the environment's IP would need HTTP validation instead. Check that both resolve (`Resolve-DnsName oreanas-office.otressler.de`, `Resolve-DnsName asuid.oreanas-office.otressler.de -Type TXT`), then deploy:

```powershell
pwsh infra/deploy.ps1 -ResourceGroup rg-ot-oreanasoffice-prod-001
```

If the certificate doesn't exist yet, `deploy.ps1` deploys twice: the first run adds the host name and waits while Azure issues the certificate (a few minutes), the second binds it. Later runs bind it directly. The Azure address keeps working alongside the custom domain.

## Checks after deploying

```powershell
$rg = 'rg-ot-oreanasoffice-prod-001'

# The app answers (the first request after a pause can take up to a minute)
Invoke-WebRequest "<appUrl>/api/health" -SkipHttpErrorCheck | Select-Object StatusCode, Content

# Scale: should be min 0, max 1
az containerapp show --name oreanas-office --resource-group $rg --query properties.template.scale

# Scale to zero: about 5 minutes after the last request (and with no app tab open), no replicas are listed
az containerapp replica list --name oreanas-office --resource-group $rg --output table

# Free SQL offer: useFreeLimit true, BillOverUsage, auto-pause 60
$sql = az sql server list --resource-group $rg --query [0].name --output tsv
az sql db show --resource-group $rg --server $sql --name OreanasOffice `
    --query "{free:useFreeLimit, whenUsedUp:freeLimitExhaustionBehavior, autoPauseMinutes:autoPauseDelay, sku:currentSku.name, status:status}"

# Budgets: budget-10 and budget-30
az consumption budget list --resource-group $rg --output table

# Custom domain: bindingType SniEnabled, certificate Succeeded
az containerapp show --name oreanas-office --resource-group $rg --query properties.configuration.ingress.customDomains
az containerapp env certificate list --name cae-oreanas --resource-group $rg --managed-certificates-only `
    --query "[].{name:name, subject:properties.subjectName, state:properties.provisioningState}" --output table
```

In the portal: the database's Overview shows "Free monthly vCore amount" and its status (Online or Paused). Cost Management → Budgets shows both budgets. The container app's Metrics → Replica count should drop to 0 between sessions.

## Known caveats

- **Two regions.** The app in Amsterdam talks to the database in Frankfurt: a few milliseconds more per query, and data transfer between the regions at about $0.02/GB (cents at most). To bring the app back to Frankfurt later, delete the container app and its environment, set `appLocation` to `germanywestcentral` (or remove it) and deploy again. The app then gets a new identity, see "Recreating the container app" below.
- **Budgets only cover this resource group.** If the Foundry image model lives in another resource group, its costs don't count towards these budgets. Budgets only alert and never stop anything, and Azure's cost data lags by up to a day.
- **Cold start.** The first request after a quiet period starts the container (seconds) and resumes the database (up to about a minute). `/api/health` answers 503 during that time. This is why no probe points at it: the template keeps Container Apps' default TCP probes.
- **Scale to zero needs quiet.** Any open connection or periodic request keeps the container running and the database awake. Close SQL tools (SSMS, the portal query editor) when you're done, or they keep the database from pausing.
- **"Continue with charges" can't be undone.** A free database set to bill over its allowance can't be switched back to "pause until next month".
- **Free SQL databases**: up to 10 per subscription, all in one region. A deleted free database frees its slot after up to an hour.
- **Re-deploying** without `deploy.ps1` (or without `CONTAINER_IMAGE`) rolls the app back to the placeholder image. Re-run CI or deploy with the script.
- **Don't run `deploy.ps1` while CI deploys.** The script reads the live image when it starts. If CI switches to a new image during the run, the script puts the older one back (this happened on 2026-10-11). Wait until the CI run on `main` has finished, or re-run its `deploy` job afterwards.
- **Custom domain and manual deployments.** `main.bicepparam` binds the certificate only when `CUSTOM_DOMAIN_CERTIFICATE_EXISTS` is `true`, which `deploy.ps1` sets. A manual `az deployment group create` without it unbinds the certificate, and the custom domain stops serving HTTPS until the next `deploy.ps1` run.
- **Recreating the environment** gives it a new default host name and verification ID, and deletes the certificate. Update the CNAME and TXT records (step 8) before deploying again.
- **Recreating the container app** gives it a new identity. Re-run `grant-app-access.sql` (after `DROP USER [oreanas-office];`), the Foundry role assignment in step 5 and the role assignment in step 6.
- **Budget start date** defaults to the first of the month you deploy in. If a later re-deploy is rejected because the start date changed, pass the original one: `az deployment group create --name main --resource-group rg-ot-oreanasoffice-prod-001 --parameters infra/main.bicepparam --parameters budgetStartDate=2026-10-01` (with `CONTAINER_IMAGE` set to the live image).
- **Storage without shared keys.** The portal's storage browser needs Microsoft Entra sign-in and a data role for you (for example Storage Blob Data Reader). You don't need it for normal use.
- **Log cap.** If logs ever reach 0.1 GB in a day, ingestion stops until the next day. That's deliberate; raise `logDailyQuotaGb` if you need more while debugging.
- **The GitHub token from step 3 expires.** After that, new revisions can't pull the image. Create a new token and run step 4 again.
- **ghcr.io is free today.** GitHub says it will announce billing at least a month in advance. A public package stays free either way.

## Configuration the app gets

| Environment variable | Value |
|----------------------|-------|
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ConnectionStrings__Database` | `Server=tcp:<server>.database.windows.net,1433;Database=OreanasOffice;Authentication=Active Directory Managed Identity;Encrypt=True;TrustServerCertificate=False;Connect Timeout=30` (no password) |
| `Storage__BlobServiceUri` | `https://<account>.blob.core.windows.net/` (the app creates the `dataprotection` container if it's missing) |
| `Authentication__Google__ClientId` | The Google OAuth client id. Its redirect URIs must include `https://oreanas-office.otressler.de/api/auth/google/callback` |
| `Authentication__Google__ClientSecret` | Reference to the Container Apps secret `google-client-secret` |
| `Admin__Email` | The site admin's Google address ([auth](../knowledge/decisions/auth.md)) |
| `Images__Endpoint` | The Foundry deployment's OpenAI v1 endpoint, `https://<resource>.services.ai.azure.com/openai/v1` |
| `Images__Deployment` | The image deployment's name, sent as `model` |

`ConnectionStrings__Storage`, `Images__ApiKey` and `AZURE_CLIENT_ID` are deliberately not set. The app uses `DefaultAzureCredential` with the system-assigned identity for SQL, Blob Storage and Foundry.
