---
type: Feature
title: Playable map
description: Real-time shared board where players move their own characters and see distances, and the DM moves the creatures.
tags: [feature, players, realtime, mobile]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
sources:
  - id: brief
    resource: /references/original-brief.md
    title: Original project brief
---

# Goal

Each player uses their own device, sees the current board and moves their character. The DM moves the monsters. There are no restrictions on order.[^brief]

# Must have

1. Show the active [encounter](/domain/encounter.md): background image, grid drawn by the app, and [tokens](/domain/token.md) with labels.
2. Moves appear on every device within about a second ([realtime sync](/decisions/realtime-sync.md)).
3. Players move only their own characters; the DM moves anything ([token permissions](/domain/token.md)).
4. **Distance preview**: while choosing a target cell, show the path and its length in feet ([movement rules](/rules/movement-distance.md)).
5. **Phone controls**: tap a token to select it, tap a target to preview, tap again to confirm. Dragging conflicts with pinch-zoom and panning on phones.
6. Pinch to zoom and drag to pan.
7. Show the elevation of a cell and of each token on tap.
8. Undo your own last move.

# Nice to have (phase 4)

- Shading for the cells reachable with the token's speed. A hint only, not enforced.
- Ruler between any two points, for ranged attacks.
- Area templates: cone, sphere, line, cube.
- Ping: tap and hold to flash a spot for everyone.
- Hidden tokens the DM reveals later.

# Not included

Initiative, turn order and movement limits.

[^brief]: Original project brief
