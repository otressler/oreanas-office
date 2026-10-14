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
- **Sync** runs when the DM presses "Sync", and automatically before starting an encounter, when leaving the editor and when the connection comes back (added by the project owner on 2026-10-14). See the [sync protocol](#sync-protocol) below.
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

# Sync protocol

Approved by the project owner on 2026-10-14. The device always starts a sync; the server never polls or pushes ([hosting](/decisions/hosting.md)).

## Items

A conflict always concerns one whole item.

| Item | Contains | Changed offline | Changed only by the server |
|------|----------|-----------------|----------------------------|
| [Campaign](/domain/campaign.md) | ID and name | Creating only | Join code, members, everything else |
| [Creature type](/domain/creature-type.md) | Name, size, appearance, DM notes, `archivedAt` | Yes | Icon (stage 8) |
| [Battle map](/domain/battle-map.md) | Name, size, layout, scene, vibe, lighting, `archivedAt`, `copiedFromMapId` | Yes | Store copies and imports, which the server creates |
| [Encounter](/domain/encounter.md) | Name, map, status, `archivedAt`, and its creature [tokens](/domain/token.md) | Only while `draft` or `ready` | Starting, ending, the layout copy, live tokens |

- The creature tokens of a draft or ready encounter are part of the encounter. They have no move history yet, so the server replaces the encounter's token set on each push; token IDs stay the same.
- Active and ended encounters belong to the server. Devices pull them and show them read-only, but never push them.
- Not synced, online only: characters, sessions, members, campaign changes other than creating, live tokens and moves, and images.

## Versions and IDs

- IDs are GUIDs made in the browser.
- Every item has an integer `Version`: 1 when created, raised by 1 by the server on every accepted change. It is a concurrency token, like the token version in [realtime sync](/decisions/realtime-sync.md).
- On the device, each item keeps `baseVersion` (the server version its local copy is based on), a "changed" flag and an edit counter. A successful push clears the flag only if the counter didn't change during the push.

## Push

One request carries every changed item, in the order campaigns, creature types, maps, encounters. Each item is `{ id, kind, baseVersion, data }`. The server handles each item in its own transaction and answers per item:

| Server state | Answer |
|--------------|--------|
| ID unknown and `baseVersion` 0 | Created, version 1 |
| `Version` equals `baseVersion` | Saved, version + 1 |
| `Version` differs | Conflict, with the server copy |
| Not allowed or invalid | Rejected, with a German reason |

- Partial success is normal: one conflict doesn't stop the other items.
- A rejected new item also rejects the items that need it, with "depends on …".
- If the server copy in a conflict is identical to the local copy (a retry after a lost answer), the device takes it as saved and shows nothing.

## Pull

1. The device fetches the user's campaigns and roles, which refreshes its offline copy of the campaign list.
2. For each campaign where the user is a `dm` member, the server lists the ID and version of every creature type, map and encounter, archived ones included.
3. The device fetches the items whose version differs, and the ones it doesn't have. Items that vanished from the list, for example after losing `dm` rights, are dropped if they are synced and kept with a warning if they have local changes.

Players pull only the campaign list, so DM notes and prepared encounters never reach their devices. A pulled item never overwrites unsynced local changes; that case becomes a conflict at the next push. A "changed since" cursor was considered and dropped: it can miss rows from late transactions and can't see lost access, and the full list is only a few KB.

## Conflicts

A dialog asks once per item, showing who changed each version last and when, and a small layout preview for maps:

- **Meine behalten:** push the local copy again on top of the server version.
- **Server-Version übernehmen:** throw the local changes away.
- **Beide behalten:** save the local copy as a new item with a new ID and " (Kopie)" after its name. Nothing is merged.

If an encounter was started or ended on the server while it was edited offline, the dialog offers only "save my version as a new draft" or "throw it away". Archiving on one device and editing on another is a normal conflict.

## Rejections

A rejected item stays on the device, marked "Nicht synchronisiert" with the reason. The DM can fix it and sync again, take the server version, or export the map with the import tool. The server checks everything as the import does (grid at most 40×40, valid cells, valid placement in ready encounters); the editor runs the same checks first, with shared test cases for the C# and TypeScript versions, so rejections should be rare.

## Special cases

- **Creature type names** are unique per campaign, ignoring case. If a pushed type's name is taken, the dialog offers to use the existing type (the local tokens switch to it) or to rename the local one.
- **Archived references:** a new encounter that uses a map or creature type archived meanwhile is accepted. Archiving only stops offering it for picking.
- **Campaigns created offline:** the server creates the campaign with its client ID, makes the join code and adds the creator as `dm` member and default DM. Its items follow in the same push.
- **Store and import** run on the server; a pull follows immediately, so the copy shows up in the editor.
- **Before starting:** the session DM's device pushes its changes to that encounter first. A conflict must be resolved before the setup screen opens.
- **Backgrounds and icons** (stages 7 and 8) are picked through the same path: saved locally, then synced at once, so they never overwrite unsynced edits.
- **Two tabs:** one sync at a time per browser (Web Locks API).
- **Expired sign-in:** the sync asks the user to sign in again; local data is kept for that user.
- **Outdated app:** the server names the oldest app version it accepts for sync, and refuses older ones with "Bitte neu laden" while keeping the local data (rule 5 of [backward compatibility](/decisions/backward-compatibility.md)). The minimum is raised whenever the sync format changes, even before backward compatibility is enforced.

## When it runs

The "Sync" button, before starting an encounter, when leaving the editor, when the connection comes back, and when the editor opens while online (pull). The editor header shows a small status ("Synchronisiere…", "Alles synchronisiert", "3 Änderungen nicht synchronisiert"); only conflicts and rejections ask for attention. An automatic sync may wake the server; the editor stays usable meanwhile.

## Server checks

- The user is a `dm` member of the item's campaign at the moment of the push. Being the session DM isn't needed for prep.
- An existing ID must belong to the campaign the push names, and a new item's ID must not exist anywhere.
- References stay inside the campaign: an encounter's map and its tokens' creature types belong to the same campaign.

# As built (stage 5)

- Offline data lives in an IndexedDB database per user (`oreana-<userId>`, Dexie), with battle maps and a copy of the user's campaigns. Each map carries `baseVersion`, the "changed" flag and the edit counter of the sync protocol.
- The map pages open without the server and outside the waking screen. They trust the last user the server confirmed on this device, kept in local storage; signing out forgets that user but keeps their data. Without a remembered user the pages send people to sign in.
- The campaign copy is refreshed whenever the campaign list or a campaign page loads.
- The browser is asked to keep the storage when a map is created or imported.

# Why split it this way

Scale-to-zero already makes waking the server cheap, so offline editing isn't needed to save money. Its value is that prep works anywhere and stays fast. Live play is real-time across devices and can't work offline, so that part always uses the server.

# Open

Should players be able to look at a past encounter offline? It's not needed for now.
