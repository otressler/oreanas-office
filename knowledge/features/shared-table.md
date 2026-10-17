---
type: Feature
title: Shared table
description: Avatars on the board show who is connected to the fight right now, and in local mode a shared screen in the middle of the table, opened by any member, moves every player character, while the DM keeps the hidden things on their own device.
tags: [feature, table, realtime, players, spectator]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-16T09:12:56Z }
---

# Goal

Two backlog ideas that belong to the table as a whole, scheduled for stage 10 by the project owner on 2026-10-16 ([implementation plan](/implementation-plan.md)):

- **Who's here**: everyone sees at a glance who is connected to the fight, so the DM notices a remote player who dropped out.
- **Local mode**: a group that plays around one tablet moves every character from that screen, without phones or accounts for the players. The DM keeps their own device for the creatures and everything hidden.

Local mode is not the spectator view. A [spectator](/features/spectator-view.md) is a read-only device that only ever watches; local mode is a play mode the session DM flags, in which a member's device becomes a **shared screen** that moves characters (project owner, 2026-10-17). Both follow the [overview](/overview.md) principle "show, don't enforce" and work for in-person, remote and mixed groups ([play setting](/decisions/play-setting.md)).

Proposals in this concept that the project owner hasn't confirmed yet are marked with their question number in the [implementation plan](/implementation-plan.md).

# Who's here

**What it shows** (question 28)

- A row of small round avatars along the top edge of the board, on every device in the fight, the spectator screen included.
- **Who is in the row**: the session DM, the owner of every character in the fight, and anyone else connected to the fight, such as a `dm` member who only watches. Each person appears once, however many devices they use.
- **Connected or not**: an avatar is drawn full when at least one of the person's devices is connected to the fight, and greyed out when none is. Phones close their connection when the app goes to the background ([realtime sync](/decisions/realtime-sync.md)), so a locked phone shows as not connected. That is honest: the person won't see a ping until they look again.
- **The avatar** is the portrait of the person's character in the fight in its ring colour, as on the token; with several characters, the one added to the campaign first, as for [ping colours](/features/pings-and-arrows.md). The session DM gets a gold ring; someone without a character in the fight gets their initial in white.
- **The shared screen** counts as its own avatar, a table icon, while at least one spectator screen is connected to the session. Its account doesn't count as a person through it, as the [spectator view](/features/spectator-view.md) says.
- **Tapping an avatar** shows the person's name and "verbunden" or "nicht verbunden". Nothing else; it isn't a menu.

**Rules**

- Built from the live hub connections and the fight's tokens. **Nothing is stored**: after a cold start every device reconnects and the row fills again ([hosting](/decisions/hosting.md)).
- A disconnect shows only after about 10 seconds, so a quick reconnect, such as switching apps for a moment, doesn't make the avatar flicker.
- Fog of war hides nothing here: who plays isn't secret ([fog of war](/features/fog-of-war.md)).

# Local mode

**The play mode**

- A session has a **play mode** ("Spielweise"): **"Eigene Geräte"** (bring your own device, the default) or **"Gemeinsamer Bildschirm"** (local mode). It is the `playMode` of the [session](/domain/session.md).
- The **session DM** sets it on the session page, also while a fight runs. A change reaches every device of the session at once; nothing reloads.
- Other `dm` members and players see the mode on the session page but don't change it.

**Which screens get the controls** (question 29, answered 2026-10-17)

- **A spectator screen never gets controls**, in either play mode. Spectating stays a read-only mode of the device.
- While the session is in local mode, **any campaign member** (not only the DM) opens a **shared screen** from the session page with **"Gemeinsamen Bildschirm öffnen"**. Opening it is a mode of the connection, like spectating: the same account may play on a phone and run the shared screen on a tablet.
- A shared screen follows the session's fights by itself and shows what players see, like a spectator screen ([spectator view](/features/spectator-view.md)). It may move every character in the fight, whoever owns it.
- **Connection**: a shared screen gets the spectator screen's treatment: no idle timeout while its session is active, and a wake lock, so a tablet in the middle of the table stays connected ([spectator view](/features/spectator-view.md), "Connection and costs"). Confirmed 2026-10-17.
- **Someone who isn't a campaign member** can't open a shared screen, so a QR-code spectator can't move the party.
- The shared screen stays in the players' hub group, whoever is signed in, the session DM included. Hidden creatures and fog never reach it ([fog of war](/features/fog-of-war.md)). The DM works hidden things on their own device, as the backlog had it.

**Players' own devices keep working** (question 30)

- Local mode adds the shared screen; it takes nothing away. A player who brought a phone still moves their own character from it. This keeps mixed groups working, with most people around the tablet and one player at home.

**What the shared screen does** (question 31)

| Action | On the shared screen in local mode |
|--------|------------------------------------|
| Move characters | Every character in the fight, with the usual tap, preview and "Hierhin" ([realtime sync](/decisions/realtime-sync.md)) |
| Move creatures | No; only the session DM |
| Token card | Yes, as on a player's board ([token card](/features/token-card.md)) |
| Pings and arrows | Yes, in white with the name "Tisch" ([pings and arrows](/features/pings-and-arrows.md)) |
| Statuses | Like a player who owns every character: on any character and on visible creatures; it removes the statuses put on from a shared screen ([statuses](/features/statuses.md)) |
| Undo | The last move made from a shared screen in this fight, while it is still that token's latest move |
| Remove tokens, fog, start or end fights | No; only the session DM ([removing tokens](/features/removing-tokens.md)) |

- **Tapping** follows a player's rules, with every character counting as the person's own: a tap on a character selects it, a tap on a creature opens only its card. Every character is drawn above the creatures, so none gets buried.
- **The view** starts with the whole map, as on the spectator screen. Pinch and drag zoom and pan; "Ganze Karte" in the corner menu goes back. The screen doesn't zoom back by itself.
- A move's preview shows on the other devices in the moved character's ring colour, as when its owner moves it.
- **Switching back** to "Eigene Geräte" during a fight: the shared screen lets go of a selected token, its preview disappears, and it only watches again, like a spectator screen. "Gemeinsamen Bildschirm öffnen" is gone from the session page until local mode is switched on again.

**Who did it**

- Moves and statuses from a shared screen are saved under the signed-in account and marked as coming from a shared screen. The mark decides undo and removing statuses, so a person signed in on both a phone and the tablet keeps their phone's undo apart from the table's.
- The token card names "Tisch" as who put a status on.

# Data

- [Session](/domain/session.md): `playMode`, `byod` (default) or `local`.
- [Token](/domain/token.md) move history: `fromSharedScreen` on each move.
- [Token status](/domain/status.md): `fromSharedScreen` next to `appliedByUserId`.
- Hub: `PresenceChanged` with the connected people and whether a shared screen is connected, sent to both groups of the encounter; `PlayModeChanged` to every connection of the session, the session page included.

# Not included

- Turning a spectator screen into a shared screen: they are different modes of the device ([spectator view](/features/spectator-view.md)).
- Who's here outside a fight, such as on the session page between fights.

# Gate

- [ ] Four phones and the DM's laptop are in a fight: the row shows five avatars, full. A player locks their phone; within about 10 seconds their avatar greys out on every device, and comes back when they open the app.
- [ ] A player signed in on a phone and on the spectator tablet appears once; the tablet appears as the table icon.
- [ ] The DM switches the session to "Gemeinsamer Bildschirm" during a fight. A spectator tablet still only watches. A player (not the DM) opens "Gemeinsamen Bildschirm öffnen" on another tablet; it moves every character, and each move shows on the phones. It can't select a goblin.
- [ ] The tablet pings a cell in white with "Tisch", puts "Liegend" on a character and removes it again; it undoes its own last move.
- [ ] A player's phone still moves their character in local mode, and its undo doesn't touch the tablet's move.
- [ ] A tablet signed in as the session DM shows no hidden goblin and no fog layout, also in local mode.
- [ ] A spectator who isn't a campaign member can't move anything and isn't offered a shared screen in local mode.
- [ ] Switching back to "Eigene Geräte" ends the shared screen's selection, and it only watches again.
