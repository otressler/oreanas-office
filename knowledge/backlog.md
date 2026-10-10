---
type: Backlog
title: Backlog
description: Accepted feature ideas that aren't designed or scheduled into a phase yet; all of them support in-person and remote play without simulating the rules.
tags: [planning, backlog]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T21:15:00Z }
---

# How to read this

The project owner picked these ideas for the battle map app. None of them is designed or scheduled yet. When one moves into a phase of the [roadmap](/roadmap.md), it gets requirements in its feature concept and is removed from here.

They all follow the [overview](/overview.md) principle "show, don't enforce", and they have to work for in-person, remote and mixed groups ([play setting](/decisions/play-setting.md)).

# Shared table

| Idea | What it does | Notes |
|------|--------------|-------|
| **Table view** | A shared device (TV, tablet or laptop) in the middle of the table. A user signs in, picks a campaign, and picks which of the campaign's characters this device handles. It shows the active encounter live, without anything hidden from players. | Already listed under "Later" in the [roadmap](/roadmap.md). Whether it can move the picked characters depends on the play mode: yes in local mode, no in bring-your-own-device mode, where it only shows the board. |
| **Join by QR code** | The DM's screen shows a QR code that opens the campaign or the active fight on a player's phone. | Wraps the existing campaign `joinCode` ([auth](/decisions/auth.md)). The player still signs in. |
| **Ping** | Tap and hold flashes a pulse in the player's colour on every screen. | The remote version of pointing at the table. Already a phase 4 nice-to-have in the [playable map](/features/playable-map.md). |
| **Who's here** | Small avatars show who is connected to the encounter right now. | Comes from the live connections ([realtime sync](/decisions/realtime-sync.md)), not stored. Helps the DM notice a remote player who dropped out. |
| **Local mode** | A play mode, next to the default **bring-your-own-device mode** where each player moves their own characters on their own device. In local mode, everything the players do happens on one shared device: the table view moves every player character, whoever owns it. The DM uses their own device for the creatures and everything hidden (hidden tokens, unrevealed map areas, DM undo). | Runs on the normal server with live sync between the two devices, so it fits the [offline prep](/decisions/offline-prep-pwa.md) proposal. Players don't need their own phones or accounts. Extends the permission rule on the [token](/domain/token.md). The DM picks the mode per [session](/domain/session.md). |

# On the board

| Idea | What it does | Notes |
|------|--------------|-------|
| **Free draw** | Anyone draws temporary lines and arrows in their colour to plan or explain a move. They fade after a few seconds. | Broadcast like pings, not saved. |
| **Status rings** | A token can carry coloured rings or emoji (💤, 🔥, 🩸…) as reminders. Players set them on their own characters and on any creature they can see, the DM on any token. Each user keeps a **status inventory**: their own list of statuses (name, colour or emoji), so applying one is a single tap. | No rules attached. The inventory belongs to the user within a campaign. Related to "HP and conditions" in phase 4 of the [roadmap](/roadmap.md). |
| **Terrain statuses** | Statuses can also mark cells or areas of the map (🔥 burning, 🕸️ webbed, 🌫️ darkness, 🧊 ice…), shown as a tinted overlay with the icon. They come from the same status inventory, where each status is marked for tokens, terrain or both. Players and the DM can set them. | No rules attached: the app doesn't make the area difficult terrain or deal damage. Stored on the encounter, not on the reusable [battle map](/domain/battle-map.md). |
| **Map reveal** | The DM hides parts of the map and reveals rooms or areas by hand during the fight. | Fog of war that the DM controls. No line-of-sight calculation. Needs a hidden/revealed state per cell or area in the encounter, not in the reusable [battle map](/domain/battle-map.md). |
| **Monster reveal and spawn** | The DM reveals hidden creatures, and places new creatures during play ("three more goblins come through the door"). | Reveal uses the `hidden` flag on the [token](/domain/token.md). Spawning reuses the editor's placement and auto-numbering ([DM map editor](/features/dm-map-editor.md)). |
| **Remove tokens** | A defeated or departed token can be faded out or laid down instead of deleted, so the board keeps its history. The DM can also delete it. | Needs a state on the [token](/domain/token.md), for example `active`, `down` or `removed`. |

# Running the session

| Idea | What it does | Notes |
|------|--------------|-------|
| **Several fights per session** | The DM prepares several encounters for one session and switches between them with one tap. | A [session](/domain/session.md) already has one `activeEncounterId`. This adds a list of planned encounters per session, for example by setting `Encounter.sessionId` while preparing ([encounter](/domain/encounter.md)). |
| **Undo for the DM** | The DM can undo any recent move, not only their own. | Uses the existing move history on the [token](/domain/token.md). |

# For players

| Idea | What it does | Notes |
|------|--------------|-------|
| **Character colour and portrait** | Each player picks a colour for their token ring, pings and drawings, and a portrait. | Adds a `color` to the [character](/domain/character.md). Portraits already exist ([token icons](/features/token-icons.md)). |
| **Show my token** | A button that centres the view on the player's own character. | |
| **Haptic feedback** | A short vibration when a move is confirmed, so the player knows the tap counted. | Only where the device supports it. |
