---
type: Roadmap
title: Roadmap
description: Build order for the app, riskiest part first, with the campaign suite (remote play and campaign management) as the later direction.
tags: [planning]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T20:30:00Z }
---

# Phases

| # | Phase | Goal | Done when |
|---|-------|------|-----------|
| 0 | Image generation spike | Prove that a Foundry image model can turn a layout into a usable top-down map ([approach](/decisions/image-generation-approach.md)) | 3–4 sample layouts give backgrounds that line up well enough with the grid |
| 1 | Playable board, no AI | Value at the table fast | A hand-made layout is playable on several phones at once, with live sync ([playable map](/features/playable-map.md)). Installable PWA, deployed to scale-to-zero production ([hosting](/decisions/hosting.md)) |
| 2 | DM editor | DMs build their own fights | The DM can create a map, paint terrain and place features, elevation, entrances and creatures, offline, then sync on demand ([DM map editor](/features/dm-map-editor.md), [offline prep](/decisions/offline-prep-pwa.md)) |
| 3 | AI visuals | Maps and tokens look good | Backgrounds and creature icons are generated from the editor ([AI map generation](/features/ai-map-generation.md), [token icons](/features/token-icons.md)) |
| 4 | Table extras | Smoother fights | Pings and arrows, the token card, statuses ([statuses](/features/statuses.md)), fog of war ([fog of war](/features/fog-of-war.md)), the spectator view ([spectator view](/features/spectator-view.md)), removing tokens ([removing tokens](/features/removing-tokens.md)), "Meine Figur" and haptic feedback ([player extras](/features/player-extras.md)), creature spawn ([creature spawn](/features/creature-spawn.md)), who's here and local mode ([shared table](/features/shared-table.md)) |

The [implementation plan](/implementation-plan.md) splits phases 1–4 into ten stages, each ending in a quality gate, and runs phase 0 alongside stages 1–6.

# Backlog

Accepted ideas for the battle map app that aren't scheduled into a phase yet are in the [backlog](/backlog.md).

# Later: a campaign suite

The app starts with fights but grows into a full D&D campaign suite for players and DMs (project owner, 2026-10-16). The [backlog](/backlog.md) holds two focus areas for that, not designed or scheduled yet:

- **Remote play**: playing a whole session fully remote, with dice rolls, handouts and more.
- **Campaign management**: characters, notes, items, inventory, a knowledge base and session recaps.

They take over the earlier "campaign manager" list (campaign lore, session notes, character details).

# Blocked by

Nothing. [Hosting](/decisions/hosting.md), the [backend](/decisions/tech-stack.md), the [frontend](/decisions/frontend-stack.md) and the [rules edition](/decisions/rules-edition.md) are decided, so phase 1 can start.
