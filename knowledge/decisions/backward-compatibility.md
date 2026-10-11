---
type: Decision
title: Backward compatibility
description: Once production is confirmed, every release must keep working with older app versions still open on players' devices and with existing data.
tags: [decision, architecture, release, pwa]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-11T10:00:00Z }
---

# Decision (set by the project owner)

The PWA never reloads itself when a new version arrives. It shows a banner and the player decides when to reload, so a fight is never interrupted. The project owner accepted this on 2026-10-11, with one condition: **once production is confirmed, changes must be backward compatible.**

Production counts as confirmed when the project owner passes the stage 1 gate ([implementation plan](/implementation-plan.md)). Until then, breaking changes are fine.

# Why it matters here

- **Old app versions keep running.** A player who taps "Später" keeps using the old version against the new server for the rest of the evening, and an installed PWA can open an old cached version first.
- **Data lives on the server and in browsers.** The database holds every campaign. From stage 5, the DM's offline drafts sit in IndexedDB in whatever format the app version that wrote them used ([offline prep](/decisions/offline-prep-pwa.md)).

# Rules (proposed, apply from production confirmation)

1. **API and live sync messages change additively.** New endpoints, new optional fields and new SignalR messages are fine. Removing or renaming a field, or changing what it means, takes two releases: first stop using it, then remove it once no older app version can still be open (after the next game night at the earliest).
2. **Old clients ignore what they don't know.** The frontend ignores unknown fields and messages instead of failing.
3. **Database migrations expand, then contract.** Add columns and tables first. Drop or rename only in a later release, after the code no longer uses them. A migration never loses production data. Migrations run on startup, so each one must also work with the previous app version still running against the same database.
4. **Stored documents carry a version.** The [battle map](/domain/battle-map.md) layout and the IndexedDB drafts have a `schemaVersion`. Readers upgrade old versions when loading; nothing rewrites them in bulk.
5. **A way out when compatibility can't be kept.** The server announces the oldest app version it still supports. An older app shows the update banner as required ("Bitte neu laden") instead of offering "Später". Use this rarely.
6. **Checked automatically.** CI compares the OpenAPI document with the one on `main` and fails on breaking changes. Each stage's code review checks migrations and hub messages for compatibility.

Rules 5 and 6 get built in the first stage after production is confirmed (stage 2).
