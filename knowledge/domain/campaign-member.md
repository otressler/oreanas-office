---
type: Domain Entity
title: Campaign member
description: Links a user to a campaign with a role.
tags: [domain, people, permissions]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `campaignId` | → [Campaign](/domain/campaign.md) | Key, together with `userId` |
| `userId` | → [User](/domain/user.md) | |
| `role` | enum `dm` \| `player` | `dm` members may run sessions and edit maps |
| `joinedAt` | timestamp | |

# Notes

- The campaign's default DM always has `role: dm`.
- Who runs a specific night is stored on the [session](/domain/session.md) (`dmUserId`), so a `dm` member can hand over to another `dm` member for one session.
