---
type: Decision
title: Tech stack
description: Choose between a .NET and a TypeScript stack; blocks phase 1 of the roadmap.
tags: [decision, architecture]
decision: open
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Options

| | .NET | TypeScript |
|---|------|------------|
| Backend | ASP.NET Core | Node (e.g. SvelteKit or Next.js server) |
| Realtime | SignalR / Azure SignalR Service | WebSockets or Socket.IO |
| Frontend | Blazor, or a TypeScript frontend | SvelteKit or Next.js |
| Board rendering | Canvas library via JS (e.g. Konva) | Konva or PixiJS |
| Fit with Microsoft Foundry and Azure | Very good | Good |

Both are fine for this app. The main question is which language the developers prefer.

# Needed for

[Realtime sync](/decisions/realtime-sync.md), [persistence](/decisions/persistence.md), [auth](/decisions/auth.md) and phase 1 of the [roadmap](/roadmap.md).
