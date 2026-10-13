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
| `size` | enum | See [creature size](/rules/creature-size.md); usually Medium or Small |
| `tokenAssetId` | → [Asset](/domain/asset.md), nullable | Generated or uploaded portrait ([token icons](/features/token-icons.md)) |

# Permissions

A player creates and edits their own characters. Every `dm` member of the campaign can edit any character in it ([campaign member](/domain/campaign-member.md)).

# Notes

Deliberately thin: only what the board needs. Speed is out until the [distance rules](/backlog.md) come back (project owner, 2026-10-14). Full character sheets are a possible [campaign manager](/roadmap.md) feature, not part of the battle map app.
