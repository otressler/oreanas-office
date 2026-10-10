---
type: Roadmap
title: Roadmap
description: Build order for the battle map app, riskiest part first, with the campaign manager as a later stage.
tags: [planning]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Phases

| # | Phase | Goal | Done when |
|---|-------|------|-----------|
| 0 | Image generation spike | Prove that a Foundry image model can turn a layout into a usable top-down map ([approach](/decisions/image-generation-approach.md)) | 3–4 sample layouts give backgrounds that line up well enough with the grid |
| 1 | Playable board, no AI | Value at the table fast | A hand-made layout is playable on several phones at once, with live sync and distance preview ([playable map](/features/playable-map.md)) |
| 2 | DM editor | DMs build their own fights | The DM can create a map, paint terrain and place features, elevation, entrances and creatures ([DM map editor](/features/dm-map-editor.md)) |
| 3 | AI visuals | Maps and tokens look good | Backgrounds and creature icons are generated from the editor ([AI map generation](/features/ai-map-generation.md), [token icons](/features/token-icons.md)) |
| 4 | Table extras | Smoother fights | Ruler, area templates, pings, hidden tokens, HP and conditions |

# Later: campaign manager

Ideas for when the battle map app is solid. None of these are designed yet:

- Campaign lore: NPCs, places, factions
- Session notes
- Character details beyond what a token needs
- A shared table view for a TV or tablet

# Blocked by

Phase 1 needs the [tech stack](/decisions/tech-stack.md) decision. The [rules edition](/decisions/rules-edition.md) only sets the default diagonal rule, which is a setting, so it doesn't block anything.
