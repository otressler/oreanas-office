---
type: Roadmap
title: Roadmap
description: Build order for the battle map app, riskiest part first, with the campaign manager as a later stage.
tags: [planning]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T20:30:00Z }
---

# Phases

| # | Phase | Goal | Done when |
|---|-------|------|-----------|
| 0 | Image generation spike | Prove that a Foundry image model can turn a layout into a usable top-down map ([approach](/decisions/image-generation-approach.md)) | 3–4 sample layouts give backgrounds that line up well enough with the grid |
| 1 | Playable board, no AI | Value at the table fast | A hand-made layout is playable on several phones at once, with live sync and distance preview ([playable map](/features/playable-map.md)). Installable PWA, deployed to scale-to-zero production ([hosting](/decisions/hosting.md)) |
| 2 | DM editor | DMs build their own fights | The DM can create a map, paint terrain and place features, elevation, entrances and creatures, offline, then sync on demand ([DM map editor](/features/dm-map-editor.md), [offline prep](/decisions/offline-prep-pwa.md)) |
| 3 | AI visuals | Maps and tokens look good | Backgrounds and creature icons are generated from the editor ([AI map generation](/features/ai-map-generation.md), [token icons](/features/token-icons.md)) |
| 4 | Table extras | Smoother fights | Ruler, area templates, pings, hidden tokens, HP and conditions |

# Backlog

Accepted ideas for the battle map app that aren't scheduled into a phase yet are in the [backlog](/backlog.md).

# Later: campaign manager

Ideas for when the battle map app is solid. None of these are designed yet:

- Campaign lore: NPCs, places, factions
- Session notes
- Character details beyond what a token needs

# Blocked by

Nothing. [Hosting](/decisions/hosting.md), the [backend](/decisions/tech-stack.md), the [frontend](/decisions/frontend-stack.md) and the [rules edition](/decisions/rules-edition.md) are decided, so phase 1 can start.
