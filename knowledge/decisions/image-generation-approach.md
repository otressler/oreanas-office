---
type: Decision
title: Image generation approach
description: The grid is the source of truth; AI paints the background from a colour-coded guide image.
tags: [decision, ai, images]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:45:00Z }
---

# Problem

Image models don't follow exact grid positions. Asking for "a bridge across cells 7–9 of row 3" gives a bridge somewhere near there. A battle map needs the walls, water and bridge in exactly the cells the game uses.

# Decision (accepted by the project owner on 2026-10-14, after the T0 run)

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

# Confirmed

Phase 0 of the [roadmap](/roadmap.md) tried the model on the four sample layouts, and the project owner accepted the results on 2026-10-14 (T0 run below). Images are generated at high quality ([image budget](/decisions/image-budget.md)).

# Phase 0 findings so far

The project owner picked `gpt-image-2.5-flare` on Microsoft Foundry for the spike. First tests on 2026-10-10:

- Both text-to-image (`/images/generations`) and image-to-image from a guide (`/images/edits`) work through the OpenAI-compatible v1 API.
- **Sizes:** both edges divisible by 16, longest edge ≤ 3840, aspect ratio ≤ 3:1, at most 3840×2160 pixels. That makes exact grid-sized output possible.
- **Rate limit:** 2 requests per minute, and rejected requests count. One image takes about 20–25 s, so a "regenerate" queue has to be server-side and serialised.
- **Alignment:** a 15×10 guide with a stepped river, a bridge and wall rectangles came back with every region in its cells. The model dressed up the solid wall border as grass on three edges, so edge regions need to be named in the prompt.
- **Transparent backgrounds** work, which [token icons](/features/token-icons.md) need.

The `image-assets` Claude Code skill (`.claude/skills/image-assets/`) holds the client script, guide renderer and prompt templates used for these tests.

# T0 run on the sample maps (2026-10-14)

All four stage 3 sample maps were generated at medium quality, the default the [image budget](/decisions/image-budget.md) sets. The prompts were built only from what the app's prompt builder will have: scene, vibe, lighting, the guide's legend, and each feature's kind, label and elevation. Nothing was added by hand. Results and review sheets are in `assets/generated/maps/<map>/`.

| Map | Grid | Image | Result |
|-----|------|-------|--------|
| Gorge crossing | 20×12 | 1280×768, 64 px cells | Lines up. The gorge, the bridge, the menhir and the path to the edge sit in their cells |
| River ford | 36×12 (3:1) | 1728×576, 48 px cells | Lines up. River, ford, wagon and both willows in place; the void corners became misty cliff tops |
| Open field | 40×38 | 1280×1216, 32 px cells | Lines up. Pond, ruined farmhouse walls, the well and the trees in place. The model added the hill under the stone circle from the scene text, although the guide has no height |
| Crypt | 24×16 | 1536×1024, 64 px cells | Rooms, corridors, doors, altar, pillars and stairs line up. The solid area between the corridors keeps coming out as a flooded chamber (see below) |

**Time:** 17–22 s per image, plus waits for the rate limit.

**Fixes made to the guide and prompt during the run.** These are generic, so the stage 7 port takes them over:

- The guide's flat colours showed through: purple void and magenta entrances stayed visible in the crypt. The prompt now says no trace of the purple or magenta may remain, and the entrance legend asks for the path, doorway or stairs that leads away. Fixed in v2.
- Void was painted as water or floor. The void legend now says nobody can stand there and it is never open water or walkable floor.
- Void cells enclosed by the map (not connected to the edge through other void) are drawn as wall in the guide, like the rock between a dungeon's corridors.
- Later, at the stage 7 gate, the project owner still saw artifacts in the signal colours. The prompt now says to ignore the input image's colours, which are only a code, and to take every colour from the scene, mood and lighting. It also names the signal colours that guide uses (every legend colour except grey, black, blue, brown, dark brown and dark green, which real materials have anyway) and forbids them even as a tint, glow, haze, light or stain.
- The legend names each feature's kind next to its label (`door ("Tür")`), so German labels still tell the model what the object is.

**Still open:** in the crypt, the large enclosed area between the corridors came out as a pool in v1, a room with a pool in v2, and a flooded cavern with broken pillars in v3, even when drawn as wall. The layout still decides the game, so tokens can't enter it, but it looks like a place to go. The scene text ("a flooded crypt") probably pushes the model there. A plain-stone wording for black areas, or the DM's own scene text, may fix it.

**High quality fixed the crypt.** v4 used the v3 guide and prompt unchanged, at `high` instead of `medium`: the enclosed area came out as dark rock, and everything else still lines up. The model painted shallow water over most floors, which fits "flooded crypt"; the pool still stands out as deeper water. A faint purple haze stays in the void outside the map. It took 25 s. One sample doesn't show whether high is reliably better, only that it fixed the case medium failed three times.

**File size:** the PNGs are 2–3.4 MB. Stage 7 asks the model for JPEG output, so phones load a few hundred kilobytes rather than megabytes. WebP would be smaller, but the edits endpoint refuses it (only PNG and JPEG work there).
