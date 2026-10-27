---
type: Feature
title: Hit points
description: The session DM tracks creatures' hit points during a fight, on the token card, in the initiative list and as a red fill rising in the token; creatures aren't dead at 0, the DM marks them dead, which greys the token out for everyone.
tags: [feature, dm, fight, tokens]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T20:00:00Z }
---

# Goal

The session DM keeps creatures' hit points in the app instead of on paper. Asked for by the project owner on 2026-10-27; it takes "Hit points" out of the [backlog](/backlog.md). Like the [initiative](/features/initiative.md) list it is the DM's own note: it shows, it enforces nothing ([overview](/overview.md), "Show, don't enforce").

# Decided (project owner, 2026-10-27)

- **Creatures only.** A [creature type](/domain/creature-type.md) has default hit points; a creature [token](/domain/token.md) may start with its own.
- **Noted on the token card.** During a fight the DM writes down the new value on the card that also shows the creature's details.
- **Shown in two places.** The initiative list shows "left/maximum", and the token on the board has a red, see-through fill that rises from the bottom as hit points are lost: none at full, the whole token at 0.
- **The session DM alone sees hit points.** Players, other `dm` members, spectator and shared screens get neither the numbers nor the fill.
- **0 doesn't kill.** A creature at 0 stays as it is. **"Als tot markieren"** on the card marks it dead, and **"Wiederbeleben"** takes the mark back. Dead is only a look: the token is greyed out, and it still moves like any creature.
- **Everyone sees the dead mark**, players and spectator screens included.

# Hit points

- **Default**: a creature type's "Trefferpunkte" in the bestiary, a whole number from 1 to 999. Empty means the DM doesn't count them for this type.
- **Own starting value**: each creature on an encounter map can override it in the map editor's creature panel; empty takes the type's. It syncs with the encounter like the initiative settings ([offline prep](/decisions/offline-prep-pwa.md)).
- **In the fight**: a creature's maximum is its own or its type's. What it has left is the value the DM noted, or the maximum while nothing is noted. A creature spawned during the fight starts with its type's ([creature spawn](/features/creature-spawn.md)).

# At the table

- **Token card** (session DM, creatures): "Trefferpunkte [left] von [maximum]" and "Eintragen" (Enter also sends). Left goes from 0 to the maximum, the maximum from 1 to 999; an empty "left" means full. Changing the maximum here is how a spawned creature gets its own. A creature without a maximum says so and waits for one. The buttons also get "Als tot markieren" or "Wiederbeleben".
- **Everyone's card** says "tot" under a dead creature's name, also in a stack's rows.
- **Initiative list**: "7/12" at the end of a creature's row, red at 0; a dead creature's name is struck through with "tot" instead.
- **Board**: the red fill rises inside the ring, with a light line at its level so it shows on a creature's own dark red too. A dead token is drawn grey and darker, without the fill. A token too small to draw (a dot) turns grey when dead.
- The DM's "Spieleransicht" shows the board without the fill, as players see it.

# Data and hub

- [Creature type](/domain/creature-type.md): `hitPoints`, nullable. [Token](/domain/token.md): `maxHitPoints` (own maximum, nullable), `hitPoints` (noted, nullable) and `dead`.
- Device → server, session DM only and creatures on the board only: `SetHitPoints { tokenId, hitPoints, maxHitPoints }` and `SetTokenDead { tokenId, dead }`. Saved before broadcast ([realtime sync](/decisions/realtime-sync.md)).
- Server → session DM's group: `TokenHitPointsChanged`. Server → everyone who may see the creature: `TokenDeadChanged`.
- The board's tokens carry `hitPoints` and `maxHitPoints` on the session DM's board only; `dead` on every board.
- Neither touches the token's `version`, which counts moves: noting hit points never makes a move fail.

# As built (2026-10-27)

- Server: `CreatureType.HitPoints`; `Token.MaxHitPoints`, `Token.HitPoints`, `Token.Dead` (migration `HitPoints`). Rules in `Encounters/HitPoints.cs` (`HitPointRules`), the table side in `Table/TableHitPoints.cs` and `TableHub.HitPoints.cs`. `TableVisibility.ForPlayers(BoardToken)` strips hit points from every token that reaches players: board loads, restores, reveals, fog changes and spawns. Error `hitPointsInvalid`.
- Frontend: `src/web/src/hitPoints/hitPoints.ts` (parsing and the fill's height), the card's fields in `TokenCard.tsx`, the fill and grey look in `board/render.ts`, the list in `InitiativeList.tsx`, the editor field in `editor/encounter/panels.tsx`, the bestiary field on the [creature page](/features/creature-page.md). The board lab takes `hp=<label>:<left>/<max>` and `dead=<label>`.
- Tests: `HitPointsTests` and `TableVisibilityTests` (backend); `hitPoints.test.ts`, `merge.test.ts`, `EncounterPage.card.test.tsx`, `EncounterPage.initiative.test.tsx`, `panels.test.tsx`, `tokens.test.ts`, `creatureTypes.test.ts`, `records.test.ts`.

# Open

- Damage and healing are typed as the new value; there is no "−7" shortcut yet.
- Map import files can't set hit points; types from an import start without them.
- Hit points aren't on characters: players keep their own ([backlog](/backlog.md), "Characters").
