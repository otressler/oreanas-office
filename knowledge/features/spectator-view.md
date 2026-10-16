---
type: Feature
title: Spectator view
description: A tablet in the middle of the table joins a session as a spectator by QR code, link or join code, and shows that session's running fight by itself, as players see it.
tags: [feature, table, realtime, spectator]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-16T07:55:00Z }
---

# Goal

A tablet in the middle of the table shows the board for everyone, without anyone working it. When the DM starts a fight, the tablet shows it; when the fight ends, it waits for the next one. Planned for stage 10 ([implementation plan](/implementation-plan.md)); asked for by the project owner on 2026-10-16. It is the watching half of the **table view** in the [backlog](/backlog.md); moving characters from a shared device stays there as **local mode**.

# Spectating is a mode of the device, not of the person

- **A spectator needs an account.** Registration stays invite-only ([auth](/decisions/auth.md)).
- **The usual case**: one person signs in with their own account on two devices, as a player on their phone and as a spectator on the tablet (project owner, 2026-10-16). So spectating belongs to the connection, not to the account. The same account can play on one device and watch on another at the same time.
- **A spectator connection always sees what players see**, whoever is signed in, the session DM included. The tablet never shows hidden creatures or fog ([fog of war](/features/fog-of-war.md)).
- **A spectator connection only watches.** It can't move, ping, draw arrows, set statuses or remove tokens, even when the account could on another device. Its own characters aren't drawn on top, and the person counts once in "who's here".
- **The device may differ every time** (project owner, 2026-10-16), so nothing depends on a particular tablet. Any device a person signs in on can become the spectator screen.

# Joining a session

Spectators join **one session**, not the campaign (question 24).

- **Members of the campaign** need no code: the session page has **"Als Zuschauer öffnen"**, which turns this device into the session's spectator screen.
- **People who aren't members** join with the session's QR code, its link or the campaign's join code. They get **spectator access to that session only**: a session spectator entry ([session](/domain/session.md)). It lasts while the session exists, including when it's continued on another day, and gives no access to the campaign, its other sessions or prepared fights. The next session needs a new join.
- **"Zuschauer einladen"** on the session page, for the session DM and `dm` members, shows a large QR code, the link it holds, and the campaign's join code.

# The join page

The link and the QR code open a join page that asks the signed-in account **"Mitspielen"** or **"Nur zuschauen"**. The join code typed into the existing join form leads to the same choice; there "Nur zuschauen" lists the campaign's running and planned sessions, with the running one picked.

- **"Mitspielen"** makes the account a member of the campaign, as the join code does today, and opens the campaign.
- **"Nur zuschauen"** opens the spectator screen for the session. A member just gets the screen; someone else gets a session spectator entry first.
- The same QR code serves players and spectators, which takes "Join by QR code" out of the [backlog](/backlog.md) (question 25).

**A wrong choice can always be changed** (project owner, 2026-10-16):

- **Picked "Nur zuschauen" but wanted to play**: scanning the QR code or entering the code again shows the join page again, and "Mitspielen" makes the account a member. The join page never turns someone away for already having access.
- **Picked "Mitspielen" but wanted to watch**: the account is now a member, so "Als Zuschauer öffnen" on the session page, or rejoining with "Nur zuschauen", opens the spectator screen. The membership stays, since leaving a campaign isn't supported yet ([campaign member](/domain/campaign-member.md)); it costs nothing.
- **On the spectator screen**, the corner menu has "Zuschaueransicht verlassen". For a member it goes back to the session page; for a session spectator it goes to the join page, where "Mitspielen" is still offered while the join code is valid.

# The screen

`/kampagnen/:id/sitzungen/:sessionId/zuschauen`. Full screen, no header, landscape first, everything large enough to read from across a table. The device remembers that it is this session's spectator screen, so reopening the app brings it back until someone leaves the view.

| State | Shows |
|-------|-------|
| Session planned | The session's title and date, and "Noch nicht gestartet" |
| Session running, no fight | The session's title, the QR code to join, and the characters of the campaign with their portraits |
| Fight running | The board, zoomed to show the whole map, with tokens, statuses, pings, arrows and move previews. No token card and no controls |
| Session ended | "Sitzung beendet", then the screen disconnects |

- **Fights start by themselves.** When the session DM starts a fight, the screen switches to it within about a second; when it ends, the screen goes back to the waiting state. When an ended session is continued, the screen shows it again once someone touches it.
- A small menu button in one corner offers "Ganze Karte", full screen on and off, and "Zuschaueransicht verlassen".
- The screen keeps itself awake with the browser's wake lock while the session runs.
- Pings, arrows and statuses are drawn at least as large as on phones, measured on the screen, not on the map.

# Connection and costs

- The screen calls `WatchSession` on the hub and gets `EncounterStarted`, `EncounterEnded` and `SessionEnded`, plus everything a player's board gets for the running fight ([realtime sync](/decisions/realtime-sync.md)).
- **Idle timeout**: nobody touches the tablet, so a spectator connection isn't dropped after 30 idle minutes while its session is active. A planned session's screen keeps the usual timeout. When the session ends, the screen shows "Sitzung beendet" and disconnects; it connects again only when someone touches it or reloads. Nothing polls, and a forgotten tablet can't keep the server awake between game nights ([hosting](/decisions/hosting.md)).
- With [fog of war](/features/fog-of-war.md), spectator connections are in the players' group, whoever is signed in.

# Not included

Moving characters from the shared screen: that is local mode, still in the [backlog](/backlog.md).
