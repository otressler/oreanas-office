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

# As built (stage 5)

Built on `stage/5-offline-map-editor`. The project owner accepted the choices below on 2026-10-14: imports that break layout rules, entrance cells left inside by a resize, the "blocks movement" presets, the "Nur auf diesem Gerät" mark, and the offline link shown to everyone signed in on the device.

- **Pages.** `/kampagnen/:id/karten` lists the campaign's maps in this browser, `/kampagnen/:id/karten/:mapId` is the editor, and `/karten` lists the DM's campaigns from the offline copy. The offline and waking screens link to `/karten`, and the campaign page links to its maps.
- **Tools and keys.** Terrain: brush `B`, rectangle `R`, fill `F`, with digits 1–5 for Boden, Schwieriges Gelände, Wasser, Wand and Leer (void). Elevation: brush `H` and rectangle, with quick values −3, −1,5, 0, +1,5 and +3; cell heights show as labels while an elevation tool is active. Alt+click takes the terrain or height of a cell. Features: select `V`, place `O`; entrances: `E`. Undo is Ctrl+Z, redo Ctrl+Shift+Z or Ctrl+Y. The right or middle mouse button, or Space, pans; the wheel zooms.
- **Offline link.** The offline and waking screens offer "Karten ohne Verbindung bearbeiten" to anyone remembered on the device; players find an empty list there.
- **Suggested feature kinds** preset "blocks movement": Brücke, Tür, Treppe, Leiter and Podest don't block; Säule, Baum, Felsen, Kiste, Fass, Tisch, Altar, Brunnen, Wagen and Statue do. The DM can change it.
- **Prüfung.** A side panel lists every layout rule break ([battle map](/domain/battle-map.md)); clicking one selects the item. The rules are written as shared test cases in `src/web/src/editor/validation.cases.json` for the server's checks in stage 6.
- **Resize** keeps entrance cells that are no longer on the edge; the Prüfung panel flags them.
- **Preview.** The map as the board draws it, with a test token of a chosen size that may stand only where the stage 4 target check allows. Nothing is saved.
- **Saving.** Every change is saved in the browser about 0.4 s after the last edit, and at once when the page hides or the editor closes. The header says "Auf diesem Gerät gespeichert"; maps show "Nur auf diesem Gerät" until stage 6 syncs them.
- **Map files.** The editor exports the map in the import-file format (without creatures). The map list imports such a file as a new map in the browser; a file that breaks layout rules is still imported, and the list says how many problems the Prüfung panel shows.

[^brief]: Original project brief
