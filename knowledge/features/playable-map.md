---
type: Feature
title: Playable map
description: Real-time shared board where players move their own characters and see distances, and the DM moves the creatures.
tags: [feature, players, realtime, mobile]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-14T07:12:36Z }
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
4. **Distance preview** (deferred, see below): while choosing a target cell, show the path and its length in meters, at 1.5 m per square ([movement rules](/rules/movement-distance.md)).
5. **Phone controls**: tap a token to select it, tap a target to preview, tap again to confirm. Dragging conflicts with pinch-zoom and panning on phones. While someone is at the confirm step, everyone else sees an arrow from the token to the target in the token's ring colour ([realtime sync](/decisions/realtime-sync.md), "Move previews"). Tokens may stack: a badge shows how many lie there, each player sees their own characters on top, and tapping again cycles through the person's own tokens in the stack. Creatures sharing a letter are numbered on the board (S1, S2, S3).
6. Pinch to zoom and drag to pan.
7. Show the elevation of a cell and of each token on tap.
8. Undo your own last move.
9. Installable as a PWA. The app opens instantly from cache and shows "Waking up the table…" while the server starts ([hosting](/decisions/hosting.md), [offline prep](/decisions/offline-prep-pwa.md)). The header has an "App installieren" button while the app isn't installed. In browsers that support it (Chrome, Edge), it opens the browser's install dialog. iPhones and iPads have no such dialog, so there it shows how to add the app through Share → "Zum Home-Bildschirm". The button is hidden when the app already runs installed, and in browsers that offer neither (Firefox on Android).
10. Disconnect when the app goes to the background and reconnect when it's visible again ([realtime sync](/decisions/realtime-sync.md)).
11. **Reach highlight** (deferred, see below): when a token is selected, shade the cells it can reach within its default speed. Needs the speed field, which is out until then. A hint only: moves beyond it are allowed, and the distance preview still shows the distance to any target ([speed](/rules/movement-distance.md)).

**Deferred for the proof of concept:** the project owner dropped distance rules from the first playable version. Tokens move to any allowed cell without a path, a distance or a reach highlight. Items 4 and 11 come back at a later, not yet scheduled stage ([implementation plan](/implementation-plan.md)).

# Nice to have (phase 4)

- Ruler between any two points, for ranged attacks, and area templates (cone, sphere, line, cube): moved to the [backlog](/backlog.md) on 2026-10-16.
- The session DM takes tokens off the board, stage 9 ([removing tokens](/features/removing-tokens.md)).
- Pings and arrows, stage 9 ([pings and arrows](/features/pings-and-arrows.md)).
- A card with portrait, name and statuses on a tap, replacing the info box, stage 9 ([token card](/features/token-card.md), [statuses](/features/statuses.md)).
- Hidden tokens and map areas the DM reveals later, stage 10 ([fog of war](/features/fog-of-war.md)).
- "Meine Figur" and a vibration on a confirmed move, stage 9 ([player extras](/features/player-extras.md)).
- The session DM adds unprepared creatures mid-fight, stage 10 ([creature spawn](/features/creature-spawn.md)).
- Who's here and local mode, stage 10 ([shared table](/features/shared-table.md)).

# Not included

A turn order players see, and movement limits. The session DM's own initiative list is built ([initiative](/features/initiative.md)).

[^brief]: Original project brief
