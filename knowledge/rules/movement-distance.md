---
type: Game Rule
title: Movement distance
description: How the distance preview counts squares, diagonals, difficult terrain and walls.
tags: [rules, movement, grid]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Rule

- One cell is `BattleMap.cellSizeFt` feet, 5 by default ([battle map](/domain/battle-map.md)).
- **Diagonals** are a setting:
  - `uniform` (5e default): every diagonal step costs 5 ft.
  - `alternating` (5e optional variant): the 1st diagonal costs 5 ft, the 2nd 10 ft, the 3rd 5 ft, and so on.
  - The default depends on the [rules edition](/decisions/rules-edition.md) decision.
- **Difficult terrain** and **water** cost double for each cell entered.
- **Blocked**: `wall` cells, `void` cells and features with `blocksMovement: true`. Paths go around them.
- **Tokens**: moving through other tokens is allowed. The app doesn't judge this, the table does.
- The path is the cheapest route (A* pathfinding), and its full footprint must fit for large creatures ([creature size](/rules/creature-size.md)).

# Display

Show the total in feet next to the target cell, for example "25 ft". If the token's speed is known, also show it as "25 / 30 ft". Never block a move.

# Examples

A token moves 3 cells straight and 2 cells diagonally on plain floor:

| Diagonal setting | Straight | Diagonals | Total |
|------------------|----------|-----------|-------|
| `uniform` | 15 ft | 5 + 5 | **25 ft** |
| `alternating` | 15 ft | 5 + 10 | **30 ft** |

The same move with one of the straight cells being difficult terrain adds 5 ft.

# Implementation

Write one shared function used by both the preview and any server-side checks, so the numbers never differ between devices.

# Open questions

- **Elevation**: does climbing or jumping between heights cost extra, or is height only shown? For now, show it and don't count it.
- **Flying**: should a flying token skip terrain costs and blocked cells?
