---
type: Domain Entity
title: Asset
description: A generated or uploaded image — map background or token icon — with its prompt, model and status.
tags: [domain, images, ai]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `kind` | enum `map-background` \| `token-icon` | |
| `ownerType`, `ownerId` | string, id | The [battle map](/domain/battle-map.md), [creature type](/domain/creature-type.md) or [character](/domain/character.md) it belongs to |
| `origin` | enum `generated` \| `uploaded` | |
| `prompt` | text, nullable | The full prompt sent to the model |
| `model` | string, nullable | Model deployment used |
| `status` | enum `queued` \| `running` \| `done` \| `failed` | Generation runs as a background job |
| `url` | string, nullable | Location in blob storage ([persistence](/decisions/persistence.md)) |
| `createdAt` | timestamp | |

# Notes

A battle map can have several background assets: every "regenerate" adds one. `BattleMap.backgroundAssetId` points to the one the DM picked. Keeping the prompt and model makes it possible to repeat or tweak a result later.
