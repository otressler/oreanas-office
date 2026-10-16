---
type: Feature
title: Player extras
description: A "Meine Figur" button that brings the player's own character into view, and a short vibration when the server has taken a move, both on the player's own device only.
tags: [feature, players, mobile, board]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-16T09:20:22Z }
---

# Goal

Two small helpers for players on phones, moved from the [backlog](/backlog.md) into stage 9 by the project owner on 2026-10-16 ([implementation plan](/implementation-plan.md)). Both act only on the player's own device; nothing is sent to anyone or saved. The third player extra, choosing one's own colour, was added to stage 8 instead ([character](/domain/character.md)).

Proposals the project owner hasn't confirmed yet are marked with their question number in the [implementation plan](/implementation-plan.md).

# Show my token: "Meine Figur"

A player zoomed into one corner of a big map, or one who just opened the app, finds their character with one tap.

- **The button** sits at the board's lower right, above the [token card](/features/token-card.md) when the card is docked at the bottom. It shows for anyone with a character in the running fight; the session DM without a character and the [spectator view](/features/spectator-view.md) don't get it.
- **A tap** pans the board so the character stands in the middle. If the board is zoomed out so far that the token is smaller than a fingertip, it also zooms in to the size the board opens with. The token pulses once in its ring colour, on this device only.
- **Several characters in the fight** (question 32, confirmed by the project owner on 2026-10-16): each tap goes to the next one, in the order they were added to the campaign, and then starts again.
- **It doesn't select the token.** The person taps it as usual to move it, so a tap on the button never starts a move by accident.
- A character that isn't on the board, because it wasn't placed or was taken off ([removing tokens](/features/removing-tokens.md)), is skipped. With none on the board, the button is off and says "Deine Figur ist nicht in diesem Kampf".
- Works while disconnected: it only moves the view.

# Haptic feedback

A short vibration tells the player that a move counted, without looking at the screen.

- **When** (question 33, confirmed by the project owner on 2026-10-16): one short vibration (about 30 ms) when the server has taken a move the device sent, not on the tap itself. The move is shown at once either way ([realtime sync](/decisions/realtime-sync.md)); the vibration means "saved". A move the server rejects, where the token goes back, gives two short pulses. Undo vibrates like a move.
- **Only the mover's device.** Other people's moves, pings and statuses don't vibrate.
- **Where it works**: through the browser's Vibration API,[^mdn-vibrate] on Android phones in Chrome, Edge, Firefox and Samsung Internet. **iPhones and iPads don't support it**, in any browser, also when the app is installed, so they get nothing. Without support the feature is silent and shows nothing.
- **Off switch**: "Vibrieren" on the profile page, on by default, remembered on this device rather than the account, since it depends on the phone. The board has no menu to put it in. The phone's own silent mode may also mute it, depending on the phone.

# Not included

- **Choosing one's own colour**: added to stage 8 instead, as a hex code on the character ([character](/domain/character.md)).
- Vibration for pings aimed at the player, or when it's the player's turn: there is no turn order yet.

# Gate

- [ ] Zoomed into the far corner of a large map, "Meine Figur" brings my character to the middle, and it pulses once.
- [ ] With two characters in the fight, a second tap goes to the other one. It never selects a token.
- [ ] After the DM takes my only character off the board, the button is off and says why.
- [ ] On an Android phone, a confirmed move and an undo each vibrate once; other people's moves don't. Switching "Vibrieren" off on the profile page stops it, also after a reload. (The double pulse for a rejected move is covered by the automated tests, since a rejection is hard to cause by hand.)
- [ ] On an iPhone, moving works as before, without errors.

[^mdn-vibrate]: MDN Web Docs, "Navigator: vibrate() method", https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate, browser compatibility table: no support in Safari on iOS.
