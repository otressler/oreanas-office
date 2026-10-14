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

See [image generation approach](/decisions/image-generation-approach.md) for the reasoning.

[^brief]: Original project brief
