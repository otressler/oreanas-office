---
type: Domain Entity
title: Token
description: A character or creature placed on an encounter's grid; the live, synced state of the board.
tags: [domain, fight, tokens, realtime]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-14T07:50:00Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `encounterId` | → [Encounter](/domain/encounter.md) | |
| `kind` | enum `character` \| `creature` | |
| `characterId` | → [Character](/domain/character.md), nullable | Set when `kind = character` |
| `creatureTypeId` | → [Creature type](/domain/creature-type.md), nullable | Set when `kind = creature` |
| `size` | enum | Copied from the character or creature type when the token is created. Changing the type's size later affects only new tokens ([creature size](/rules/creature-size.md)) |
| `label` | string | e.g. "Goblin 3". Numbered automatically per creature type within the encounter: the next number after the highest one, so a removed "Goblin 2" isn't reused. The DM can rename any label. Later (stage 10), in an encounter with fog, the number is given when players first see the creature and an unseen creature has none ([fog of war](/features/fog-of-war.md), "Creature numbers") |
| `x`, `y` | int, cells | Top-left cell of the footprint |
| `elevation` | decimal, meters | Defaults to the cell's elevation. Changeable for flying or climbing |
| `hidden` | bool | Later: visible only to the session DM until revealed ([fog of war](/features/fog-of-war.md)) |
| `initiativeModifier`, `initiativeAdvantage` | int, bool; nullable | A creature's own initiative settings, set in the map editor; null takes the creature type's. Always null for characters ([initiative](/features/initiative.md)) |
| `removedAt`, `removedByUserId` | timestamp, → [User](/domain/user.md); nullable | Later (stage 9): set when the session DM takes the token off the board. It disappears from every board but is kept, and can be brought back ([removing tokens](/features/removing-tokens.md)) |

The image comes from the linked character or creature type: always its currently picked version, also in a running fight. A changed image shows the next time a board loads ([token icons](/features/token-icons.md)). On the board, a character's token has a ring in the colour its player picked ([character](/domain/character.md) `color`), or else one of eight default colours picked by the order characters were added to the campaign, repeating from the ninth; creatures share one red ring. Until images arrive, a token shows the first letter of its label. Creatures that share a letter show it with a number instead (S1, S2, S3), counted in the natural order of their labels, so "Goblin 1" and "Goblin 2" become G1 and G2. Characters keep the plain letter; their ring colours tell them apart. Each player sees the characters they play in this session drawn on top of any other token.

# Who can move it

- `character` tokens: whoever plays the character in this session (its owner, unless the session DM handed it to someone else; [character](/domain/character.md), "Who plays it") and the session DM.
- `creature` tokens: the session DM only.
- Later (stage 10), in local mode: a shared screen, a device a campaign member opened in that mode (not a spectator screen), moves every `character` token in the fight, whoever owns it. In bring-your-own-device mode it moves none ([shared table](/features/shared-table.md)).

There are no turn-order or distance restrictions ([overview](/overview.md)). The only check is the target: the whole footprint inside the map on walkable cells, as for [placement](/domain/encounter.md), except that tokens may overlap ([realtime sync](/decisions/realtime-sync.md)).

# Move history

Every move is recorded as `{ tokenId, from, to, byUserId, at, version }`, positions with their elevation; undoing a move marks it undone. Later (stage 10), a move also records `fromSharedScreen`, and a shared screen undoes only the last move made from a shared screen ([shared table](/features/shared-table.md)). The token itself counts its moves and undos in a `version`, which devices use to tell the newer position ([realtime sync](/decisions/realtime-sync.md)). This gives an "undo last move", which matters on phones where taps go wrong: a user undoes only their own last move, and only while it is still that token's latest move. Moves are broadcast to everyone in real time ([realtime sync](/decisions/realtime-sync.md)).

# Later

Statuses and removing tokens come in stage 9 ([statuses](/features/statuses.md), [status](/domain/status.md), [removing tokens](/features/removing-tokens.md)), the hidden flag in stage 10 ([fog of war](/features/fog-of-war.md)). HP is in the [backlog](/backlog.md).

# As built (stage 10)

The label is stored as `number` and `label` (the DM's own name, empty for numbered creatures); `CreatureLabels` shows "Goblin 3" or the name. The migration split existing labels. The sync format still sends one string.
