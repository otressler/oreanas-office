---
type: Domain Entity
title: Token
description: A character or creature placed on an encounter's grid; the live, synced state of the board.
tags: [domain, fight, tokens, realtime]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `encounterId` | → [Encounter](/domain/encounter.md) | |
| `kind` | enum `character` \| `creature` | |
| `characterId` | → [Character](/domain/character.md), nullable | Set when `kind = character` |
| `creatureTypeId` | → [Creature type](/domain/creature-type.md), nullable | Set when `kind = creature` |
| `label` | string | e.g. "Goblin 3". Auto-numbered per creature type |
| `x`, `y` | int, cells | Top-left cell of the footprint |
| `elevation` | int, feet | Defaults to the cell's elevation. Changeable for flying or climbing |
| `hidden` | bool | Later: visible only to the DM until revealed |

Size, speed and image come from the linked character or creature type.

# Who can move it

- `character` tokens: the character's owner and the session DM.
- `creature` tokens: the session DM only.

There are no turn-order or distance restrictions ([overview](/overview.md)).

# Move history

Every move is recorded as `{ tokenId, from, to, byUserId, at }`. This gives an "undo last move", which matters on phones where taps go wrong. Moves are broadcast to everyone in real time ([realtime sync](/decisions/realtime-sync.md)).

# Later

HP, conditions and the hidden flag are phase 4 ([roadmap](/roadmap.md)).
