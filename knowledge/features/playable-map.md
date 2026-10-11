---
type: Feature
title: Playable map
description: Real-time shared board where players move their own characters and see distances, and the DM moves the creatures.
tags: [feature, players, realtime, mobile]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T20:30:00Z }
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
4. **Distance preview**: while choosing a target cell, show the path and its length in meters, at 1.5 m per square ([movement rules](/rules/movement-distance.md)).
5. **Phone controls**: tap a token to select it, tap a target to preview, tap again to confirm. Dragging conflicts with pinch-zoom and panning on phones.
6. Pinch to zoom and drag to pan.
7. Show the elevation of a cell and of each token on tap.
8. Undo your own last move.
9. Installable as a PWA. The app opens instantly from cache and shows "Waking up the table…" while the server starts ([hosting](/decisions/hosting.md), [offline prep](/decisions/offline-prep-pwa.md)). The header has an "App installieren" button while the app isn't installed. In browsers that support it (Chrome, Edge), it opens the browser's install dialog. iPhones and iPads have no such dialog, so there it shows how to add the app through Share → "Zum Home-Bildschirm". The button is hidden when the app already runs installed, and in browsers that offer neither (Firefox on Android).
10. Disconnect when the app goes to the background and reconnect when it's visible again ([realtime sync](/decisions/realtime-sync.md)).
11. **Reach highlight**: when a token is selected, shade the cells it can reach within its default speed. A hint only: moves beyond it are allowed, and the distance preview still shows the distance to any target ([speed](/rules/movement-distance.md)).

# Nice to have (phase 4)

- Ruler between any two points, for ranged attacks.
- Area templates: cone, sphere, line, cube.
- Ping: tap and hold to flash a spot for everyone.
- Hidden tokens the DM reveals later.

# Not included

Initiative, turn order and movement limits.

[^brief]: Original project brief
