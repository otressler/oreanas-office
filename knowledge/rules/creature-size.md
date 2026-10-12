---
type: Game Rule
title: Creature size
description: How many grid cells a token covers per size category.
tags: [rules, tokens, grid]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Footprint

| Size | Cells | Notes |
|------|-------|-------|
| Tiny | 1×1 | The rules let several Tiny creatures share a square. The app simplifies this to one cell. Moves never forbid overlapping; only placing tokens when a fight is imported or started keeps them apart ([encounter](/domain/encounter.md)) |
| Small | 1×1 | |
| Medium | 1×1 | |
| Large | 2×2 | |
| Huge | 3×3 | |
| Gargantuan | 4×4 | |

# Use in the app

- A [token](/domain/token.md)'s `x`, `y` is the top-left cell of its footprint.
- The size comes from the linked [character](/domain/character.md) or [creature type](/domain/creature-type.md).
- Pathfinding checks that the whole footprint fits along the path ([movement distance](/rules/movement-distance.md)). Squeezing into smaller spaces is out of scope.
- The icon is drawn across the whole footprint.
