---
type: Decision
title: Offline prep and PWA
description: The app is an installable PWA; the DM prepares encounters offline and syncs them on demand, while live play and image generation need the server.
tags: [decision, pwa, offline, architecture]
decision: proposed
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:45:10Z }
---

# Background

The project owner suggested that session prep could happen in a PWA that syncs on demand, so the server only has to run when needed ([hosting](/decisions/hosting.md)).

# Proposal

**From phase 1: an installable PWA.**

- Players and the DM install the app on their phone or laptop.
- The app shell is cached, so the app opens instantly even while the server is still waking up.
- Live play still needs a connection ([playable map](/features/playable-map.md)).

**From phase 2: offline-first editor with on-demand sync.**

- The [DM map editor](/features/dm-map-editor.md) saves [battle maps](/domain/battle-map.md), [encounters](/domain/encounter.md) and [creature types](/domain/creature-type.md) in the browser (IndexedDB) first. Editing works without a connection and without waking the server.
- **Sync** runs when the DM presses "Sync", and automatically before starting an encounter.
- **Needs the server:** image generation ([AI map generation](/features/ai-map-generation.md), [token icons](/features/token-icons.md)), joining a campaign, and running an encounter.
- **Conflicts:** each synced item has a version number. One DM usually edits their own encounters, so a conflict only happens when the same item was changed on two devices. Then the app asks which version to keep and never merges silently.

# Why split it this way

Scale-to-zero already makes waking the server cheap, so offline editing isn't needed to save money. Its value is that prep works anywhere and stays fast. Live play is real-time across devices and can't work offline, so that part always uses the server.

# Open

Should players be able to look at a past encounter offline? It's not needed for now.
