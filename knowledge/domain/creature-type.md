---
type: Domain Entity
title: Creature type
description: Reusable monster template with size, speed and icon — the campaign's bestiary.
tags: [domain, fight, tokens]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `campaignId` | → [Campaign](/domain/campaign.md) | One bestiary per campaign for now |
| `name` | string | e.g. "Goblin" |
| `size` | enum | Sets the token footprint ([creature size](/rules/creature-size.md)) |
| `speed` | int, feet | For the DM's movement hint |
| `appearance` | text | Short visual description that feeds the icon prompt |
| `iconAssetId` | → [Asset](/domain/asset.md), nullable | One icon per type ([token icons](/features/token-icons.md)) |
| `notes` | text | DM-only notes |

# Notes

Every goblin on the board is a [token](/domain/token.md) pointing to this type, labelled "Goblin 1", "Goblin 2" and so on. Stat blocks and HP are out of scope for now ([roadmap](/roadmap.md), phase 4).
