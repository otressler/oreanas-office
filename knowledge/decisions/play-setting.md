---
type: Decision
title: Play setting
description: The app supports both an in-person table and remote players, in the same session.
tags: [decision, product]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T21:00:00Z }
---

# Question

Is everyone always at the same table, or do some players join remotely?

# Decision

Both. The app must work for a group sitting at one table, for a fully remote group, and for a mix of the two in the same session. The project owner also restated that the app stays simple and doesn't simulate the D&D rules: players and the DM decide what is possible ([overview](/overview.md)).

# Consequences

- **At the table:** a read-only "table view" for a TV or tablet becomes useful ([roadmap](/roadmap.md)). Voice and video aren't needed.
- **Remote:** pings and a link to the group's own voice call become more important ([playable map](/features/playable-map.md)). The app doesn't provide voice or video itself.
- **Mixed:** nothing in the board may depend on people seeing each other's screens or hands. Anything a player points at or reveals has to reach remote players through the app.
