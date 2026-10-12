---
type: Decision
title: Realtime sync
description: The server holds the board state and pushes confirmed token moves to every device over in-process SignalR, inside a single app instance that scales to zero between sessions.
tags: [decision, realtime, architecture]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-12T20:46:29Z }
---

# Decision

- **The server is authoritative.** A device sends "move token T to (x, y)". The server checks permissions ([token](/domain/token.md)) and the target cell (below), saves the move and broadcasts it to everyone in the encounter.
- **Optimistic UI.** The mover's device shows the move at once and puts the token back if the server rejects it.
- **Transport**: WebSockets, one group per active encounter, running **inside the app**. [Hosting](/decisions/hosting.md) runs at most one replica, so the in-process option is enough: ASP.NET Core SignalR ([tech stack](/decisions/tech-stack.md)), with the `@microsoft/signalr` client in the browser ([frontend stack](/decisions/frontend-stack.md)). Azure SignalR Service was considered; see below.
- **Database first**: every move is saved before it's broadcast. The container can stop between sessions, so on start the board is loaded from the database. Nothing polls the database.
- **Only confirmed moves are sent.** Selecting a token and choosing a target stay on the device; other devices see nothing until the move is confirmed.
- **Where a token may go**: the whole footprint must lie inside the map on walkable cells, as defined by the [placement rule](/domain/encounter.md): no `wall` or `void`, no blocking feature, and a non-blocking feature such as a bridge counts as walkable. Unlike placement, tokens may overlap. The token takes the elevation under its new footprint, as on placement. This is the only check on the target; there are no distance or turn-order limits ([playable map](/features/playable-map.md)).
- **Undo**: a user can undo only their own last move, and only while it is still that token's latest move. Once anyone has moved the token again, the undo is gone. The session DM can't undo other people's moves; they move the token back instead. Undo for the DM stays in the [backlog](/backlog.md).
- **Conflicts**: the last move wins. Without turn order, two people rarely move the same token at once. The earlier mover's device simply shows the newer position.
- **Disconnected**: while the device has no connection, including during a cold start, moving is switched off. A small indicator shows the connection state. Moves are never queued.
- **Reconnects**: after a reconnect, including after a cold start, the device reloads the full board state instead of replaying missed events. Boards are small, so this is cheap.
- **Background tabs**: the client closes its connection when the app goes to the background and reconnects when it's visible again. The server drops connections idle for 30 minutes. Both stop a forgotten tab from keeping the container awake.
- **On other devices** a moved token slides to its new cell in about 200 ms rather than jumping, so people notice what changed.

# Alternatives considered

**Azure SignalR Service, Free tier.** It allows 20 concurrent connections and 20,000 outbound messages a day for $0. Each message delivered to each client counts, so one move broadcast to 7 devices is 7 messages. A 12-hour session with a few hundred moves fits, but there's little headroom for extra devices or live drag previews. The next tier (Standard) costs about $49 a month per unit, which exceeds the [hosting](/decisions/hosting.md) budget.

- **Default mode**: the app must stay connected to the service, so the container runs during sessions anyway. With a single instance, it only adds a component and limits.
- **Serverless mode**: clients stay connected to the service while the container can stop. Moves go through the API, so the first move after a quiet stretch waits for a cold start, possibly 10–60 s if the database also paused. That's bad at the table. Compute is already within the free grant, so there's little to save.

**Not chosen for now.** Revisit if the app ever needs more than one instance, or if Container Apps usage outgrows the free grant (serverless mode could then save compute).

**Undo through several moves** was offered and rejected in favour of only the last move.
