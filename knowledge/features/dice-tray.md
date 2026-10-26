---
type: Feature
title: Dice tray
description: A dice tray opened from the fight screen and the session page that rolls W4 to W100 with a modifier and advantage or disadvantage, on the person's own device only for now.
tags: [feature, players, dm, remote-play]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-19T21:00:00Z }
---

# Goal

The first step of the **dice rolls** idea in the [backlog](/backlog.md)'s remote play area. The project owner asked on 2026-10-19 for a dice tray opened in a dialog from the fight screen and the session page. They chose a tray that stays local first: each device rolls for itself, and nothing goes to the server or to anyone else. Sharing rolls with everyone, the session's roll log and hidden DM rolls stay in the backlog as the next step.

# What it does

- **"Würfeln"** opens the tray in a dialog: in the fight screen's top bar (the dice icon alone on a phone, with the word on wider screens) and in the session page's title row. Everyone gets it, players and DMs, in every state of the fight or session.
- **The dice** are W4, W6, W8, W10, W12, W20 and W100, written the German way (project owner, 2026-10-19): "2W6 + W20 + 3". Typed notation also takes the English "d" and "d%".
- A tap on a die below puts it in the tray, and a tap on a die in the tray takes it out again (a long press or right-click on the die below does the same). At most 24 dice per roll.
- **Modifier** from −99 to +99, and **Normal / Vorteil / Nachteil** for the W20s in the roll: with advantage each W20 is rolled twice and the higher counts, with disadvantage the lower. The other die is shown struck through.
- **The roll** tumbles the dice, then shows each die's result, the breakdown ("W6 (2) + W20 (8 ~~6~~) + 1") and the total. A natural 20 on a W20 glows candle-gold with sparks; a natural 1 goes cold with a red glow. The app gives these no rules meaning ([overview](/overview.md)): it doesn't know what a roll is for.
- **"Letzte Würfe"** lists the last eight rolls, newest first, each with "Noch mal" to roll it again.
- The dialog says "Nur du siehst deine Würfe."
- The phone vibrates briefly on a roll, unless "Vibrieren" is off on this device ([player extras](/features/player-extras.md)).
- With reduced motion, the dice land at once without tumbling.

# On the device

- Rolls use the browser's secure random source (`crypto.getRandomValues`), without bias.
- Each person has one tray while the app is open. Closing the dialog, moving between the fight and the session page, or opening it again keeps the dice, the modifier and the mode.
- "Letzte Würfe" are also saved in the browser's local storage, per person (`oreana.dice.<userId>`), so they survive a reload. Without storage the list starts empty. Nothing is saved on the server, so another device doesn't see them.
- It works without a connection to the server or the table.

# As built (2026-10-19)

- `src/web/src/dice/`: `notation.ts` (W notation, parsing, the secure roll, advantage), `diceRoller.ts` (the `<dice-roller>` custom element with its own shadow DOM and animations), `diceRollerStyles.ts` (its stylesheet, drawn from the app's colour tokens), `tray.ts` (one tray per person), `history.ts` (saved rolls, with malformed entries dropped) and `DiceButton.tsx` (the button and dialog).
- The dialog is the shared `Modal` with a new `size="narrow"`.
- The tray started as a standalone prototype (`dice-roller.js` outside the repository), restyled to the app's look and ported to TypeScript.
- Tests: `notation.test.ts`, `DiceButton.test.tsx` and `e2e/dice.spec.ts` (fight screen and session page, phone and laptop).

# Next

From the backlog's dice rolls row, still open: results shown to everyone with the roller's name and colour, the session's roll log on the server, hidden DM rolls, and whether the server or the device rolls. Turn order would roll initiative with this tray.
