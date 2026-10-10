---
type: Decision
title: Realtime sync
description: The server holds the board state and pushes moves to every device over WebSockets.
tags: [decision, realtime, architecture]
decision: proposed
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
---

# Proposal

- **The server is authoritative.** A device sends "move token T to (x, y)". The server checks permissions ([token](/domain/token.md)), saves the move and broadcasts it to everyone in the encounter.
- **Optimistic UI.** The mover's device shows the move at once and corrects itself if the server rejects it.
- **Transport:** WebSockets, one group per active encounter. With the .NET option of the [tech stack](/decisions/tech-stack.md), SignalR (or Azure SignalR Service when hosted) fits naturally. TypeScript stacks would use plain WebSockets or Socket.IO.
- **Reconnects:** after a reconnect, the device loads the full board state again rather than replaying missed events. Boards are small, so this is cheap and simple.
- **Conflicts:** the last move wins. Without turn order, two people rarely move the same token at once.

# Depends on

[Tech stack](/decisions/tech-stack.md).
