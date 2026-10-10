---
type: Domain Entity
title: Battle map
description: Grid layout (terrain, elevation, features, entrances), scene description and chosen background image.
tags: [domain, fight, map]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `campaignId` | → [Campaign](/domain/campaign.md) | |
| `name` | string | |
| `width`, `height` | int, cells | The N×M grid the DM chooses |
| `cellSizeFt` | int | 5 by default ([movement rules](/rules/movement-distance.md)) |
| `layout` | JSON document | See below. Stored as one document, not a table of cells ([persistence](/decisions/persistence.md)) |
| `scene` | text | What the place is: "rope bridge over a misty gorge" |
| `vibe` | text | Mood: "tense, overcast, wind" |
| `lighting` | text | e.g. "dusk", "torchlight" |
| `backgroundAssetId` | → [Asset](/domain/asset.md), nullable | The chosen generated image. Other versions stay as assets |

# Layout document

```json
{
  "cells": [
    { "x": 0, "y": 0, "terrain": "floor", "elevation": 0 }
  ],
  "features": [
    { "id": "f1", "kind": "bridge", "label": "Rope bridge",
      "x": 7, "y": 3, "w": 3, "h": 1, "elevation": 0, "blocksMovement": false }
  ],
  "entrances": [
    { "id": "e1", "kind": "entrance", "label": "Forest path", "cells": [[0, 4], [0, 5]] }
  ]
}
```

- **`terrain`**: `void` (not part of the map) | `floor` | `difficult` | `water` | `wall`. The walkable area is everything that isn't `void` or `wall`.
- **`elevation`**: height in feet relative to the map's base level. Shown to players. How it affects movement is an open question in the [movement rules](/rules/movement-distance.md).
- **`features`**: the few important objects (bridge, pillar, door, stairs…). `kind` is free text, which also feeds the image prompt. The footprint is a rectangle in cells.
- **`entrances`**: `entrance` | `exit` | `both`, on edge cells.

# Notes

The layout is the source of truth for the game. The background image is decoration ([image generation approach](/decisions/image-generation-approach.md)).
