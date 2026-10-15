---
type: Domain Entity
title: Asset
description: A generated or uploaded image — map background or token icon — with its prompt, model and status.
tags: [domain, images, ai]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:45:10Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `kind` | enum `map-background` \| `token-icon` | |
| `ownerType`, `ownerId` | string, id | The [battle map](/domain/battle-map.md), [creature type](/domain/creature-type.md) or [character](/domain/character.md) it belongs to |
| `origin` | enum `generated` \| `uploaded` | |
| `prompt` | text, nullable | The full prompt sent to the model |
| `sourceAssetId` | → Asset, nullable | For a portrait restyled from an upload: the uploaded version sent to the model as the reference |
| `model` | string, nullable | Model deployment used |
| `status` | enum `queued` \| `running` \| `done` \| `failed` | Generation runs as a background job. These rows are the job queue, so queued jobs survive the container stopping ([hosting](/decisions/hosting.md)) |
| `blobName` | string, nullable | Where the image lies in the private blob container. The browser loads it from `/api/assets/{id}` ([persistence](/decisions/persistence.md)) |
| `gridWidth`, `gridHeight` | int, cells, nullable | For a map background: the map's size when the image was made. A background whose size no longer matches the map is outdated |
| `costUsd` | decimal, nullable | What the generation cost, counted against the monthly [image budget](/decisions/image-budget.md) |
| `createdAt` | timestamp | |

# Notes

A battle map can have several background assets: every "regenerate" adds one. `BattleMap.backgroundAssetId` points to the one the DM picked. Keeping the prompt and model makes it possible to repeat or tweak a result later.

A map copied from the store points to the same background asset as its source, so `ownerId` stays the map it was generated for. Regenerating on the copy makes a new asset owned by the copy ([battle map](/domain/battle-map.md)).

A creature type and a character also collect versions: generated, uploaded (already `done` when saved, with no prompt or cost) and restyled from an upload. `CreatureType.iconAssetId` and `Character.tokenAssetId` point to the picked one ([token icons](/features/token-icons.md)).

No job is ever queued automatically. A person starts every generation and confirms it first ([image budget](/decisions/image-budget.md)).
