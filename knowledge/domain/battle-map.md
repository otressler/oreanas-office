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
| `width`, `height` | int, cells | The N×M grid the DM chooses, at most 40 each. One cell is always 1.5 m ([movement rules](/rules/movement-distance.md)) |
| `layout` | JSON document | See below. Stored as one document, not a table of cells ([persistence](/decisions/persistence.md)) |
| `scene` | text | What the place is: "rope bridge over a misty gorge" |
| `vibe` | text | Mood: "tense, overcast, wind" |
| `lighting` | text | e.g. "dusk", "torchlight" |
| `backgroundAssetId` | → [Asset](/domain/asset.md), nullable | The chosen generated image. Other versions stay as assets. Not shown while the image was made for a different size (see Background image) |
| `copiedFromMapId` | → Battle map, nullable | The map this one was duplicated or added from. Set once and never changed |
| `archivedAt` | timestamp, nullable | Set when a `dm` member archives the map |

# Map list, archive and store

- **Map list.** `dm` members of the campaign see its maps, open one to edit it, and duplicate or archive it. Players don't see the list.
- **Archive, never delete.** Only `dm` members archive a map, and they can bring it back from the archived maps in the list. An archived map can't be picked for a new encounter and isn't offered in other campaigns' stores. Encounters that already use it keep working. Archiving only sets a field, so it syncs like any other change ([offline prep](/decisions/offline-prep-pwa.md)).
- **Duplicate.** A copy in the same campaign, for a map that needs only small changes to be used again. It gets a new id and `copiedFromMapId`. Later changes to either map don't reach the other.
- **Store.** Maps from other campaigns. Adding one makes a copy in the campaign with `copiedFromMapId` set; the source stays as it is. The store leaves out the campaign's own maps, maps the campaign already has an unarchived copy of, and copies made from the campaign's own maps. If the campaign's copy is archived, the store still offers the map, and adding it brings the archived copy back instead of making a new one. For now every map that isn't archived is in the store, whoever made it; choosing which maps to publish is in the [backlog](/backlog.md). The store needs a connection.
- **What a copy takes:** name, size, layout, scene, vibe, lighting and the picked background image. The copy points to the same image [asset](/domain/asset.md) rather than a copy of the file; the copy's DMs can regenerate it for their own map. Other versions of the source's background don't come along. Encounters and their creatures aren't copied.

# Background image

- The DM generates backgrounds with [AI map generation](/features/ai-map-generation.md) and picks one version as `backgroundAssetId`. Picking needs a connection and isn't part of the map's sync item, so it never conflicts with offline edits and doesn't raise the map's version.
- **Changing the size makes the background outdated.** Every version made for another size is outdated: the board doesn't show it and uses the plain rendering instead, and the editor says a new image is needed. Nothing is generated automatically; the DM starts a new generation. Undoing the resize, back to the image's size, makes the image usable again.
- Other layout changes, such as a moved wall, keep the image. The editor notes that the layout changed since the image was made, so the DM can decide to regenerate.
- An encounter saves the picked background when it starts, together with its copy of the layout ([encounter](/domain/encounter.md)).

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
- **`features`**: the few important objects (bridge, pillar, door, stairs…). `kind` is free text, which also feeds the image prompt. The footprint is a rectangle in cells that lies inside the grid. Features don't overlap each other, but may lie over `void` or walls (a bridge over a gorge, a door in a wall).
- **`schemaVersion`**: the layout format version. Older layouts are upgraded when loaded ([backward compatibility](/decisions/backward-compatibility.md)).
- **`entrances`**: `entrance` | `exit` | `both`. Every cell lies on the outer edge of the grid and is one a token may stand on: walkable terrain, or the footprint of a feature that doesn't block movement.

# Import file

Until the [map editor](/features/dm-map-editor.md) exists, a `dm` member of the campaign imports a map as a JSON file, or picks one of the sample maps. One import creates the battle map, an [encounter](/domain/encounter.md) with the same name in status `ready`, its creature [tokens](/domain/token.md), and any [creature types](/domain/creature-type.md) the campaign doesn't have yet.

```json
{
  "name": "Gorge crossing",
  "width": 20, "height": 12,
  "scene": "rope bridge over a misty gorge", "vibe": "tense, windy", "lighting": "overcast morning",
  "layout": { "schemaVersion": 1, "cells": [], "features": [], "entrances": [] },
  "creatures": [
    { "type": "Goblin", "size": "small", "x": 3, "y": 4 }
  ]
}
```

- `width` and `height` are at most 40 cells for now ([implementation plan](/implementation-plan.md), question 10). A layout without `schemaVersion` is version 1.
- `creatures` is optional. `type` is matched by name against the campaign's creature types, ignoring case. An existing type keeps its size. A new type is created from the first entry that names it, which must then give `size`. A `speedMeters` field from older files is ignored. An optional `label` replaces the automatic "Goblin 1".
- Creatures must stand on free walkable cells, as for [placement](/domain/encounter.md).
- A file that breaks any rule is rejected as a whole, with a German message that names the offending entry.

# Notes

The layout is the source of truth for the game. The background image is decoration ([image generation approach](/decisions/image-generation-approach.md)).
