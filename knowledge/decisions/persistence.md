---
type: Decision
title: Persistence
description: Azure SQL Database (free offer) for entities, map layout as a JSON document, images in Blob Storage.
tags: [decision, architecture, data]
decision: proposed
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:45:10Z }
---

# Proposal

- **Azure SQL Database, free offer** for the entities in the [data model](/domain/data-model.md), accessed with EF Core ([tech stack](/decisions/tech-stack.md)). The [hosting](/decisions/hosting.md) decision explains the cost and the pause behaviour. Locally, use SQL Server in a container or SQL Server Express/LocalDB.
- **Map layout as one JSON document** on the [battle map](/domain/battle-map.md), stored in a text column, not one row per cell. The editor loads and saves the whole layout at once, and a 40×40 map is only 1,600 cells.
- **Token positions as normal rows** ([token](/domain/token.md)), because they change on every move and are synced live.
- **Images in Azure Blob Storage**, with only their URLs in the database ([asset](/domain/asset.md)). Use Azurite locally.

# Depends on

[Hosting](/decisions/hosting.md) and [tech stack](/decisions/tech-stack.md). If the project switches to the VPS option in the hosting decision, PostgreSQL or SQLite on the server replaces Azure SQL, and the rest stays the same.
