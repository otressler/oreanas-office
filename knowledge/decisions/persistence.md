---
type: Decision
title: Persistence
description: Relational database for entities, map layout as a JSON document, images in blob storage.
tags: [decision, architecture, data]
decision: proposed
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Proposal

- **Relational database** for the entities in the [data model](/domain/data-model.md). Which engine depends on the [tech stack](/decisions/tech-stack.md) and hosting.
- **Map layout as one JSON document** on the [battle map](/domain/battle-map.md), not one row per cell. The editor loads and saves the whole layout at once, and a 40×40 map is only 1,600 cells.
- **Token positions as normal rows** ([token](/domain/token.md)), because they change on every move and are synced live.
- **Images in blob storage** (for example Azure Blob Storage), with only their URLs in the database ([asset](/domain/asset.md)).

# Depends on

[Tech stack](/decisions/tech-stack.md).
