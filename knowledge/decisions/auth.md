---
type: Decision
title: Auth
description: Lightweight sign-in plus a campaign join code, so nobody fights with passwords on game night.
tags: [decision, auth, security]
decision: proposed
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Proposal

- Sign in with an emailed magic link or an existing account (for example Microsoft or Google), with no app-specific passwords.
- Join a campaign with its `joinCode` ([campaign](/domain/campaign.md)), which creates a [campaign member](/domain/campaign-member.md) with `role: player`.
- Devices stay signed in, so on game night players only open the app.

# Open

Which sign-in providers to offer depends on the [tech stack](/decisions/tech-stack.md) and hosting.
