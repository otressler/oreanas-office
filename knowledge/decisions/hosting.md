---
type: Decision
title: Hosting
description: Production-only, scale-to-zero hosting on Azure Container Apps with the free Azure SQL offer — a few dollars a month for two 12-hour sessions.
tags: [decision, hosting, cost, architecture]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T20:10:00Z }
sources:
  - id: aca-price
    resource: https://azure.microsoft.com/en-us/pricing/details/container-apps/
    title: Azure Container Apps pricing
  - id: aca-billing
    resource: https://learn.microsoft.com/en-us/azure/container-apps/billing
    title: Billing in Azure Container Apps
  - id: sql-free
    resource: https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer?view=azuresql
    title: Azure SQL Database free offer
  - id: appservice-price
    resource: https://azure.microsoft.com/en-us/pricing/details/app-service/linux/
    title: Azure App Service on Linux pricing
  - id: pg-price
    resource: https://azure.microsoft.com/pricing/details/postgresql/flexible-server/
    title: Azure Database for PostgreSQL flexible server pricing
  - id: hetzner-2026
    resource: https://privatedevops.com/news/hetzner-june-2026-cloud-price-increase-what-to-do
    title: Hetzner cloud price change, June 2026
---

# Constraints (set by the project owner)

- Hosting costs about **$30 a month** or less.
- There is **only a production environment**. Development happens locally.
- Users sign in with a **local account or Google** ([auth](/decisions/auth.md)).
- **No permanent uptime needed.** Expected use is two 12-hour sessions a month, plus some prep time. Prep may happen offline in a PWA that syncs on demand ([offline prep](/decisions/offline-prep-pwa.md)).

# Proposal: scale to zero

| Part | Service | Cost per month |
|------|---------|----------------|
| App: web, API, WebSockets, image job queue | **Azure Container Apps**, Consumption plan, 0–1 replicas | $0 within the free grant[^aca-price] |
| Database | **Azure SQL Database free offer** (serverless, pauses when idle) | $0 within the free allowance[^sql-free] |
| Images | Blob Storage (hot, locally redundant) | under $1 |
| Container images | GitHub Container Registry | $0 (avoids Azure Container Registry, about $5/month) |
| **Hosting total** | | **about $1–2** |

Image generation on Microsoft Foundry is paid per image and isn't part of hosting. It's covered by the [image budget](/decisions/image-budget.md) decision.

**Why it fits:**

- The free grant is 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests per month.[^aca-price] At 0.5 vCPU and 1 GiB, 24 hours of play plus 10 hours of prep uses about 61,000 vCPU-seconds and 122,000 GiB-seconds. That's about a third of the grant.
- At zero replicas, no compute is billed.[^aca-billing] Between sessions the app costs nothing but storage.
- The free database allowance (100,000 vCore-seconds) covers about 55 active hours at 0.5 vCore, and the expected use is about 34.[^sql-free]
- Everything stays in the same Azure subscription as the Foundry image model.

# Rules that come with scale-to-zero

- **Max replicas = 1.** Realtime sync runs in-process with the board state in memory ([realtime sync](/decisions/realtime-sync.md)). Min replicas = 0.
- **Cold start.** The first request after a quiet period starts the container (seconds) and resumes the database (can take up to about a minute). The app shell is cached by the PWA, so it opens instantly and shows "Waking up the table…" until the server answers. Tip for the DM: open the session a few minutes before the group arrives.
- **Nothing important lives only in memory.** Every move is saved to the database, and the board is reloaded from it on start.
- **The image job queue lives in the database** (asset rows with `status: queued`), not in memory. Jobs left over when the container stops resume on the next start ([asset](/domain/asset.md)).
- **Sign-in survives restarts.** Cookie and token signing keys are stored persistently (for example ASP.NET Core Data Protection keys in Blob Storage). Otherwise everyone is logged out after every cold start.
- **Nothing keeps it awake by accident.** No timers that poll the database. Clients close their WebSocket when the app goes to the background, and the server drops connections idle for 30 minutes, so a forgotten phone tab doesn't keep the container running.
- **The free database limit** is set to "continue with charges" rather than the default of pausing until next month.[^sql-free] A busy month then costs a few cents more instead of taking the app offline.

# Alternatives considered

| Option | Cost per month | Why not |
|--------|----------------|---------|
| App Service B1 + free Azure SQL | about $13[^appservice-price] | Bills around the clock, even when the app is stopped. Fine, but pays for uptime we don't need |
| App Service B1 + PostgreSQL flexible server B1ms | about $30[^pg-price] | Uses the whole budget for idle servers |
| Small VPS, e.g. Hetzner CX23, with Docker Compose | about €5–6[^hetzner-2026] | Cheap and has no cold start, but you patch the OS, run backups and watch uptime yourself |

# Production setup

- One resource group in one region close to the players.
- A Container Apps environment on the Consumption plan only. Don't add dedicated workload profiles, because they bill even when idle.
- Keep logs small. Log Analytics charges per GB ingested, so log warnings and errors, not every request.
- Secrets (Foundry key, Google client secret, database connection) are Container Apps secrets, never committed. Use a managed identity for Blob and SQL where the stack supports it.
- Deploy from the local machine or GitHub Actions: build the image, push it to GitHub Container Registry, update the container app.
- Backups: Azure SQL point-in-time restore is included in the free offer. Turn on soft delete for Blob Storage.
- Set an **Azure budget alert at $30**, and a second one at $10 as an early warning.

# Local development

- Run the app on the developer's machine; containers are optional locally.
- Database: a local SQL Server container or SQL Server Express/LocalDB on Windows.
- Blob Storage: the Azurite emulator.
- Image generation calls the real Foundry deployment; there's no local substitute.
- Google sign-in needs a `localhost` redirect URI on the OAuth client.

# Decision

The project owner chose Azure hosting on 2026-10-10. This led to the .NET backend in the [tech stack](/decisions/tech-stack.md).

[^aca-price]: Azure Container Apps pricing
[^aca-billing]: Billing in Azure Container Apps
[^sql-free]: Azure SQL Database free offer
[^appservice-price]: Azure App Service on Linux pricing
[^pg-price]: Azure Database for PostgreSQL flexible server pricing
[^hetzner-2026]: Hetzner cloud price change, June 2026
