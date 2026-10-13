---
type: Decision
title: Image generation approach
description: The grid is the source of truth; AI paints the background from a colour-coded guide image.
tags: [decision, ai, images]
decision: proposed
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:45:00Z }
---

# Problem

Image models don't follow exact grid positions. Asking for "a bridge across cells 7–9 of row 3" gives a bridge somewhere near there. A battle map needs the walls, water and bridge in exactly the cells the game uses.

# Proposal

1. **The layout data decides the game.** Movement, distance, walls and elevation come from the [battle map](/domain/battle-map.md) layout, never from the picture.
2. **The app draws the grid.** The model is told to draw no grid.
3. **Image-to-image from a guide.** Render the layout as a colour-coded top-down picture and send it with the scene/vibe prompt to a model that accepts an input image. This keeps the result much closer to the layout than text alone.
4. **Generate at the grid's exact size.** The current model accepts any size in 16 px steps (see below), so the guide is rendered at N×M cells times a cell size that is a multiple of 16, and the result needs no cropping. At 1536 px wide, a 30-cell map gets about 50 px per cell, which is fine on phones. Grids go up to 40×40 cells. A map wider than 3:1 (such as 40×10) is padded to 3:1: the guide marks the extra cells as `void`, and the prompt asks for dead terrain or darkness there. The padding lies outside the map, so it never affects play. A map that would go above 3840 px or 3840×2160 pixels gets a smaller cell size.
5. **Always have a fallback.** A plain textured rendering of the layout keeps every fight playable.
6. **Run it in the background** and keep every version as an [asset](/domain/asset.md).

# Alternatives considered

- **Text-only prompt:** too far from the layout.
- **Let the model draw the grid:** lines come out uneven and don't line up with the app's coordinates.
- **Hand-drawn or tile-based maps only:** reliable but loses the main appeal of the app.

# To confirm

Phase 0 of the [roadmap](/roadmap.md): try the model on 3–4 sample layouts and confirm the results line up well enough.

# Phase 0 findings so far

The project owner picked `gpt-image-2.5-flare` on Microsoft Foundry for the spike. First tests on 2026-10-10:

- Both text-to-image (`/images/generations`) and image-to-image from a guide (`/images/edits`) work through the OpenAI-compatible v1 API.
- **Sizes:** both edges divisible by 16, longest edge ≤ 3840, aspect ratio ≤ 3:1, at most 3840×2160 pixels. That makes exact grid-sized output possible.
- **Rate limit:** 2 requests per minute, and rejected requests count. One image takes about 20–25 s, so a "regenerate" queue has to be server-side and serialised.
- **Alignment:** a 15×10 guide with a stepped river, a bridge and wall rectangles came back with every region in its cells. The model dressed up the solid wall border as grass on three edges, so edge regions need to be named in the prompt.
- **Transparent backgrounds** work, which [token icons](/features/token-icons.md) need.

The `image-assets` Claude Code skill (`.claude/skills/image-assets/`) holds the client script, guide renderer and prompt templates used for these tests.
