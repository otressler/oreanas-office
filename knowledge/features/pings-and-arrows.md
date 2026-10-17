---
type: Feature
title: Pings and arrows
description: Players and the session DM point at a cell or a token, or draw an arrow, so everyone sees what they mean; broadcast live and never saved.
tags: [feature, players, dm, realtime, board]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-16T06:10:00Z }
---

# Goal

The remote version of pointing at the table. "I go there", "I attack that one", "watch out for the door": a player or the DM marks a spot, a token or a direction, and every device shows it for a few seconds. Planned for stage 9 ([implementation plan](/implementation-plan.md)); asked for by the project owner on 2026-10-16.

Pings and arrows mean nothing to the app. They don't move, select or target anything ([overview](/overview.md), "show, don't enforce").

# Gestures

Everything starts with a **double tap**: a tap, then a second touch within 300 ms and within about 30 CSS pixels of the first. What the second touch does decides the gesture:

| Second touch | On an empty cell | On a token |
|--------------|------------------|------------|
| Lifted at once | **Cell ping** | **Token ping**: the token is marked, not the cell |
| Dragged | **Arrow** from the first tap's cell to the cell where the finger lifts | **Arrow** that starts at the token |

With a mouse, a double click works the same way, and a double click held and dragged draws an arrow.

**The first tap is taken back.** The board acts on the first tap at once, as now, so single taps don't feel slow. When the second touch makes it a double tap, the board goes back to how it was before the first tap: a token card the first tap opened closes again, a selection it made is let go, and a preview it chose is dropped. So a double tap pings in every mode, including while a token is selected for moving, and **a quick double tap never confirms a move** by accident. To keep other devices from flickering, a move preview is sent to the others only once it has stood for 300 ms ([realtime sync](/decisions/realtime-sync.md)).

**Pinging a token in a stack.** A double tap on a stack marks the token drawn on top. To mark one underneath, the person opens the stack's [token card](/features/token-card.md) and uses "Zeigen" on its row.

**Holding** stays free. A long press does nothing, as today (see Notes).

# What everyone sees

- **Cell ping**: three rings pulse outwards from the cell for about 3 seconds, in the person's colour, with their name under it.
- **Token ping**: a ring of the same colour pulses around the token for about 3 seconds and moves with it if the token moves.
- **Arrow**: a thick arrow from cell centre to cell centre in the person's colour, with their name at its tail. It stays for 8 seconds, then fades. A person has at most one arrow at a time; a new one replaces their old one.
- **Off screen**: when a ping or arrow lies outside a device's current view, a small marker in its colour sits at the edge of the screen and points towards it while it lasts. Tapping the marker pans the board there.
- **The person's own device** shows their ping or arrow at once, without waiting for the server.

**Colours.** A player pings in the ring colour of their character in this fight; with several characters, the one added to the campaign first. The session DM pings in a fixed gold that no character has. Someone without a character in the fight pings in white.

# Rules

- Everyone in the encounter may ping and draw arrows: players, the session DM and other `dm` members. Spectators can't ([spectator view](/features/spectator-view.md)); a shared screen in local mode, which pings in white as "Tisch" ([shared table](/features/shared-table.md)).
- **Not saved.** Pings and arrows are sent to the others over the hub and live only on the devices. A device that joins later doesn't see the ones already shown. Nothing is written to the database, so they don't wake or keep anything ([hosting](/decisions/hosting.md)).
- **Rate limit**: at most three pings or arrows per person in two seconds. The server drops the rest without an error.
- Off while disconnected, like moving.
- With [fog of war](/features/fog-of-war.md) (stage 10): the session DM's ping on a hidden creature, and an arrow that starts at one, go only to the DM's devices. Pings on hidden cells are allowed and go to everyone; they show a spot, not what lies there.

# Hub

- Device → server: `Ping { encounterId, cell | tokenId }`; `DrawArrow { encounterId, fromCell | fromTokenId, to }`.
- Server → others in the encounter: `Pinged { userId, color, cell | tokenId }` and `ArrowDrawn { userId, color, fromCell | fromTokenId, to }`. The server checks that the cells lie inside the map and the token is on the encounter's board, and sets the colour, so a device can't ping as someone else.
- The board state lists every campaign member with their display name and ping colour (`people`), so a device draws its own pings at once in the right colour and names everyone's. The session DM's gold is `#f5b81c`; white is `#ffffff`.

# Discoverability

Double tap is invisible. The first time someone opens a fight on a device, a short hint at the bottom says "Doppeltippen: zeigen · Doppeltippen und ziehen: Pfeil" until they close it or ping once. The token card's "Zeigen" button does the same as a token ping, for people who never find the gesture.

# Notes

- The gesture tracker in `src/web/src/board/gestures.ts` already treats a press longer than 500 ms as no tap and kept holding "free for later (ping)". This design uses the double tap instead, because a long press is slow at the table and phones use it for text selection and the context menu. Holding stays unused.
- Browsers zoom on a double tap. The board already handles every touch itself, so this changes nothing outside the board.
- Free draw (lines that fade) stays in the [backlog](/backlog.md). Arrows are its simple, single-stroke part.

# As built (stage 9)

- The double tap is the gesture tracker's `takeBack`, `doubleTap` and `arrow` gestures, only on the fight page's board. A second touch held longer than 500 ms without moving does nothing, but the first tap is still taken back.
- A move confirmed by tapping its preview shows at once and is sent after 300 ms, so the second touch of a double tap can still take it back; the others keep seeing the preview until the move arrives. "Hierhin" sends at once.
- A token card that just opened lets taps through for 300 ms, and the board pans to make room for it only after that, so it never swallows the second touch.
- Off-screen markers are buttons at the edge of the uncovered board ("Zur Markierung von …"); an arrow counts as in view when either end is, and its marker points at its middle.
- A ping or arrow over the rate limit still reports success to the sender, whose device draws it; nobody else sees it.
- While the table isn't connected, a double tap or "Zeigen" only says "Ohne Verbindung zum Tisch lässt sich nichts zeigen."
- A removed character still counts for its player's ping colour, so the colour stays the same for the whole fight (open question for the project owner).
