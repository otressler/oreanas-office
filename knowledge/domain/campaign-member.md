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
| `role` | enum `dm` \| `player` | `dm` members may be chosen to run a session and prepare maps. A session's encounters are prepared by its DM. Actions at the table belong to the session DM alone ([session](/domain/session.md)) |
| `joinedAt` | timestamp | |

# Notes

- Leaving a campaign and removing members aren't supported yet.
- Any member can turn a device into a session's spectator screen; people outside the campaign watch through a session spectator entry instead of a membership ([session](/domain/session.md), [spectator view](/features/spectator-view.md), stage 10). Later (stage 9): each `dm` member has their own status list ([statuses](/features/statuses.md)).
- The campaign's default DM always has `role: dm`.
- Who runs a specific night is stored on the [session](/domain/session.md) (`dmUserId`), so a `dm` member can hand over to another `dm` member for one session.
