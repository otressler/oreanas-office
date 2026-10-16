---
type: Domain Entity
title: Status
description: A status definition (one of the 15 conditions or a custom one), the status lists that hold them for characters and DMs, and the statuses set on tokens.
tags: [domain, fight, tokens, statuses]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-16T06:10:00Z }
---

# Status definition

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `libraryKey` | string, nullable | One of the 15 condition keys (`prone`, `exhaustion`…) for library statuses; empty for custom ones ([statuses](/features/statuses.md)) |
| `campaignId` | → [Campaign](/domain/campaign.md), nullable | Empty for library statuses, which exist once for the whole site |
| `name` | string | German. Library names come from the app's text file, not the database |
| `iconDescription` | text, nullable | What the icon shows; feeds the icon prompt of a custom status |
| `hasLevels` | bool | True for Exhaustion; a custom status can have levels too |
| `iconAssetId` | → [Asset](/domain/asset.md), nullable | The picked icon version of a custom status. Library icons are static files of the app instead |
| `characterId` | → [Character](/domain/character.md), nullable | Custom statuses: the character whose status list it was made in; empty when it was made in a DM status list. Whoever may edit that character generates and picks its icon; for a DM's status, any `dm` member |
| `createdByUserId` | → [User](/domain/user.md), nullable | |

Definitions are never deleted, so a token's status always has a name and an icon.

# Status list

One row per list, made the first time the list is read, with all 15 conditions. Until then the list doesn't exist, so a list its owner emptied stays empty instead of filling up again (stage 9 contract, 2026-10-16).

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `characterId` | → [Character](/domain/character.md), nullable | Set for a character's status list |
| `campaignId` | → [Campaign](/domain/campaign.md) | Always set: the character's campaign, or the DM's |
| `userId` | → [User](/domain/user.md), nullable | Set for a DM's own status list |

Exactly one of `characterId` and `userId` is set; a character has at most one list, and a `dm` member at most one per campaign.

# Status list entry

| Field | Type | Notes |
|-------|------|-------|
| `statusListId` | → Status list | Key, together with `statusId` |
| `statusId` | → Status definition | |
| `position` | int | The owner's order |

A status appears at most once per status list.

# Token status

| Field | Type | Notes |
|-------|------|-------|
| `tokenId` | → [Token](/domain/token.md) | Key, together with `statusId` |
| `statusId` | → Status definition | |
| `level` | int, nullable | 1–6, only for statuses with levels |
| `appliedByUserId` | → [User](/domain/user.md) | Shown on the [token card](/features/token-card.md); decides who may remove it |
| `fromSharedScreen` | bool | Later (stage 10): put on from a shared screen in local mode, which then may remove it; the card names "Tisch" ([shared table](/features/shared-table.md)) |
| `appliedAt` | timestamp | |
