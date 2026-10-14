---
type: Feature
title: DM map editor
description: Set the grid, paint terrain, place features, elevation, entrances and creatures, and describe the scene.
tags: [feature, dm, editor]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T20:30:00Z }
sources:
  - id: brief
    resource: /references/original-brief.md
    title: Original project brief
---

# Goal

Let the DM build a fight quickly. This is not a full level editor: the DM places only what matters, and the AI provides the looks.[^brief]

# Requirements

1. Create a [battle map](/domain/battle-map.md) with a chosen grid size N×M, up to 40×40. The size can change later: rows and columns are added or removed at any edge. New cells are `void`, and features and entrances that end up outside the grid are removed (undo brings them back).
2. Paint terrain per cell with a brush: walkable floor, difficult terrain, water, wall, or `void` (not part of the map). Tools: single cell, rectangle, fill.
3. Place important objects ("features") with a rectangular footprint: bridge, pillar, door, stairs and so on. Each has a label, an elevation and a "blocks movement" switch. Features stay inside the grid and don't overlap each other, but may lie over `void` or walls ([battle map](/domain/battle-map.md)).
4. Set height levels: paint elevation (in meters) onto cells, and give features their own elevation (a bridge above a gorge).
5. Mark entrances and exits on cells at the outer edge of the grid that a token may stand on.
6. Describe the scene, vibe and lighting in free text.
7. Add creatures: pick a [creature type](/domain/creature-type.md), or create one on the spot, then click cells to place [tokens](/domain/token.md). Labels number themselves ("Goblin 1", "Goblin 2").
8. Start [AI map generation](/features/ai-map-generation.md), compare versions and pick a background.
9. Save as an [encounter](/domain/encounter.md) for a later session.
10. Work offline: everything except image generation works without a connection and syncs on demand ([offline prep](/decisions/offline-prep-pwa.md)).
11. A map list per campaign: open a map to edit it later, duplicate it to adjust a copy, archive it, or bring an archived map back. Maps are never deleted ([battle map](/domain/battle-map.md)).
12. A map store: add a copy of a map from another campaign ([battle map](/domain/battle-map.md)).
13. Import and export of the map file stays as a tool. An import is created on the server and reaches the editor with the next sync ([battle map](/domain/battle-map.md)).

# Notes

- Characters aren't placed in the editor. The session DM places them when starting the [encounter](/domain/encounter.md), once it's known who plays.
- Works on a laptop first. DMs prepare at a desk, and phone editing isn't needed. Below about 1024 px of width the editor isn't offered: the page says "Der Karteneditor ist für Laptops gedacht" and shows the map list without editing (decided by the project owner on 2026-10-14).
- The map is playable even before an image exists, using the plain layout rendering.

[^brief]: Original project brief
