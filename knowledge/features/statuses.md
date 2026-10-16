---
type: Feature
title: Statuses
description: Icons for the 15 D&D conditions and custom statuses that the session DM puts on any token and players put on creatures and their own characters, picked from status lists kept on each character and for each DM.
tags: [feature, players, dm, board, images]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-16T06:10:00Z }
sources:
  - id: roll20-conditions
    resource: https://roll20.net/compendium/dnd5e/Rules:Conditions?expansion=33335
    title: Conditions | D&D 2024 (Roll20 compendium)
---

# Goal

A token carries reminders of what is going on with it: prone, grappled, poisoned, or a group's own "Hexed". The app shows them; it doesn't apply their rules ([overview](/overview.md), "show, don't enforce"). Planned for stage 9 ([implementation plan](/implementation-plan.md)); asked for by the project owner on 2026-10-16. It takes the place of "status rings" in the [backlog](/backlog.md) and of "conditions" in "HP and conditions" (question 13).

# Who puts statuses on which token

- **The session DM** puts statuses on any token, creature or character, and removes any status.
- **Players** put statuses on their own characters and on any creature they can see, and remove the ones they put on. They don't put statuses on other players' characters. Other `dm` members count as players at the table ([session](/domain/session.md)). This is the backlog's rule, confirmed by the project owner on 2026-10-16 (question 21).
- The same status can't be on one token twice, as conditions don't stack in the 2024 rules.[^roll20-conditions] Exhaustion has a level from 1 to 6 instead; anyone who may remove it may change the level.

# The library: the 15 conditions

Every status list can hold the conditions of the 2024 rules.[^roll20-conditions] Their icons are made once, before stage 9, with the `image-assets` skill (step T1 in the [implementation plan](/implementation-plan.md)), and ship with the app as static files, so they work offline and cost nothing at the table.

| Key | German name | Motif for the icon |
|-----|-------------|--------------------|
| `blinded` | Blind | A white cloth blindfold across closed eyes, close up |
| `charmed` | Bezaubert | A heart wrapped in a pink spiral |
| `deafened` | Taub | An ear with broken sound waves |
| `exhaustion` | Erschöpfung | A glowing golden hourglass, sagging, nearly run out (has levels 1–6) |
| `frightened` | Verängstigt | A pale ghostly face with huge wide eyes and a screaming mouth |
| `grappled` | Gepackt | A clawed hand gripping an arm |
| `incapacitated` | Kampfunfähig | A dropped sword lying across a broken shield |
| `invisible` | Unsichtbar | A faint, dotted silhouette |
| `paralyzed` | Gelähmt | A rigid figure locked in crackling blue lightning |
| `petrified` | Versteinert | A grey stone head, cracked |
| `poisoned` | Vergiftet | A green drop with a small skull in it |
| `prone` | Liegend | A figure lying flat on a bright ground line, a bold arrow pointing down at it |
| `restrained` | Festgesetzt | A wrist bound by heavy chains |
| `stunned` | Betäubt | Stars circling over a dazed head |
| `unconscious` | Bewusstlos | Closed eyes under a big white sleep swirl |

The German names follow the German edition of the rules, as the project owner confirmed on 2026-10-16; the keys are fixed. The motifs are the ones the T1 icons were generated from (2026-10-16); five were changed from the first proposal because they didn't read at 20 pixels.

# Icons

- **One style for the whole site.** Status icons use the same style block, word for word, as creature icons and portraits (`ImageOptions.TokenStyle`, the token template of the `image-assets` skill), with a framing of their own: one bold symbol, centred, readable at 20 pixels, transparent background, no text. The template is "Status icon" in the skill's `references/prompts.md`.
- **On the token**: up to three status badges sit along the token's upper edge, each its icon on a small dark disc; more show as "+2". Exhaustion carries its level as a small number. The [token card](/features/token-card.md) lists all of them with names.
- A custom status without an icon shows its first letter on the disc.

# Status lists

A status list ("Zustandsliste" in the app) is the list a person picks from when adding a status. It was called the status inventory until 2026-10-16; the project owner renamed it so "inventory" ("Inventar") means only the items a character carries ([backlog](/backlog.md), campaign management). It holds library conditions and custom statuses, in an order its owner chooses.

- **Each character has one**, managed on the character's page by whoever can edit the character: its owner and `dm` members ([character](/domain/character.md)). A new character starts with all 15 conditions; the owner removes the ones they never use and adds custom ones.
- **Each `dm` member has their own DM status list** in the campaign, which also starts with all 15 conditions (question 22, confirmed on 2026-10-16).
- **What the picker shows**: a player sees the status lists of their own characters in this fight (one list if they play one character). The session DM sees their own DM status list first, then every character's status list in the fight, under the character's name, so they can put on a status a player's character caused.
- Picking a status puts it on at once; it's easy to remove, so there is no confirm step.

# Custom statuses

- "Eigener Zustand" in a status list: a name ("Verhext"), a short description of the icon ("a purple eye inside a hand"), and whether it has levels.
- **Its icon is generated** with the Foundry image model like a creature icon: the person starts the job and confirms it, it counts against the site-wide [image budget](/decisions/image-budget.md), it uses the same style block, and new versions can be generated and one picked, as for [token icons](/features/token-icons.md).
- A custom status belongs to the status list it was made in: a character's or a DM's. It shows on every token that has it, with its icon and name, also for people who don't have it in their status list.
- Removing a custom status from a status list only takes it out of the picker. Tokens that carry it keep it, and it is never deleted.

# On the board

- Statuses are saved before they're broadcast, like moves, so a reload or a cold start keeps them ([realtime sync](/decisions/realtime-sync.md)).
- They belong to the token in this encounter. A new encounter starts without statuses; continuing an interrupted fight brings them back with the tokens.
- Everyone sees every status on tokens they can see. With [fog of war](/features/fog-of-war.md), statuses of hidden tokens aren't sent to players.
- Adding and removing need a connection, like moving. Editing status lists and generating icons need one too, like every campaign change except creating a campaign ([offline prep](/decisions/offline-prep-pwa.md)).

# Hub

- Device → server: `AddStatus { tokenId, statusId, level? }`, `RemoveStatus { tokenId, statusId }`, `SetStatusLevel { tokenId, statusId, level }`.
- Server → everyone in the encounter: `TokenStatusesChanged { tokenId, statuses }` with the token's whole list, so devices never merge.
- Board state carries each token's statuses and the definitions they use (name, icon address, levels).

# Data

See [status](/domain/status.md).

# Not included

- Durations and rounds: there is no turn order.
- Rules effects: Prone doesn't change movement, Restrained doesn't stop a move.
- Terrain statuses (burning, webbed, darkness on cells) stay in the [backlog](/backlog.md); they would use the same status lists later.
- Hit points move to the [backlog](/backlog.md) (question 13).

[^roll20-conditions]: Conditions | D&D 2024 (Roll20 compendium)
