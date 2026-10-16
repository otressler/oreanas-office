---
type: Feature
title: Token card
description: Tapping a token opens a card docked at the edge of the screen with its portrait, name and statuses; on a stack it lists every token there, and picking a row selects that token if the person may move it.
tags: [feature, players, dm, board, mobile]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-16T06:10:00Z }
---

# Goal

Show who a token is and what is wrong with it, without getting in the way of moving. It replaces the small info box the board shows on a tap today ([playable map](/features/playable-map.md)). Planned for stage 9 ([implementation plan](/implementation-plan.md)); asked for by the project owner on 2026-10-16 for creatures. The same card serves characters, so there is one way to look at any token.

# Where it sits

- **Never next to the token.** A card beside the token would cover the cells around it, which are the ones a player wants to move to.
- **Phones (narrow screens):** a sheet along the bottom edge, at most about a quarter of the screen high. If the selected token would end up under the sheet, the board pans just enough to keep it in view.
- **Wide screens:** a panel in the top-right corner of the board.
- A "▾" button folds the card to a single line (portrait and name), and "▴" opens it again. It stays folded for the next token until opened. The card closes with "✕", Escape, or a tap on an empty cell.

# One token

- Portrait or icon, large ([token icons](/features/token-icons.md)), with its ring colour.
- Label ("Goblin 3"), the creature type or "Charakter von Eli", size and elevation in meters.
- **Statuses**: icon, name, level for Exhaustion, and who set it ("von Eli"). Tapping a status the person may remove offers "Entfernen" ([statuses](/features/statuses.md)).
- **Buttons**, each only where the person may use it: "Status hinzufügen" ([statuses](/features/statuses.md)); "Zeigen", which pings the token ([pings and arrows](/features/pings-and-arrows.md)); "Abbrechen", which lets go of the token when it's selected for moving; "Vom Feld nehmen" for the session DM ([removing tokens](/features/removing-tokens.md)). Later, the session DM gets "Aufdecken" and "Verbergen" here ([fog of war](/features/fog-of-war.md)).

# A stack

- The card lists **every token on the tapped cell**, one row each: portrait, label and its status icons. The token the tap acted on is highlighted.
- **Tapping a row** the person may move makes that token the selected one, ready to move, as if they had tapped it on the board. Tapping a row they may not move opens that token's details (statuses and buttons) inside the card.
- Rows the person may move come first, so a player finds their own character at the top.

# Taps on the board

The rule for a single tap stays one sentence: **a tap on a token opens its card, and if the person may move the token, the same tap selects it.**

- A player tapping a creature: the card opens, nothing is selected, the next tap on a cell just closes the card.
- A player tapping their own character, or the session DM tapping anything: the card opens and the token is selected, so the next tap on a cell picks the move target, as today ([realtime sync](/decisions/realtime-sync.md)).
- **Stacks**: the tap still selects the person's own topmost token on the cell, so the quick way for players doesn't change. **Tapping the selected token again lets it go**; it no longer cycles to the next own token in the stack, because the card's rows do that more clearly. The stack badge with the count stays.
- A tap on an empty cell shows the cell's terrain and elevation in the same place as the card, as the info box does today.
- Double taps belong to [pings and arrows](/features/pings-and-arrows.md); the first tap's card is closed again when a double tap is recognised.

# Why this layout

The project owner asked for an opinion on the controls, because tap, double tap, stack and hold could get confusing. The proposal keeps one meaning per gesture:

| Gesture | Meaning |
|---------|---------|
| Tap a token | Card, and select if movable |
| Tap a cell while a token is selected | Pick the target (preview) |
| Tap the preview again, or "Hierhin" | Confirm the move |
| Tap the selected token | Let go |
| Double tap | Ping a cell or token |
| Double tap and drag | Arrow |
| One finger drag | Pan |
| Two fingers | Zoom |

Compared with the request, two things differ. The project owner confirmed both, and the layout as a whole, on 2026-10-16 (question 20 in the [implementation plan](/implementation-plan.md)):

- **No "double tap and hold" for a token ping.** A double tap on a token already pings the token rather than the cell, and holding after a double tap is hard to tell apart from a slow double tap. "Zeigen" on the card covers tokens deep in a stack.
- **Pings work in move mode too.** The request excluded move mode, probably because a second tap on a preview confirms the move. Taking the first tap back (see [pings and arrows](/features/pings-and-arrows.md)) solves that, and it also stops a nervous double tap from confirming a move, which can happen today.

# Not included

The [spectator view](/features/spectator-view.md) shows no card: nobody taps a screen in the middle of the table.
