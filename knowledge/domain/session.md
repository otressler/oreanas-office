---
type: Domain Entity
title: Session
description: One game night with its own DM and its planned fights; at most one is active per campaign.
tags: [domain, campaign]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-14T21:55:33Z }
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
| `status` | enum `planned` \| `active` \| `ended` | An ended session can become `active` again (see Continuing) |
| `activeEncounterId` | → [Encounter](/domain/encounter.md), nullable | At most one active encounter. Not stored as a column: it is the encounter with `status: active` and this `sessionId`, and a unique index in the database allows at most one per session |
| `interruptedEncounterId` | → [Encounter](/domain/encounter.md), nullable | The fight that was running when the session ended. Set by ending, cleared by continuing |

# Contains

[Encounters](/domain/encounter.md): every fight belongs to exactly one session, planned ahead or added at the table ([session planning](/features/session-planning.md)).

# Rules

- Any `dm` member of the campaign can create a session ([campaign member](/domain/campaign-member.md)).
- The session DM or the campaign's default DM makes it active, changes its DM to another `dm` member, ends it, and continues it after it ended. This is the only right the default DM has over a session they don't run: it keeps a session from getting stuck when its DM is absent.
- Only one session per campaign is active (`Campaign.activeSessionId`). Ending a session ends its active encounter and remembers it as `interruptedEncounterId`.
- The session DM plans the session: adds fights, edits and archives them, moves draft and ready fights to another planned or running session they run, and edits the title and date. Other `dm` members, the default DM included, see the planned fights but don't change them. When the DM role is handed over, the new DM takes over the fights. Fights are added only to planned and running sessions; an ended one must be continued first.
- Only the session DM can start and end encounters, move creature tokens and other players' characters, and see hidden tokens.
- Everyone else in the campaign is a player for this session, including the default DM and other `dm` members. The campaign role doesn't grant any action at the table.

# Spectators (stage 10)

People who aren't members of the campaign can watch one session on a spectator screen after joining it with its QR code, link or the campaign's join code ([spectator view](/features/spectator-view.md)). Each such join is a **session spectator** entry: `sessionId`, `userId`, `joinedAt`. It allows only watching that session's running fight, as players see it, also after the session is continued, and nothing else in the campaign. Members need no entry.

# Continuing

An ended session can be made `active` again when the group didn't get through it in one evening ([session planning](/features/session-planning.md)). The rule of one active session per campaign applies. If `interruptedEncounterId` is set, that encounter becomes `active` again in the same step, with its tokens where they stood, and the field is cleared. Encounters the DM ended by hand stay ended. The date doesn't change.

# Notes

Session attendance isn't modelled. Who takes part in a fight comes from the [tokens](/domain/token.md) on the encounter.

# Later

Stage 10: a `playMode` field, `byod` ("Eigene Geräte", default) or `local` ("Gemeinsamer Bildschirm"), set by the session DM on the session page, also during a fight. In local mode, a spectator screen opened by a campaign member moves every player character ([shared table](/features/shared-table.md)).
