---
type: Feature
title: Creature spawn
description: During a running fight, the session DM places creatures that weren't prepared, picked from the bestiary, numbered automatically and shown to players only after a confirm step, visible or hidden.
tags: [feature, dm, realtime, board, creatures]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-16T09:20:22Z }
---

# Goal

"Three more goblins come through the door." The session DM adds creatures to a running fight without stopping it or going back to the editor. Prepared ambushes are covered by hidden creatures in [fog of war](/features/fog-of-war.md); this is for creatures that weren't prepared. Moved from the [backlog](/backlog.md) ("Monster spawn") into stage 10 by the project owner on 2026-10-16 ([implementation plan](/implementation-plan.md)), which changes decision 5 of fog of war.

Proposals the project owner hasn't confirmed yet are marked with their question number in the [implementation plan](/implementation-plan.md).

# How the DM does it

1. **"Kreatur hinzufügen"** on the session DM's board opens a picker with the campaign's [creature types](/domain/creature-type.md), the ones used in this fight first. A type that doesn't exist yet can be made right there with only a name and a size; its icon and the rest come later in the bestiary (question 34).
2. **Placing**: the DM taps cells, one token per tap, until they tap "Fertig". Each tap shows the token at once on the DM's device only, see-through, with its label. Tapping a placed token again takes it away. Another type can be picked in between, so "two goblins and their wolf" is one spawn.
3. **The confirm bar** says "3 Kreaturen erscheinen lassen?" with "Erscheinen lassen" and "Abbrechen". Nothing reaches the players before that, like a fog change: a wrong tap on a phone mustn't give away an ambush.
4. **"Verborgen"** in the bar places them hidden: only the DM sees them until revealed, as for any hidden creature ([fog of war](/features/fog-of-war.md)). Creatures placed visibly on cells under fog stay invisible to players too, by the usual visibility rule.
5. After "Erscheinen lassen", the creatures fade in on every device that may see them. An undo bar "Rückgängig" for a few seconds takes the whole spawn off the board again, as [removing tokens](/features/removing-tokens.md) does.

# Rules

- **Only the session DM** spawns, like every action on creatures ([session](/domain/session.md)). Players, other `dm` members and the [shared screen](/features/shared-table.md) don't.
- **Where** (question 35): the whole footprint on walkable cells inside the map, as for a move's target. Spawned tokens may stand on other tokens, as moves may, since a crowded fight shouldn't block the DM; the editor's placement rule without overlap stays for preparing ([encounter](/domain/encounter.md)).
- **Labels** number themselves as in the editor: the next number after the highest one of that type in the encounter, removed tokens included, so a removed "Goblin 2" isn't reused ([token](/domain/token.md)).
- **Saved before broadcast**, in one step for the whole spawn, so players never see half of it ([realtime sync](/decisions/realtime-sync.md)). The tokens belong to the running encounter only; the reusable [battle map](/domain/battle-map.md) and the prepared encounter in the editor don't change.
- **Online only.** It happens at the table, so like moving it is off while disconnected. Preparing creatures offline stays in the editor ([offline prep](/decisions/offline-prep-pwa.md)).
- **Through the fog filter**: players get a `TokensAdded` with the spawned tokens they may see; the session DM's group gets all of them ([fog of war](/features/fog-of-war.md)).

# Not included

- Adding a character who arrives late in the evening: that is a character token, placed by the session DM. It would reuse the same placing and could be added later.
- Copying a creature already on the board. The picker's "used in this fight first" covers most of it.

# Gate

- [ ] Mid-fight, the DM adds two goblins and a wolf from the bestiary by tapping three cells; phones see nothing until "Erscheinen lassen", then all three fade in at once as "Goblin 4", "Goblin 5" and "Wolf 1".
- [ ] "Rückgängig" right after takes all three off again on every device.
- [ ] The DM spawns a creature with "Verborgen"; phones and the spectator screen don't get it, also in their network traffic, until the DM reveals it.
- [ ] The DM makes a new type "Schattenwesen" in the picker with only a name and a size and spawns it; it shows its letter until it gets an icon in the bestiary.
- [ ] A player has no "Kreatur hinzufügen".
