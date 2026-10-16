---
type: Decision
title: OKF knowledge base
description: Project knowledge lives in this OKF bundle and is read before building.
tags: [decision, process]
decision: accepted
status: stable
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Decision

The project owner chose on 2026-10-10 to keep the app's spec (domain, features, rules, decisions) as an Open Knowledge Format v0.2 bundle in `knowledge/`.

# Consequences

- Claude sessions read the relevant concepts before implementing; the project `CLAUDE.md` says so.
- Decisions change here first, with an entry in the [update log](/log.md).
- When the app grows into a campaign suite, new topics get new folders ([roadmap](/roadmap.md)).

# Not decided

Whether the app itself will store campaign content (creatures, characters, maps) as OKF files. For now the app uses a database ([persistence](/decisions/persistence.md)).
