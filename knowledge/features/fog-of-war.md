---
type: Feature
title: Fog of war
description: The session DM hides parts of the map and creatures from the players, prepares that before the fight, and reveals them by hand during play; players' devices never receive what is hidden.
tags: [feature, dm, players, realtime, fog]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-15T21:44:04Z }
---

# Goal

The DM decides what the players see. Rooms behind a closed door, the far side of a gorge or an ambush in the bushes stay hidden until the story reaches them, and the DM uncovers them with a few taps. This joins two [backlog](/backlog.md) ideas, **map reveal** and the reveal half of **monster reveal and spawn**, because both rest on the same rule: the server sends each device only what it may see.

It follows the [overview](/overview.md) principle "show, don't enforce": there is no line of sight, light or vision range. The DM reveals by hand, as they would lift a sheet of paper off a printed map. It works the same for in-person, remote and mixed groups ([play setting](/decisions/play-setting.md)).

# Terms

- **Fog**: the set of hidden cells of an encounter. A cell is either **revealed** or **hidden**. Fog is off for an encounter until the DM turns it on.
- **Area**: a named group of cells the DM draws while preparing ("Nordkammer", "Jenseits der Brücke"), so a whole room is revealed with one tap during play. Areas may overlap; an area is only a shortcut and has no state of its own.
- **Hidden creature**: a creature [token](/domain/token.md) with `hidden: true`. Players don't see it, wherever it stands.
- **Visible to players**: what a player's device receives. A creature is visible when it isn't `hidden` and at least one cell of its footprint is revealed. Characters are always visible (see below).

# Who does what

- Only the **session DM** sees through the fog and hidden creatures, and only they change either, as for every action at the table ([session](/domain/session.md)). Other `dm` members who play in the session see what players see.
- While preparing, the session DM sets up fog, areas and hidden creatures in the [map editor](/features/dm-map-editor.md), offline like the rest of encounter prep ([offline prep](/decisions/offline-prep-pwa.md)).
- During the fight, the session DM reveals and hides from the board, on a phone or a laptop.

# Preparing (map editor, encounter mode)

1. **"Nebel" tool.** Turning fog on for the encounter hides the whole map. The DM then reveals the starting area, or uses "Alles aufdecken" and hides only the secret parts, whichever is less work.
2. **Painting.** Brush, rectangle and fill, as in the terrain tools, each with "Aufdecken" or "Verdecken". Hidden cells show to the DM as a dark, hatched overlay; the map underneath stays visible.
3. **Areas.** "Bereich anlegen" turns the current cell selection into a named area. Areas are listed in the side panel, where they can be renamed, redrawn or deleted. Clicking one in the list highlights it on the canvas.
4. **Hidden creatures.** The creature panel gets a "Verborgen" switch, also when placing ("verborgen platzieren"), so a whole ambush is placed hidden in one go. Hidden creatures show to the DM see-through, with a closed-eye mark.
5. **Checks.** Nothing about fog stops an encounter from being marked ready. The Prüfung list notes an entrance that lies entirely in fog, since characters usually start there.

Fog belongs to the [encounter](/domain/encounter.md), not to the reusable [battle map](/domain/battle-map.md): two fights on the same crypt can start in different rooms. A new encounter on a map starts without fog.

# Starting

The setup screen shows the fog to the DM. Characters may be placed on hidden cells (a character waking up in a dark cell), but the screen warns "Steht im Nebel". Starting reveals nothing by itself.

# During the fight

**The DM's board**

- A "Nebel" button in the session DM's board toolbar switches to fog mode, where taps change fog instead of selecting tokens. Tools: **Bereich** (tap a cell, then pick one of the areas that contain it), **Pinsel** and **Rechteck**, each with "Aufdecken" or "Verdecken".
- **Nothing reaches the players until the DM confirms.** Like a move, a fog change is a preview first: the chosen cells are outlined, a bar says "12 Felder aufdecken?", and "Aufdecken" or "Verdecken" sends it. "Abbrechen" drops it. A wrong tap on a phone mustn't show the boss room.
- **Creatures**: the [token card](/features/token-card.md) of a creature has "Aufdecken" or "Verbergen". Revealing several at once: select the first, then "Alle verborgenen hier" offers the hidden creatures inside the same area.
- **"Spieleransicht"** switches the DM's board to exactly what players see, until switched back. It sends nothing.
- The DM's own view always shows hidden cells hatched and hidden creatures see-through, so they never forget what is still secret.

**What players see**

- Hidden cells are covered by an opaque fog: a dark, slightly cloudy texture without grid, terrain or elevation. The edge is softened on the revealed side, so nothing hidden peeks through.
- Tapping a hidden cell shows "Unerkundet", with no terrain or elevation.
- When cells are revealed, the fog fades away over about half a second, and creatures standing there fade in. When cells are hidden again, the fog fades back in and creatures there disappear.
- A creature the DM reveals fades in where it stands; one the DM hides fades out.
- **Characters are always visible to everyone**, also on hidden cells. Their owners need to see and move them, and the party knows where its members are.

**Moving in and out of the fog**

- A player can't choose a hidden cell as a target: the board treats it as not walkable, and the server rejects it with the same answer whatever the cell holds, so a rejected move doesn't tell a wall from a floor. A character that already stands in fog can move out of it, but not further into it.
- The session DM moves anything anywhere, as before.
- A creature that the DM moves from a hidden cell onto a revealed one appears at its target. One moved from a revealed cell into fog fades out where it stood, so players don't learn where it went.
- **Move previews** of the DM go to players only when both the token and the whole target are visible to them ([realtime sync](/decisions/realtime-sync.md)).

**Undo**

- The DM can undo the last fog change and the last creature reveal with "Rückgängig", like a move. Undoing a reveal hides the cells or creature again, but players have seen it, so the confirm step matters more than undo.

# Data

On the [encounter](/domain/encounter.md):

| Field | Type | Notes |
|-------|------|-------|
| `fog` | JSON document, nullable | Empty while fog is off. See below |
| `fogVersion` | int | Raised by every fog change at the table. Devices keep the fog with the higher version, as with token versions |

```json
{
  "hiddenCells": [[4, 0], [5, 0], [4, 1]],
  "areas": [
    { "id": "a1", "name": "Nordkammer", "cells": [[4, 0], [5, 0], [4, 1], [5, 1]] }
  ]
}
```

- `hiddenCells` is the truth; areas are only for picking. A 40×40 map has at most 1,600 cells, so the document stays small.
- Cells outside the map or `void` aren't listed.

On the [token](/domain/token.md), the existing `hidden` flag becomes live. The DM sets it in the editor and at the table; players' devices never receive a token while it is hidden.

Every change at the table is saved before it's broadcast, as for moves; nothing about fog lives only in memory ([realtime sync](/decisions/realtime-sync.md)). Fog and hidden flags stay as they are when a session ends and comes back with "Fortsetzen" ([session planning](/features/session-planning.md)). An ended encounter keeps its last fog.

# Keeping secrets on the wire

The server filters, the device doesn't hide. A player's device must never receive a hidden creature or the layout of a hidden cell, even in its network traffic or cache.

- **Board state for players**: the layout copy contains only revealed cells, plus every cell under a character. Hidden cells come as a list of coordinates without terrain, elevation or features. A feature is sent only once one of its cells is revealed, and then whole: a revealed half of a bridge shows the bridge. Entrances are sent only for revealed cells. Tokens contain only those visible to players.
- **Hub groups**: each encounter gets two groups, one for the session DM's connections and one for everyone else. Every event is built for each group; an event about something players can't see goes only to the DM group.
- **New hub messages**: `FogChanged` (players get the newly revealed cells with their layout and the creatures now visible, or the newly hidden cells and the ids of creatures that disappear); `TokenRevealed` (players get the whole token, as if it were added); `TokenHidden` (players get only the id). The DM gets the plain changes.
- **Moves**: a creature move goes to players as a `TokenMoved` if the creature is visible before and after, as a `TokenRevealed` if it becomes visible, and as a `TokenHidden` if it stops being visible.
- **Pings, arrows and statuses** (stage 9) go through the same filter: a ping on a hidden creature, an arrow starting at one and the statuses of hidden tokens reach only the DM group ([pings and arrows](/features/pings-and-arrows.md), [statuses](/features/statuses.md)).
- **Spectator screens** are always in the players' group, also when signed in as the session DM; filtering goes by connection, not by account, since one person often plays on a phone and watches on a tablet ([spectator view](/features/spectator-view.md)).
- **Labels**: a revealed "Goblin 3" tells players that two more goblins may exist. This is accepted; the DM can rename labels.
- **Session DM hand-over**: when another person takes over the session, both devices reload the board, since what they may see changed.

# Decisions

The project owner confirmed all six on 2026-10-16.

1. **Background image**: the image is one picture of the whole map, and serving a cut-out per fog state would mean rendering a new image for every reveal and losing the cache for good ([persistence](/decisions/persistence.md)). **Decided:** the whole background is sent and the fog covers it on the device. Someone who digs through the browser's cache can see the painted map, but not the layout, features or creatures behind the fog, which are what matter in play. Rejected for now: cutting the image into tiles of a few cells and serve only tiles that touch a revealed cell.
2. **Areas on the map or the encounter**: rooms are part of the map's shape, so areas could live on the [battle map](/domain/battle-map.md) and be reused. **Decided:** on the encounter, as the backlog proposed; a map is rarely fought on twice. Moving them later only means copying them.
3. **Characters in fog**: **Decided:** always visible to everyone. Not chosen: visible only to their owner and the DM, for a party that splits up.
4. **Players moving into fog**: **Decided:** not allowed. Not chosen: allowed, and the move reveals nothing; the DM decides whether to reveal.
5. **Monster spawn** ("three more goblins come through the door"), placing creatures that weren't prepared: **Decided:** stays in the [backlog](/backlog.md). Prepared ambushes are covered by hidden creatures.
6. **Schedule**: **Decided:** fog of war, hidden creatures included, is stage 10, together with the [spectator view](/features/spectator-view.md) ([implementation plan](/implementation-plan.md)).

# Manual gate (proposal)

- [ ] The DM prepares a crypt offline with only the entrance revealed, a named area "Nordkammer" and two hidden goblins in a revealed corridor, syncs and starts it.
- [ ] Phones show only the entrance and the characters; the goblins and the rest of the crypt are invisible, also after a reload, and the player's network traffic contains neither the goblins nor the hidden layout.
- [ ] The DM reveals "Nordkammer" with two taps; it fades in on every phone with the creature standing in it.
- [ ] The DM reveals one goblin from its info box; it fades in for everyone.
- [ ] A player can't move into the fog, and the rejection looks the same for a wall and a floor.
- [ ] The DM moves a revealed creature into the fog; players see it fade out where it stood.
- [ ] "Spieleransicht" on the DM's device matches a player's phone.
