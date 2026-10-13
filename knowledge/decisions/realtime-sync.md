---
type: Decision
title: Realtime sync
description: The server holds the board state and pushes confirmed token moves to every device over in-process SignalR, inside a single app instance that scales to zero between sessions.
tags: [decision, realtime, architecture]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-13T22:20:29Z }
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

# As built (stage 4)

- **Hub**: `/hubs/table`. A device calls `JoinEncounter`, `MoveToken`, `UndoMove` and `MarkActive`; the server sends `TokenMoved`, `EncounterEnded` and `IdleTimeout`. The message types and method names are in `openapi.json`, so the frontend's types come from the same document as the API's.
- **Versions**: every move and undo raises the token's version. A device keeps whichever position has the higher version, so a move that arrives before a reloaded board isn't lost. Saving a move requires the version it read: two moves of the same token never interleave, and the later one wins.
- **Order on every (re)connect**: join the encounter's group, then reload the board.
- **Undo** is available while the user's latest move in the encounter isn't undone, the token still has that move's version, and the user may still move the token. The board tells each user whether they have one.
- **End of a fight**: when the session DM ends it, or the session ends, every device gets `EncounterEnded` and shows that the fight is over.
- **Idle**: "idle" means no call from the device. Touching the screen sends `MarkActive` at most once a minute, so someone who only watches stays connected. After 30 minutes without either, the server sends `IdleTimeout` and closes the connection a second later. The device then shows "Pausiert – tippe, um weiterzuspielen" and reconnects only when someone touches it or brings the app back.
- **Reconnects** retry after 0, 1, 2 and 5 seconds, then every 10 seconds, and not at all while the device is offline. When an attempt fails, the app checks whether the server is waking and shows the waking screen if it is.
- **Phone controls**: while a token is selected, every tap except one on that token picks a target, even a cell with another token on it, so the session DM can stack tokens too. To take a different token, the person lets go of the selected one first (tap it again, "Abbrechen" or Escape). Tapping a target previews it; tapping the preview again or "Hierhin" confirms.

# Alternatives considered

**Azure SignalR Service, Free tier.** It allows 20 concurrent connections and 20,000 outbound messages a day for $0. Each message delivered to each client counts, so one move broadcast to 7 devices is 7 messages. A 12-hour session with a few hundred moves fits, but there's little headroom for extra devices or live drag previews. The next tier (Standard) costs about $49 a month per unit, which exceeds the [hosting](/decisions/hosting.md) budget.

- **Default mode**: the app must stay connected to the service, so the container runs during sessions anyway. With a single instance, it only adds a component and limits.
- **Serverless mode**: clients stay connected to the service while the container can stop. Moves go through the API, so the first move after a quiet stretch waits for a cold start, possibly 10–60 s if the database also paused. That's bad at the table. Compute is already within the free grant, so there's little to save.

**Not chosen for now.** Revisit if the app ever needs more than one instance, or if Container Apps usage outgrows the free grant (serverless mode could then save compute).

**Undo through several moves** was offered and rejected in favour of only the last move.
