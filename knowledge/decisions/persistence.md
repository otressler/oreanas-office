---
type: Decision
title: Persistence
description: Azure SQL Database (free offer) for entities, map layout as a JSON document, images in Blob Storage.
tags: [decision, architecture, data]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-11T14:22:38Z }
---

# Decision (accepted by the project owner)

- **Azure SQL Database, free offer** for the entities in the [data model](/domain/data-model.md), accessed with EF Core ([tech stack](/decisions/tech-stack.md)). The [hosting](/decisions/hosting.md) decision explains the cost and the pause behaviour. Locally, use SQL Server in a container or SQL Server Express/LocalDB.
- **Map layout as one JSON document** on the [battle map](/domain/battle-map.md), stored in a text column, not one row per cell. The editor loads and saves the whole layout at once, and a 40×40 map is only 1,600 cells.
- **Token positions as normal rows** ([token](/domain/token.md)), because they change on every move and are synced live.
- **Images in Azure Blob Storage**, with only their blob names in the database ([asset](/domain/asset.md)). Use Azurite locally.

# How images reach the browser

Decided by the project owner on 2026-10-14 (stage 7, question 14 in the [implementation plan](/implementation-plan.md)): **through the app**, not from a public container or with short-lived signed links.

- The blob container is private. The app serves each image at `/api/assets/{id}`.
- Only signed-in members of a campaign that uses the image may load it: a campaign with a map that picked it or has it as a version, or an encounter that saved it at its start. A map copied from the store shares its source's image, so members of both campaigns may load it ([battle map](/domain/battle-map.md)).
- Images never change once made, so the answer lets the browser cache them for good. The service worker caches images by this address, so the board shows them again without a download.
- Signed links were rejected because they get a new address every time, so neither the browser nor the service worker could cache them. The board needs the server awake for live play anyway, so serving images through it costs nothing extra.

# Depends on

[Hosting](/decisions/hosting.md) and [tech stack](/decisions/tech-stack.md). If the project switches to the VPS option in the hosting decision, PostgreSQL or SQLite on the server replaces Azure SQL, and the rest stays the same.
