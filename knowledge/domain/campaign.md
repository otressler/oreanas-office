---
type: Domain Entity
title: Campaign
description: A running game with members, sessions, characters and a bestiary.
tags: [domain, campaign]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `name` | string | |
| `defaultDmUserId` | → [User](/domain/user.md) | New sessions start with this DM |
| `activeSessionId` | → [Session](/domain/session.md), nullable | At most one active session |
| `joinCode` | string | Players join with it ([auth decision](/decisions/auth.md)) |
| `createdAt` | timestamp | |

# Contains

- [Campaign members](/domain/campaign-member.md)
- [Sessions](/domain/session.md)
- [Characters](/domain/character.md)
- [Creature types](/domain/creature-type.md) (the campaign's bestiary)
- [Battle maps](/domain/battle-map.md) and prepared [encounters](/domain/encounter.md)

# Later

When the app grows into a campaign manager, lore (NPCs, places, factions) and session notes will hang off the campaign ([roadmap](/roadmap.md)).
