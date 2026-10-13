---
type: Decision
title: Offline prep and PWA
description: The app is an installable PWA; the DM prepares maps, encounters, creature types and new campaigns offline and syncs them on demand, while live play, image generation and the map store need the server.
tags: [decision, pwa, offline, architecture]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:45:10Z }
---

# Background

The project owner suggested that session prep could happen in a PWA that syncs on demand, so the server only has to run when needed ([hosting](/decisions/hosting.md)).

# Decision

Accepted by the project owner on 2026-10-13, including campaigns created offline.

**From phase 1: an installable PWA.**

- Players and the DM install the app on their phone or laptop.
- The app shell is cached, so the app opens instantly even while the server is still waking up.
- Live play still needs a connection ([playable map](/features/playable-map.md)).

**From phase 2: offline-first editor with on-demand sync.**

- The [DM map editor](/features/dm-map-editor.md) saves [battle maps](/domain/battle-map.md), [encounters](/domain/encounter.md) and [creature types](/domain/creature-type.md) in the browser (IndexedDB) first. Editing works without a connection and without waking the server.
- **Sync** runs when the DM presses "Sync", and automatically before starting an encounter.
- **Needs the server:** image generation ([AI map generation](/features/ai-map-generation.md), [token icons](/features/token-icons.md)), joining a campaign, running an encounter, and the map store ([battle map](/domain/battle-map.md)).
- **Conflicts:** each synced item has a version number. One DM usually edits their own encounters, so a conflict only happens when the same item was changed on two devices. Then the app asks which version to keep and never merges silently.
- **Item IDs** are GUIDs made in the browser, so items created offline keep their ID when they reach the server.
- **Per user and kept:** offline data is stored per signed-in user, so a second account in the same browser doesn't see it. The app asks the browser to keep its storage, marks items that aren't synced yet, and warns before signing out with unsynced changes. Data the browser clears before a sync is lost.
- **Rights are checked at sync.** The server checks every pushed change against the user's rights at that moment. A user who lost their `dm` rights while offline gets a clear message about the rejected changes; nothing is dropped silently.

**Campaigns offline.** The project owner decided on 2026-10-13 that a [campaign](/domain/campaign.md) can be created offline and synced later.

- The browser keeps a copy of the user's campaigns from the last time online, so maps can be built for them offline. Members and roles are shown from that copy and can't be changed offline.
- Only creating a campaign works offline. Renaming it and every other campaign change need a connection, so campaigns don't need versions or the conflict dialog.
- A campaign created offline has the creator as its only member, as a `dm` member and its default DM. It has no join code until it syncs, because the server makes the code unique; inviting, showing and replacing the code are hidden until then.
- Characters and sessions are created online only: characters belong to players who can't join yet, and sessions run on the server.
- Sync pushes a new campaign before its maps, encounters and creature types. A new campaign can't conflict, since its ID is new.
- Comes with sync in stage 6 of the [implementation plan](/implementation-plan.md). Stage 5 only keeps the copy of the user's existing campaigns.

# Why split it this way

Scale-to-zero already makes waking the server cheap, so offline editing isn't needed to save money. Its value is that prep works anywhere and stays fast. Live play is real-time across devices and can't work offline, so that part always uses the server.

# Open

Should players be able to look at a past encounter offline? It's not needed for now.
