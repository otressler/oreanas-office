---
type: Feature
title: Removing tokens
description: The session DM takes a defeated or departed token off the board during play; it disappears for everyone, keeps its history, and can be brought back.
tags: [feature, dm, board, realtime]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-16T07:55:00Z }
---

# Goal

When the ghost is defeated, it leaves the board. Asked for by the project owner on 2026-10-16; planned for stage 9, with the [token card](/features/token-card.md) that holds the button ([implementation plan](/implementation-plan.md), question 27, confirmed on 2026-10-16). It takes "Remove tokens" out of the [backlog](/backlog.md).

# Rules

- **Only the session DM** removes tokens, creatures and characters alike: a defeated monster, a summoned creature that vanishes, a character whose player goes home early. Players can't ([session](/domain/session.md)).
- **Removing hides, it doesn't delete.** The token gets `removedAt` and stays in the database with its move history and statuses, so the fight's record stays whole and the token can come back ([token](/domain/token.md)).
- **Labels aren't reused.** A new "Goblin" after a removed "Goblin 2" still gets the next number after the highest ([token](/domain/token.md)).
- A creature that's down but still lies there, such as an unconscious character, keeps its token and gets the "Bewusstlos" status instead ([statuses](/features/statuses.md)). Removing is for tokens that leave the board.

# At the table

- **"Vom Feld nehmen"** on the token card, for the session DM. On a stack, each row has it. There is no confirm step, because the next point makes a mistake cheap.
- **Undo**: right after removing, a bar at the bottom of the DM's screen says "Goblin 3 vom Feld genommen" with "Rückgängig" for about 8 seconds.
- **Brought back later**: the DM's board menu has "Vom Feld genommen", a list of the fight's removed tokens, newest first. "Zurückholen" puts a token back on the cell it left. The layout of a running fight never changes, so that cell is always valid; overlapping is allowed as for moves.
- **What others see**: the token fades out over about half a second. A token that comes back fades in.
- A move preview of the token disappears, and a player's undo of their last move of a removed character is gone.

# Data and hub

- [Token](/domain/token.md): `removedAt` and `removedByUserId`, both nullable.
- Device → server: `RemoveToken { tokenId }` and `RestoreToken { tokenId }`. Server → everyone in the encounter: `TokenRemoved { tokenId }` and `TokenRestored { token }`. Saved before broadcast ([realtime sync](/decisions/realtime-sync.md)).
- Board state leaves removed tokens out. The session DM's board state also carries the list of removed tokens for "Vom Feld genommen".
- With [fog of war](/features/fog-of-war.md), a token restored onto a hidden cell, or one that is still `hidden`, reaches only the DM group.
- Removed tokens stay removed when the fight ends, and when an interrupted fight is continued.

# As built (stage 9)

- Removing and restoring a token each raise its version, so a move racing a removal fails, and a player's undo of a removed character stays gone after it comes back.
- The DM's list is a "Vom Feld genommen (n)" button next to "Kampf beenden", shown only while a token is removed; each row has "Zurückholen". The undo bar stays 8 seconds.
- Only the session DM's board carries the removed tokens. A player whose only character is taken off sees "Meine Figur" switched off with the reason while the page stays open; after a reload the button is gone (open question for the project owner).
- The fights list still counts removed creatures (open question for the project owner).
