---
type: Domain Entity
title: Registration invite
description: A time-limited link from the site admin that lets people create an account.
tags: [domain, people, auth]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-11T14:25:54Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `tokenHash` | string | Hash of the random token in the link; the token itself is never stored |
| `createdByUserId` | → [User](/domain/user.md) | Always the site admin (`isAdmin`) |
| `createdAt` | timestamp | |
| `expiresAt` | timestamp | Always `createdAt` + 4 hours |
| `revokedAt` | timestamp, nullable | Set when the admin revokes the link early |

# Rules

- The link has the form `/einladung/<token>`. It is valid until `expiresAt` unless revoked, and any number of people can register with it ([auth](/decisions/auth.md)).
- It's needed both for a local registration and for a first Google sign-in that would create an account. Existing accounts never need it, and neither does the first Google sign-in of the configured admin address ([auth](/decisions/auth.md)).
- It creates only the account. Joining a campaign still uses the [campaign](/domain/campaign.md)'s join code.
