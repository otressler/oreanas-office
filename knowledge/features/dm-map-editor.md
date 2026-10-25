---
type: Feature
title: DM map editor
description: Set the grid, paint terrain, place features, elevation, entrances and creatures, and describe the scene.
tags: [feature, dm, editor]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-14T18:35:54Z }
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
9. Save as an [encounter](/domain/encounter.md) in a planned session. The editor's "Neue Begegnung" asks which of the user's planned or running sessions it goes in ([session planning](/features/session-planning.md)).
10. Work offline: everything except image generation works without a connection and syncs on demand ([offline prep](/decisions/offline-prep-pwa.md)).
11. A map list per campaign: open a map to edit it later, duplicate it to adjust a copy, archive it, and bring an archived map back or delete it for good. Deleting takes the map's unplayed encounters along and isn't possible while a running or ended fight uses the map ([battle map](/domain/battle-map.md), "Deleting").
12. A map store: add a copy of a map from another campaign ([battle map](/domain/battle-map.md)).
13. Import and export of the map file stays as a tool. An import is created on the server and reaches the editor with the next sync ([battle map](/domain/battle-map.md)).

# Notes

- Characters aren't placed in the editor. The session DM places them when starting the [encounter](/domain/encounter.md), once it's known who plays.
- Works on a laptop first. DMs prepare at a desk, and phone editing isn't needed. Below about 1024 px of width the editor isn't offered: the page says "Der Karteneditor ist für Laptops gedacht" and shows the map list without editing (decided by the project owner on 2026-10-14).
- The map is playable even before an image exists, using the plain layout rendering.

# As built (stage 5)

Built on `stage/5-offline-map-editor`. The project owner accepted the choices below on 2026-10-14: imports that break layout rules, entrance cells left inside by a resize, the "blocks movement" presets, the "Nur auf diesem Gerät" mark, and the offline link shown to everyone signed in on the device.

- **Pages.** `/kampagnen/:id/karten` lists the campaign's maps in this browser, `/kampagnen/:id/karten/:mapId` is the editor, and `/karten` lists the DM's campaigns from the offline copy. The offline and waking screens link to `/karten`, and the campaign page links to its maps.
- **Tools and keys.** Terrain: brush `B`, rectangle `R`, fill `F`, with digits 1–5 for Boden, Schwieriges Gelände, Wasser, Wand and Leer (void). Elevation: brush `H` and rectangle, with quick values −3, −1,5, 0, +1,5 and +3; cell heights show as labels while an elevation tool is active. Alt+click takes the terrain or height of a cell. Features: select `V`, place `O`; entrances: `E`. In the entrance tool a click on an existing entrance selects it; the side panel then shows it below the settings for new entrances, to edit or delete, and Delete removes it (added at the stage 7 gate: before, entrances could only be deleted with the select tool). Undo is Ctrl+Z, redo Ctrl+Shift+Z or Ctrl+Y. The right or middle mouse button, or Space, pans; the wheel zooms.
- **Offline link.** The offline and waking screens offer "Karten ohne Verbindung bearbeiten" to anyone remembered on the device; players find an empty list there.
- **Suggested feature kinds** preset "blocks movement": Brücke, Tür, Treppe, Leiter and Podest don't block; Säule, Baum, Felsen, Kiste, Fass, Tisch, Altar, Brunnen, Wagen and Statue do. The DM can change it. Stage 6 adds more at the project owner's request: Tor, Falltür, Rampe, Steg, Teppich, Geröll and Gebüsch don't block; Mauerrest, Stalagmit, Baumstamm, Zelt, Lagerfeuer, Kohlenbecken, Kamin, Truhe, Regal, Bett, Bank, Theke, Thron, Sarkophag and Käfig do.
- **Prüfung.** Every layout rule break is listed ([battle map](/domain/battle-map.md)); clicking one selects the item. The rules are written as shared test cases in `src/web/src/editor/validation.cases.json` for the server's checks in stage 6. Since stage 6 the list opens from the status bar (see "Editor layout").
- **Resize** keeps entrance cells that are no longer on the edge; the Prüfung panel flags them.
- **Preview.** The map as the board draws it, with a test token of a chosen size that may stand only where the stage 4 target check allows. Nothing is saved.
- **Saving.** Every change is saved in the browser about 0.4 s after the last edit, and at once when the page hides or the editor closes. The status bar says "Auf diesem Gerät gespeichert"; maps show "Nur auf diesem Gerät" until stage 6 syncs them.
- **Map files.** The editor exports the map in the import-file format (without creatures). The map list imports such a file as a new map in the browser; a file that breaks layout rules is still imported, and the list says how many problems the Prüfung panel shows.

# Editor layout (stage 6)

The project owner found the stage 5 side panel incoherent: the active tool's panel sat above panels that were always there (name and scene texts, encounters, size, Prüfung), so the scene texts looked like part of the tool. Decided on 2026-10-14: each region of the editor has one job.

- **Starting from the campaign page (replaced):** since 2026-10-14 fights are added on the session page instead ([session planning](/features/session-planning.md)). Before that, the "Kämpfe" panel had "Neue Begegnung" next to "Karte importieren". It lists the campaign's maps on this device; picking one created a draft encounter on it and opened it in the editor, where the DM placed creatures, marked it ready and started it. On a narrow screen it said the editor needs a larger one. Added at the stage 7 gate: before, the campaign page offered only the import, which always makes a new map without a background, and the editor's "Begegnungen" menu was easy to miss.
- **Toolbar (left):** picks what you work on. Map mode has the terrain, elevation, feature and entrance tools, and a "Karte" group with "Beschreibung" (scene, vibe and lighting) and "Größe" (resize). Stage 7 added "Hintergrund" (background generation) to that group. Encounter mode has "Platzieren" and "Auswählen", and a "Begegnung" entry with "Bereit", starting and archiving. A read-only encounter has only that entry.
- **Side panel (right):** only the panel of what the toolbar picked, nothing else.
- **Object catalog:** the feature tool's panel shows what the next feature gets on top: kind (with its icon), label, elevation and "blocks movement". Below that is a catalog of the suggested kinds as cards with an icon, the name and "begehbar" or "blockiert", two per row, in five sections (Wege und Durchgänge, Natur, Bauwerke, Einrichtung und Lager, Feuer). A search filters the cards and ignores case and umlauts ("tur" finds Tür). A search without a match can be used as a kind of the DM's own, and the kind field above still takes free text. Picking a card sets its "blocks movement" preset. The select tool's panel keeps the plain kind field with the list.
- **Header:** what belongs to the whole map or encounter: the back link, the map's name as an editable field (the encounter's name in encounter mode, with its status and creature count), the sync status and "Sync" button, a "Begegnungen" menu with the map's encounters and "Neue Begegnung", export, undo and redo, and edit or preview. The menu's button carries a warning when a creature on one of the encounters no longer stands validly.
- **Status bar (bottom):** live information: the save state and the sync mark ("Nur auf diesem Gerät"), the cell under the pointer, and the number of layout problems. Clicking the number opens the Prüfung list; clicking a problem selects its item and closes the list.

[^brief]: Original project brief
