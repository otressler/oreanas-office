---
type: Domain Entity
title: Creature type
description: Reusable monster template with size and icon — the campaign's bestiary.
tags: [domain, fight, tokens]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T20:30:00Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `campaignId` | → [Campaign](/domain/campaign.md) | One bestiary per campaign for now |
| `name` | string | e.g. "Goblin" |
| `size` | enum | Sets the token footprint ([creature size](/rules/creature-size.md)) |
| `appearance` | text | Short visual description that feeds the icon prompt |
| `iconAssetId` | → [Asset](/domain/asset.md), nullable | The picked icon version. Regenerating adds versions to pick from ([token icons](/features/token-icons.md)) |
| `notes` | text | DM-only notes |
| `archivedAt` | timestamp, nullable | Set when a `dm` member archives the type. Archived types can't be picked for new tokens; placed tokens keep them. Types are never deleted and can be brought back |

# Notes

Every goblin on the board is a [token](/domain/token.md) pointing to this type, labelled "Goblin 1", "Goblin 2" and so on. Stat blocks and HP are out of scope for now ([roadmap](/roadmap.md), phase 4). Speed is out until the [distance rules](/backlog.md) come back (project owner, 2026-10-14).

Names are unique per campaign, ignoring case. When a type created offline meets a taken name at sync, the DM chooses between using the existing type and renaming their own ([offline prep](/decisions/offline-prep-pwa.md)).
