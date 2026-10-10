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
5. **Store** the result as an [asset](/domain/asset.md). "Regenerate" adds more versions, and the DM picks one.

Generation runs as a background job (expect 10–60 s). The editor stays usable while it runs.

# Rules

- The app draws the grid on top of the image; the model never draws it.
- If generation fails or the DM rejects every version, the board uses a simple textured rendering of the layout. A fight never depends on the AI.

# Open questions

- Whether `gpt-image-2.5-flare` lines up well enough on more layouts. Phase 0 of the [roadmap](/roadmap.md) answers this; first findings are in the [approach decision](/decisions/image-generation-approach.md).
- Spending limit per map ([image budget](/decisions/image-budget.md)).

See [image generation approach](/decisions/image-generation-approach.md) for the reasoning.

[^brief]: Original project brief
