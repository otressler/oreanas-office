---
type: Game Rule
title: Movement distance
description: How the distance preview counts squares, diagonals, corners, difficult terrain and walls under D&D 5e (2024), shown in meters at 1.5 m per square.
tags: [rules, movement, grid, units]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T20:30:00Z }
---

# Units

- **One square is 1.5 m**, set by the project owner. This is a fixed constant in the app, not a per-map setting.
- **Distances are stored and calculated in whole squares** and only converted to meters for display (squares × 1.5). The app adds whole numbers only, so 1.5 m steps never cause rounding errors.
- **Display uses meters** with up to one decimal, in German number format, e.g. "7,5 m" ([UI language](/decisions/ui-language.md)). Feet never appear in the app.
- Rulebook speeds convert the usual way: 30 ft = 9 m = 6 squares, 25 ft = 7.5 m = 5 squares.

# Rule

The group plays D&D 5e (2024) ([rules edition](/decisions/rules-edition.md)).

- **Every step costs one square** (1.5 m), straight or diagonal.
- **No corner cutting.** A diagonal step can't pass the corner of a wall or other blocking obstacle. A step from (x, y) to (x+1, y+1) is not allowed if (x+1, y) or (x, y+1) is blocked.
- **Difficult terrain** and **water** cost double for each square entered.
- **Blocked**: `wall` cells, `void` cells and features with `blocksMovement: true`. Paths go around them.
- **Tokens**: moving through other tokens is allowed. The app doesn't judge this, the table does.
- The path is the cheapest route (A* pathfinding). For large creatures, the whole footprint must fit along it ([creature size](/rules/creature-size.md)).

# Display

Show the total in meters next to the target square, for example "7.5 m". If the token's speed is known, show "7.5 / 9 m". Never block a move.

# Examples

| Move | Squares | Shown |
|------|---------|-------|
| 3 squares straight + 2 diagonal, plain floor | 5 | **7.5 m** |
| Same, with one straight square difficult terrain | 6 | **9 m** |
| Diagonal past the corner of a wall | Not allowed. The path goes around: 2 straight steps = 2 | **3 m** |

# Implementation

Distance is calculated only in the frontend ([frontend stack](/decisions/frontend-stack.md)). The server never restricts movement, so it needs no copy of this logic. Write it as one pure function that returns squares, with unit tests based on the examples above, and convert to meters only when displaying. If a server-side check is ever needed, share those test cases as JSON so the C# and TypeScript versions agree.

# Open questions

- **Corners**: is a diagonal blocked when only one of the two side cells is blocked, or only when both are? The current reading is "either one". Confirm it at the table.
- **Elevation**: does climbing or jumping between heights cost extra, or is height only shown? For now, show it and don't count it.
- **Flying**: should a flying token ignore terrain costs and blocked cells?
