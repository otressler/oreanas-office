---
type: Product Overview
title: Battle map app overview
description: Digital battle maps for D&D fights — the DM sketches a layout, AI paints it, and everyone moves tokens on their own device.
tags: [overview, scope]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
sources:
  - id: brief
    resource: /references/original-brief.md
    title: Original project brief
---

# Problem

The group stages fights with minifigures on printed maps. Without a printer for large paper, maps are cramped and the figures don't fit.[^brief]

# Product

The app has two parts:

1. **DM battle map builder.** The DM sets a grid size, draws the walkable area, places the important objects, sets heights, entrances and exits, describes the scene and vibe, and places enemies ([DM map editor](/features/dm-map-editor.md)). An AI image model turns the layout into the map visuals ([AI map generation](/features/ai-map-generation.md)), and each enemy type gets its own icon ([token icons](/features/token-icons.md)).
2. **Playable map.** Every player sees the current board on their own device, moves their own character and sees how far the move is. The DM moves the monsters ([playable map](/features/playable-map.md)).

# Principles

- **The logical grid is the source of truth.** Movement, distance, walls and elevation come from the layout data. The AI image is only decoration, so a slightly misaligned image never breaks the game ([image generation approach](/decisions/image-generation-approach.md)).
- **Not a full level editor.** The DM places only what matters for the fight.
- **Show, don't enforce.** There is no turn order and no movement limit. The app shows distances and the table decides.
- **Phone-first for players.** Players use their own phones, so touch input and small screens come first.

# Scope

**Now:** the map editor, AI visuals, creature tokens and the real-time playable map.

**Later:** the app may grow into a campaign manager ([roadmap](/roadmap.md)).

**Out of scope:** initiative and turn tracking, and full level editing.

# Glossary

| Term | Meaning |
|------|---------|
| DM | Dungeon master. Runs a session and controls the creatures. |
| Encounter | One fight: a battle map plus the tokens on it. The brief calls this a "fight". |
| Battle map | The grid layout and its generated background image. Can be reused across encounters. |
| Token | Anything standing on the board: a character or a creature. |
| Creature type | A reusable monster template such as "Goblin", with size, speed and icon. |

[^brief]: Original project brief
