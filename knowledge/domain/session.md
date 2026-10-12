---
type: Domain Entity
title: Session
description: One game night with its own DM; at most one is active per campaign.
tags: [domain, campaign]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `campaignId` | → [Campaign](/domain/campaign.md) | |
| `title` | string | e.g. "Session 12 — The Rope Bridge" |
| `date` | date | |
| `dmUserId` | → [User](/domain/user.md) | Defaults to `Campaign.defaultDmUserId` |
| `createdByUserId` | → [User](/domain/user.md) | Kept separate from the DM |
| `status` | enum `planned` \| `active` \| `ended` | |
| `activeEncounterId` | → [Encounter](/domain/encounter.md), nullable | At most one active encounter |

# Rules

- Any `dm` member of the campaign can create a session ([campaign member](/domain/campaign-member.md)).
- The session DM or the campaign's default DM makes it active, changes its DM to another `dm` member, and ends it. This is the only right the default DM has over a session they don't run: it keeps a session from getting stuck when its DM is absent.
- Only one session per campaign is active (`Campaign.activeSessionId`).
- Only the session DM can start and end encounters, move creature tokens and other players' characters, and see hidden tokens.
- Everyone else in the campaign is a player for this session, including the default DM and other `dm` members. The campaign role doesn't grant any action at the table.

# Notes

Session attendance isn't modelled. Who takes part in a fight comes from the [tokens](/domain/token.md) on the encounter.

# Later

A `playMode` field, `byod` (default) or `local`, set by the session DM. It decides whether a table view may move every player character ([backlog](/backlog.md)).
