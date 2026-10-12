---
type: Domain Entity
title: Battle map
description: Grid layout (terrain, elevation, features, entrances), scene description and chosen background image.
tags: [domain, fight, map]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T20:30:00Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `campaignId` | → [Campaign](/domain/campaign.md) | |
| `name` | string | |
| `width`, `height` | int, cells | The N×M grid the DM chooses. One cell is always 1.5 m ([movement rules](/rules/movement-distance.md)) |
| `layout` | JSON document | See below. Stored as one document, not a table of cells ([persistence](/decisions/persistence.md)) |
| `scene` | text | What the place is: "rope bridge over a misty gorge" |
| `vibe` | text | Mood: "tense, overcast, wind" |
| `lighting` | text | e.g. "dusk", "torchlight" |
| `backgroundAssetId` | → [Asset](/domain/asset.md), nullable | The chosen generated image. Other versions stay as assets |

# Layout document

```json
{
  "schemaVersion": 1,
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

- **`cells`**: each cell appears at most once. A cell missing from the list is `void`, so only the map's own cells need to be written down. Walls are part of the map and must be listed. `elevation` defaults to 0.
- **`terrain`**: `void` (not part of the map) | `floor` | `difficult` | `water` | `wall`. The walkable area is everything that isn't `void` or `wall`.
- **`elevation`**: height in meters (one decimal) relative to the map's base level. Unlike distances, it isn't tied to whole squares. Shown to players. How it affects movement is an open question in the [movement rules](/rules/movement-distance.md).
- **`features`**: the few important objects (bridge, pillar, door, stairs…). `kind` is free text, which also feeds the image prompt. The footprint is a rectangle in cells.
- **`schemaVersion`**: the layout format version. Older layouts are upgraded when loaded ([backward compatibility](/decisions/backward-compatibility.md)).
- **`entrances`**: `entrance` | `exit` | `both`, on edge cells.

# Import file

Until the [map editor](/features/dm-map-editor.md) exists, a `dm` member of the campaign imports a map as a JSON file, or picks one of the sample maps. One import creates the battle map, an [encounter](/domain/encounter.md) with the same name in status `ready`, its creature [tokens](/domain/token.md), and any [creature types](/domain/creature-type.md) the campaign doesn't have yet.

```json
{
  "name": "Gorge crossing",
  "width": 20, "height": 12,
  "scene": "rope bridge over a misty gorge", "vibe": "tense, windy", "lighting": "overcast morning",
  "layout": { "schemaVersion": 1, "cells": [], "features": [], "entrances": [] },
  "creatures": [
    { "type": "Goblin", "size": "small", "speedMeters": 9, "x": 3, "y": 4 }
  ]
}
```

- `width` and `height` are at most 40 cells for now ([implementation plan](/implementation-plan.md), question 10). A layout without `schemaVersion` is version 1.
- `creatures` is optional. `type` is matched by name against the campaign's creature types, ignoring case. An existing type keeps its size and speed. A new type is created from the first entry that names it, which must then give `size` and `speedMeters` (rounded down to whole squares like any speed input). An optional `label` replaces the automatic "Goblin 1".
- Creatures must stand on free walkable cells, as for [placement](/domain/encounter.md).
- A file that breaks any rule is rejected as a whole, with a German message that names the offending entry.

# Notes

The layout is the source of truth for the game. The background image is decoration ([image generation approach](/decisions/image-generation-approach.md)).
