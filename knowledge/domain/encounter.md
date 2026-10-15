---
type: Domain Entity
title: Encounter
description: One fight — a battle map plus the tokens on it; planned for a session and run during it.
tags: [domain, fight]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-14T21:55:33Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `campaignId` | → [Campaign](/domain/campaign.md) | Kept next to the session for sync and checks; always the session's campaign |
| `sessionId` | → [Session](/domain/session.md) | Required. The session the fight is planned for and runs in. Changes only while `draft` or `ready` (moving to another session) |
| `battleMapId` | → [Battle map](/domain/battle-map.md) | |
| `name` | string | e.g. "Goblin ambush" |
| `status` | enum `draft` \| `ready` \| `active` \| `ended` | |
| `layout` | JSON document, nullable | A copy of the battle map's layout, saved when the encounter starts. The live fight and the ended encounter use this copy, so later edits to the map never change them |
| `backgroundAssetId` | → [Asset](/domain/asset.md), nullable | The map's picked background, saved together with `layout` when the encounter starts. Picking another version on the map later doesn't change a running or ended fight. Empty when the map had no usable background |
| `archivedAt` | timestamp, nullable | Set when a `dm` member archives the encounter |

# Contains

[Tokens](/domain/token.md): creatures placed by the DM while preparing, and characters added when the fight starts.

# Lifecycle

1. **draft:** the session DM adds it to a session and builds it in the [map editor](/features/dm-map-editor.md) ([session planning](/features/session-planning.md)).
2. **ready:** the session DM marks it ready by hand. Every creature must be validly placed; an image isn't needed, since the plain rendering works. Only ready encounters can be started. An imported encounter starts here, because the [import file](/domain/battle-map.md) is already complete.
3. **active:** the session DM starts it while its own session is active (see Starting). Players see it on the [playable map](/features/playable-map.md) from then on.
4. **ended:** the session DM ends it, and everyone returns to the session page. Ending a session also ends its active encounter; continuing the session makes that one active again ([session](/domain/session.md)). Otherwise an ended encounter stays ended and is read-only. To fight on the same map again, the DM creates a new encounter from it.

# Who does what

- The session DM prepares the session's encounters: adds them, places creatures, marks them ready, archives them and moves them to another session they run. Other `dm` members see them read-only. Prepared encounters are visible only to `dm` members.
- Maps stay campaign-wide: any `dm` member edits them ([battle map](/domain/battle-map.md)), which changes every draft and ready encounter on them.
- Encounters are never deleted. The session DM archives one and can bring it back. An archived encounter can't be started.
- **When the map changes:** draft and ready encounters use the current map. The editor marks creatures that now stand where they may not, and the encounter can't be marked ready or started until they're moved. Active and ended encounters keep their own copy of the layout and background.
- Only the session DM starts and ends an encounter ([session](/domain/session.md)).
- A session has at most one active encounter. Like the active session, it isn't stored as a column: it is the encounter with `status: active`, and a unique index allows at most one per session.

# Starting

Starting is a setup screen for the session DM. They tick the characters taking part and place each one by tapping the character and then a cell. Placing and starting are one step: the character tokens are created together with the switch to `active`, so players never see half-placed tokens. Characters who join later, and any change of position, use normal moves.

**Placement rule:** the token's whole footprint ([creature size](/rules/creature-size.md)) lies inside the map on walkable cells, and it doesn't overlap another token. A cell is walkable if its terrain isn't `void` or `wall` and no feature with `blocksMovement: true` covers it. A feature with `blocksMovement: false` makes the cells under it walkable, whatever the terrain (the bridge over the gorge; [implementation plan](/implementation-plan.md), question 6). The token's elevation is the highest elevation under its footprint, counting such a feature's elevation.
