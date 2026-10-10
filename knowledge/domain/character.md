---
type: Domain Entity
title: Character
description: A player character owned by one user in one campaign.
tags: [domain, people, tokens]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T20:30:00Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `ownerUserId` | → [User](/domain/user.md) | Only the owner (and the DM) can move this character's token |
| `campaignId` | → [Campaign](/domain/campaign.md) | Characters are campaign-specific |
| `name` | string | |
| `speed` | int, squares | Walking speed for the movement hint. Entered and shown in meters: 6 squares = 9 m ([movement rules](/rules/movement-distance.md)) |
| `size` | enum | See [creature size](/rules/creature-size.md); usually Medium or Small |
| `tokenAssetId` | → [Asset](/domain/asset.md), nullable | Generated or uploaded portrait ([token icons](/features/token-icons.md)) |

# Notes

Deliberately thin: only what the board needs. Full character sheets are a possible [campaign manager](/roadmap.md) feature, not part of the battle map app.
