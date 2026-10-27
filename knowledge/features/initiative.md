---
type: Feature
title: Initiative
description: An optional initiative list for the session DM, switched on per fight; players say their rolls, creatures roll with a modifier and normally, with advantage or with disadvantage, from their type or their own, and the DM keeps the order by drag and drop.
tags: [feature, dm, fight, tokens]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-25T10:30:00Z }
---

# Goal

The first DM tool at the table, asked for by the project owner on 2026-10-25. The session DM keeps the fight's initiative order in the app instead of on paper. It is the DM's own tool: only the session DM sees it, it is off until the DM switches it on for a fight, and it enforces nothing ([overview](/overview.md), "Show, don't enforce"). It is a first step towards the backlog's **turn order**, which would also show players whose turn it is ([backlog](/backlog.md)).

# Decided (project owner, 2026-10-25)

- **Optional, per fight.** Initiative is off in every encounter until the session DM switches it on.
- **Order only.** The list shows the order and the values. There is no current-turn marker, no round counter and no "next turn".
- **Session DM only.** Players, other `dm` members, spectator screens and shared screens never get the list, nor creatures' initiative settings.
- **One roll per creature.** Each creature token rolls its own d20, so every goblin has its own entry.
- **Advantage and disadvantage** (added 2026-10-25). A creature rolls normally, with advantage (two d20, the higher counts) or with disadvantage (two d20, the lower counts), like the dice tray.
- **Spawned creatures roll and slot in.** A creature added during a fight while initiative is on rolls by itself and joins the list before the first entry with a lower value (or none).

# Creature settings

- A [creature type](/domain/creature-type.md) has an **initiative modifier** (a whole number from −10 to +20, default 0) and an **initiative roll**: Normal (the default), Vorteil (advantage) or Nachteil (disadvantage), set in the bestiary form. Disadvantage was added by the project owner on 2026-10-25, after advantage.
- Each creature [token](/domain/token.md) on an encounter map can override both in the map editor's creature panel. An empty modifier and "Wie die Art" take the type's values. Both sync with the encounter like the other creature fields ([offline prep](/decisions/offline-prep-pwa.md)).
- Characters have no initiative settings: players always roll for themselves and tell the DM.

# Setup

1. While the fight runs, the session DM taps **"Initiative würfeln"** in the fight's top bar. It needs a connection to the table.
2. The server rolls every creature on the board: one d20, or two keeping the higher with advantage or the lower with disadvantage, plus the modifier. Rolling on the server keeps the modifiers off players' devices.
3. The setup screen lists the characters, where the DM types in the values the players say (a character may stay empty for now), and the creatures with modifier, roll (Normal, Vorteil, Nachteil), the d20s with the one that doesn't count struck through, the value and "neu würfeln". Changing a creature's modifier or roll here only applies to this fight. Changing the modifier moves the value with the roll; switching from Normal to Vorteil or Nachteil rolls a second d20, switching between them keeps both, and back to Normal keeps the first; typing a value replaces the roll. "Alle Kreaturen neu würfeln" rolls them all again.
4. **"Übernehmen"** saves the list sorted by value, highest first, entries without a value last, ties by the higher modifier and then by the order they had. Saving switches initiative on.

**"Bearbeiten"** opens the setup screen again with the saved values; tokens without an entry roll fresh. Saving sorts again.

# The list

- A panel over the board's top-left corner lists the tokens in turn order with value, picture and name; hidden creatures are drawn faint. Creatures with hit points show what they have left and their maximum ("7/12"), and dead ones are struck through ([hit points](/features/hit-points.md)). The top bar's **"Initiative"** button and the panel's arrow fold it away; folded or not is remembered per device.
- A tap on an entry selects its token on the board, as a tap on the token would, and opens its card.
- Entries are reordered at any time by dragging the handle, or with the arrow keys on it. The new order shows at once and is saved; values don't change.
- A token taken off the board leaves the list and comes back at its old place when restored. Its entry stays saved.
- **"Beenden"**, after a question, switches initiative off for the fight and drops the list.

# Saving and devices

The list is saved on the [encounter](/domain/encounter.md), so it survives reloads, other devices and a continued session ([session](/domain/session.md), "Continuing"). Every change raises the list's version; the session DM's other devices get it live and keep the newer version, like fog changes ([realtime sync](/decisions/realtime-sync.md)).

# As built (2026-10-25)

- Server: `Encounter.Initiative` (JSON column `InitiativeJson`, a list of `{ tokenId, value, modifier, mode, rolls }`) and `InitiativeVersion`, a concurrency token; `CreatureType.InitiativeModifier`/`InitiativeRollMode`; `Token.InitiativeModifier`/`InitiativeRollMode`, nullable. The roll mode `InitiativeRollMode` is `Normal`, `Advantage` or `Disadvantage`. Migrations `Initiative` and `InitiativeRollMode`; the second turns the first's advantage columns and saved lists into roll modes. Rules in `Encounters/Initiative.cs` (`InitiativeRules`), the table side in `Table/TableInitiative.cs` and `TableHub.Initiative.cs`.
- Hub methods `RollInitiative` (not saved), `SetInitiative` (the whole list in order) and `ClearInitiative`, session DM only from a player connection; `InitiativeChanged` goes to the session DM's group only. Spawning adds to the list in the same save (`TableSpawns`). Bad lists are rejected with `initiativeInvalid`.
- The board's `initiative` field is set on the session DM's board only; `TableVisibility.ForPlayers` drops it.
- Frontend in `src/web/src/initiative/`: `initiative.ts` (pure rules), `InitiativeSetup.tsx`, `InitiativeList.tsx` (pointer drag and drop, keyboard moves) and `useInitiative.tsx`, wired into `FightTable`.
- Tests: `InitiativeTests` and `InitiativeRulesTests` (backend), `initiative.test.ts`, `EncounterPage.initiative.test.tsx`, `records.test.ts` and `e2e/initiative.spec.ts` (desktop and phone size).

# Open

- On a phone, the open panel covers a good part of the board's left side; the board doesn't pan tokens out from under it, as it does for the token card. Folding it is the way out for now.
- Map import files can't set initiative values yet; new types from an import start at 0.
- Showing the order to players, whose turn it is and rounds stay in the backlog's turn order.
