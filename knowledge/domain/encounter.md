---
type: Domain Entity
title: Encounter
description: One fight — a battle map plus the tokens on it; prepared ahead and run during a session.
tags: [domain, fight]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `campaignId` | → [Campaign](/domain/campaign.md) | Encounters are prepared at campaign level |
| `sessionId` | → [Session](/domain/session.md), nullable | Set when the encounter is run |
| `battleMapId` | → [Battle map](/domain/battle-map.md) | |
| `name` | string | e.g. "Goblin ambush" |
| `status` | enum `draft` \| `ready` \| `active` \| `ended` | |

# Contains

[Tokens](/domain/token.md): creatures placed by the DM while preparing, and characters added when the fight starts.

# Lifecycle

1. **draft:** the DM builds it in the [map editor](/features/dm-map-editor.md).
2. **ready:** the map image is chosen and creatures are placed.
3. **active:** linked to the active session and set as `Session.activeEncounterId`. Players see it on the [playable map](/features/playable-map.md).
4. **ended:** read-only. Kept so the same map can be reused.
