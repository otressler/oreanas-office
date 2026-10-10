---
type: Domain Entity
title: User
description: A person who signs in; can be a player in one campaign and the DM in another.
tags: [domain, people]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:45:10Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `displayName` | string | Shown on tokens and in member lists |
| `email` | string | Used for sign-in ([auth decision](/decisions/auth.md)) |
| `isAdmin` | bool | Site admin (the project owner); can create password-reset links |
| `createdAt` | timestamp | |

Login data (password hash, linked Google account) is managed by the auth library, not by hand. Users sign in with a local account or Google ([auth](/decisions/auth.md)).

# Relationships

- Owns any number of [characters](/domain/character.md). A player can have several.
- Belongs to campaigns through [campaign member](/domain/campaign-member.md).
- Can be the DM of a [session](/domain/session.md).

A user isn't "a DM" or "a player" globally. The role depends on the campaign and the session.
