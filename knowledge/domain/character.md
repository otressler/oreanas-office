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
| `appearance` | text, nullable | Short visual description that feeds the portrait prompt, as on a [creature type](/domain/creature-type.md) |
| `tokenAssetId` | → [Asset](/domain/asset.md), nullable | The picked portrait version: generated, uploaded or restyled from an upload ([token icons](/features/token-icons.md)) |
| `color` | string, nullable | The ring colour its player picked, `#rrggbb` in lower case. Null keeps the default colour by the order characters were added ([token](/domain/token.md)). Characters may share a colour; the app doesn't check, and the DM sorts it out at the table (project owner, 2026-10-16). Added to stage 8 after its merge |

Later (stage 9): a status list, the list of statuses its player picks from ([statuses](/features/statuses.md), [status](/domain/status.md)).

# Permissions

A player creates and edits their own characters, colour included. Every `dm` member of the campaign can edit any character in it ([campaign member](/domain/campaign-member.md)). Whoever can edit a character can also upload, generate and pick its portrait; generating counts against the site-wide [image budget](/decisions/image-budget.md).

# Notes

Deliberately thin: only what the board needs. Speed is out until the [distance rules](/backlog.md) come back (project owner, 2026-10-14). Full character sheets are part of the campaign management focus area in the [backlog](/backlog.md).
