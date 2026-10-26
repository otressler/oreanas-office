---
type: Feature
title: AI map generation
description: Turn a battle map layout plus scene text into a background image that fits the grid.
tags: [feature, dm, ai, images]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:45:00Z }
sources:
  - id: brief
    resource: /references/original-brief.md
    title: Original project brief
---

# Goal

The visuals come from an AI image model, for example one hosted on Microsoft Foundry.[^brief] The DM describes; the model paints.

# Flow

1. **Render a guide image** from the [battle map](/domain/battle-map.md) layout: top-down, colour-coded by terrain and feature (floor grey, water blue, wall black, bridge brown…), no grid lines.
2. **Build the prompt** from `scene`, `vibe`, `lighting`, the feature labels and a fixed style part ("top-down battle map, orthographic, no text, no grid").
3. **Call the model** with the guide image as input (image-to-image or edit), at exactly the guide's pixel size (N×M cells times a cell size in 16 px steps).
4. **Fit to the grid**: only needed when the map is too wide or too large for one image; then pad or tile.
5. **Store** the result as an [asset](/domain/asset.md). "Regenerate" adds more versions, and the DM picks one. Images are generated at high quality, and there is no limit per map, only the monthly one ([image budget](/decisions/image-budget.md)).

Generation runs as a background job (expect 10–60 s). The editor stays usable while it runs.

# Who and when

- Any `dm` member of the campaign generates backgrounds, the same people who edit maps.
- **Never automatically.** The DM presses the button and then confirms the job before it is queued, also after a resize has made the background outdated ([image budget](/decisions/image-budget.md)).
- **Sync first.** The server paints from its own copy of the map, so the editor syncs the map before queuing the job, as it does before starting an encounter ([offline prep](/decisions/offline-prep-pwa.md)). Offline, the editor says generation needs a connection.
- Changing the map's size makes its backgrounds outdated; other edits keep them ([battle map](/domain/battle-map.md), "Background image").

# Rules

- The app draws the grid on top of the image; the model never draws it.
- If generation fails or the DM rejects every version, the board uses a simple textured rendering of the layout. A fight never depends on the AI.

# As built (stage 7)

- **Editor:** "Hintergrund" in the toolbar's "Karte" group. The panel lists the versions newest first, with their state (in the queue, being painted, failed, outdated for another size, layout changed since), marks the picked one, and offers "Auswählen" and "Ohne Hintergrund". A larger view compares versions with the grid drawn over them. The confirm dialog names the sync, high quality, about half a minute, a few cents, and this month's spending against the limit; with the limit reached or no model configured it offers no confirm. Generating first saves edits the autosave hasn't written yet, then syncs the map.
- **First version picked by itself:** when a job finishes and the map has no background it can show (none picked, or the picked one outdated), the new one becomes the map's background. The DM can still pick another or none.
- **Jobs:** one worker runs them one at a time, at most one request every 30 seconds. A 429 waits as long as the model asks, up to ten times per job; other errors try again up to three attempts; a refused request fails at once as "rejected". A job cut off by a restart goes back to the queue at the next start. A map has at most one queued or running job.
- **Images:** JPEG at high quality, about 0.6 MB for a 20 × 12 map. The edits endpoint refuses WebP. Served at `/api/assets/{id}` and cached for good by the browser and the service worker; signing in or out clears the service worker's image cache.
- **Board:** with a picture loaded, the board draws only the picture, the grid, highlights and tokens; the picture paints terrain and objects itself. Until it loads, or if it fails, the plain rendering stays.
- **Live updates:** the editor connects to the image hub only while one of its map's jobs is queued or running.
- **Limits:** the monthly limit is checked when a job is queued. Jobs queued on several maps just before the limit can still finish, so the month can end a few cents over. A store copy shares its source's picked picture only while it stays picked: after the copy picks another version, the shared one is no longer listed.

# Uploads (2026-10-25)

At the project owner's request the DM can also upload their own background, for example a bought battle map, and the editor's placing tools fix the small misalignments of generated images ([DM map editor](/features/dm-map-editor.md), "Background").

- **Formats.** PNG, WebP or JPEG, up to 25 MB and 8192 pixels per edge. JPEG was added to the requested PNG and WebP because most bought maps are JPEGs. The app sends the file as the raw body with its type, like portrait uploads; a map only on the device is synced first.
- **Stored.** The server checks the bytes against the type, turns the picture the right way up, shrinks it so its long edge is at most 4096 pixels (never enlarged) and keeps it as WebP with its alpha channel, without the original's metadata. It is a new `uploaded` version of the map, picked at once. It costs nothing and isn't counted against the [image budget](/decisions/image-budget.md).
- **First placement.** As large as fits into the map it was uploaded for, centred, keeping its aspect. The DM then places it by hand or by two grid points.
- **Never outdated, never refined.** An upload fits every map size ([battle map](/domain/battle-map.md), "Background image"). It can't be refined, because the model paints from the layout and an upload wasn't made from it. The gallery marks it "Hochgeladen".
- **Grid style.** For a picture with its own grid, the map's grid can be drawn "Dezent" or "Aus" over it ([battle map](/domain/battle-map.md)).

See [image generation approach](/decisions/image-generation-approach.md) for the reasoning.

[^brief]: Original project brief
