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
| `label` | string | e.g. "Goblin 3". Numbered automatically per creature type within the encounter: the next number after the highest one, so a removed "Goblin 2" isn't reused. The DM can rename any label |
| `x`, `y` | int, cells | Top-left cell of the footprint |
| `elevation` | decimal, meters | Defaults to the cell's elevation. Changeable for flying or climbing |
| `hidden` | bool | Later: visible only to the DM until revealed |

The image comes from the linked character or creature type: always its currently picked version, also in a running fight. A changed image shows the next time a board loads ([token icons](/features/token-icons.md)). On the board, a character's token has a ring in a fixed colour picked by the order characters were added to the campaign; creatures share one red ring. Until images arrive, a token shows the first letter of its label. Creatures that share a letter show it with a number instead (S1, S2, S3), counted in the natural order of their labels, so "Goblin 1" and "Goblin 2" become G1 and G2. Characters keep the plain letter; their ring colours tell them apart. Each player sees their own characters drawn on top of any other token.

# Who can move it

- `character` tokens: the character's owner and the session DM.
- `creature` tokens: the session DM only.
- Later, in local mode: a table view device moves every `character` token, whoever owns it. In bring-your-own-device mode it can't move any ([backlog](/backlog.md)).

There are no turn-order or distance restrictions ([overview](/overview.md)). The only check is the target: the whole footprint inside the map on walkable cells, as for [placement](/domain/encounter.md), except that tokens may overlap ([realtime sync](/decisions/realtime-sync.md)).

# Move history

Every move is recorded as `{ tokenId, from, to, byUserId, at, version }`, positions with their elevation; undoing a move marks it undone. The token itself counts its moves and undos in a `version`, which devices use to tell the newer position ([realtime sync](/decisions/realtime-sync.md)). This gives an "undo last move", which matters on phones where taps go wrong: a user undoes only their own last move, and only while it is still that token's latest move. Moves are broadcast to everyone in real time ([realtime sync](/decisions/realtime-sync.md)).

# Later

HP, conditions and the hidden flag are phase 4 ([roadmap](/roadmap.md)).
