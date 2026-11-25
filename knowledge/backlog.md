---
type: Backlog
title: Backlog
description: Accepted feature ideas that aren't designed or scheduled into a phase yet, including the two focus areas remote play and campaign management; all of them support in-person and remote play without simulating the rules.
tags: [planning, backlog]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T21:15:00Z }
---

# How to read this

The project owner picked these ideas. The first sections extend the battle map; the two **focus areas** at the end, remote play and campaign management, grow the app into a campaign suite. None of them is designed or scheduled yet. When one moves into a phase of the [roadmap](/roadmap.md), it gets requirements in its feature concept and is removed from here.

They all follow the [overview](/overview.md) principle "show, don't enforce", and they have to work for in-person, remote and mixed groups ([play setting](/decisions/play-setting.md)).

# On the board

| Idea | What it does | Notes |
|------|--------------|-------|
| **Free draw** | Anyone draws temporary lines and arrows in their colour to plan or explain a move. They fade after a few seconds. | Broadcast like pings, not saved. |
| **Terrain statuses** | Statuses can also mark cells or areas of the map (🔥 burning, 🕸️ webbed, 🌫️ darkness, 🧊 ice…), shown as a tinted overlay with the icon. They come from the status lists of [statuses](/features/statuses.md) (stage 9), where each status would be marked for tokens, terrain or both. Players and the DM can set them. | No rules attached: the app doesn't make the area difficult terrain or deal damage. Stored on the encounter, not on the reusable [battle map](/domain/battle-map.md). |
| **Distance rules** | The distance preview (path and length in meters while choosing a target) and the reach highlight of the cells within a token's speed. | Designed in the [movement rules](/rules/movement-distance.md) and the [playable map](/features/playable-map.md), then taken out of the proof of concept at the start of stage 4 as too complicated for now. Corners, elevation and flying are still open there. Brings back the speed field on [characters](/domain/character.md) and [creature types](/domain/creature-type.md), removed on 2026-10-14. |
| **Measuring tools** | A ruler between any two points, for ranged attacks, and area templates (cone, sphere, line, cube) sized in meters. | Were stage 9 of the [implementation plan](/implementation-plan.md), moved here by the project owner on 2026-10-16. Proposed: shared with everyone like pings and not saved (question 12); they would reuse the relay of [pings and arrows](/features/pings-and-arrows.md). |

# Preparing

| Idea | What it does | Notes |
|------|--------------|-------|
| **Publishing maps** | A DM chooses which of their maps appear in the map store. Unpublished maps stay in their campaign. | Until then, every map that isn't archived is in the store ([battle map](/domain/battle-map.md)). |

# Running the session

| Idea | What it does | Notes |
|------|--------------|-------|
| **Undo for the DM** | The DM can undo any recent move, not only their own. | Uses the existing move history on the [token](/domain/token.md). |
| **Guest DM** | The session DM or the campaign's default DM hands one session to a member who isn't a `dm` member ("Gast-Spielleitung"). The guest runs and plans that session like any session DM, but sees nothing else the campaign's DMs prepared. | Wanted by the project owner on 2026-11-01. Today a session can only go to a `dm` member, and the `dm` role can't be taken back, so a one-off stand-in keeps every map, the bestiary and all planned fights ([session](/domain/session.md), [campaign member](/domain/campaign-member.md)). First sketch below. |

**Guest DM, first sketch** (Claude, 2026-11-01; the defaults wait for the project owner's yes):

- **The right comes from the session, not the campaign.** A guest DM is simply a session's `dmUserId` without the `dm` role. Their rights last while they are that session's DM, also after it ends, since a session DM may continue it. Handing the session back, or to someone else, ends them. The default DM keeps the right to take the session back ([session](/domain/session.md), Rules).
- **What they get:** everything the session DM has today. They run the table (fights, hidden tokens, fog, hit points, initiative), plan the session's fights, import maps into it and decide who plays which character. They see:
  - the maps the session's fights use;
  - the creature types those fights' tokens use;
  - maps and creature types they made themselves while running the session.
- **What stays hidden:** the map list and the map store, the bestiary page, other sessions' planned fights, the join code, the cover and description, and promoting members. Players already see what the guest sees on the board, so that doesn't change.
- **Shared things stay safe.** Changing a creature type, or a map that fights outside the session also use, would change the DMs' own preparation. Default: such maps and types are read-only for the guest, and "Duplizieren" gives them a copy of their own for the session. Maps and types used only by the session's fights are theirs to edit.
- **Sync.** Today the pull lists maps, creature types and encounters only for `dm` members, and pushing a map or type needs only the `dm` role ([offline prep](/decisions/offline-prep-pwa.md), Pull and Server checks). A guest would need a pull limited to their sessions, and push checks that ask "DM of a session that uses it" instead of the role. When the session goes back to someone else, their next pull drops these items, as it does today for lost access.
- **Related:** "Publishing maps" under Preparing. Until it's built, a guest who runs a campaign of their own still sees this campaign's unarchived maps in that campaign's store.
- **Open:**
  1. May the guest generate images against the site's [image budget](/decisions/image-budget.md)?
  2. Which [status list](/features/statuses.md) do they use: the campaign's default DM's, or one of their own?
  3. Should a session spectator, someone outside the campaign, be allowed to become a guest DM, or members only?
  4. Should a demote action for `dm` members come along with this, so a promoted member can become a player again?

# App-wide

| Idea | What it does | Notes |
|------|--------------|-------|
| **More languages** | The interface in languages other than German, chosen per user. | The interface is German only for now ([UI language](/decisions/ui-language.md)). Interface text is the easy part. User content is harder: the bestiary, scene descriptions and the image prompts built from them would each need a version per language. |

# Focus areas

The project owner set the direction on 2026-10-16: the app starts with fights but grows into a full D&D campaign suite for players and DMs. Two focus areas collect the ideas for that. Like everything here, they aren't designed or scheduled yet; each idea gets its own concept when it moves into the [roadmap](/roadmap.md). Rows marked *(suggested)* were added by Claude to fill out an area and still need the project owner's yes.

## Remote play

**Goal:** a DM and players can play a whole session fully remote, without anything that only works at a shared table. The board already works remotely ([play setting](/decisions/play-setting.md)); this area covers what a table gives for free: dice, handouts, side talk.

| Idea | What it does | Notes |
|------|--------------|-------|
| **Dice rolls** | Anyone rolls from a dice tray: d4 to d20 and d100, several dice and a modifier ("2d6+3"), with advantage and disadvantage. The result shows to everyone with the roller's name and colour. The DM can roll hidden, seen only by them. | No rules: the app doesn't know what a roll is for. Each roll is saved in the session's roll log, so it survives a reload or a cold start ([hosting](/decisions/hosting.md)). Whether the server or the device rolls is open; the server would make results tamper-proof. A local first step is built: the [dice tray](/features/dice-tray.md) rolls on the person's own device and shares nothing yet (2026-10-19). |
| **Handouts** | The DM sends a picture to everyone or to chosen players: a region map, a letter, an NPC's face. It opens on their screens and stays in the campaign's list of handouts. | Uploaded like portraits, or generated against the [image budget](/decisions/image-budget.md). Stored as [assets](/domain/asset.md). A handout can become an entry in the knowledge base. Shown on the [spectator view](/features/spectator-view.md) too, when sent to everyone. |
| **Turn order** | For fights played remotely, the DM switches on a turn order: initiative is entered or rolled with the dice tray, everyone sees whose turn it is and who comes next, and the DM moves it on. | Wanted by the project owner on 2026-10-16. It shows, it doesn't enforce: nobody is stopped from moving out of turn ([overview](/overview.md)). Initiative and turn tracking were out of scope until then. A first step is built: the session DM's own [initiative](/features/initiative.md) list, without turns or anything players see (2026-10-25). |
| **Chat and whispers** *(suggested)* | A text chat for the session, and private messages to the DM ("I pick his pocket") or between players. | Saved with the session, so it can feed recaps. The DM doesn't read players' whispers to each other. |
| **Voice call link** *(suggested)* | The session holds a link to the group's own call (Discord, Teams, Signal), joined with one tap. | The app doesn't do voice or video itself ([play setting](/decisions/play-setting.md)). |

Related ideas elsewhere: who's here in the [shared table](/features/shared-table.md) (stage 10), and [pings and arrows](/features/pings-and-arrows.md) in stage 9.

**Decided for this area** (project owner, 2026-10-16):

- **Turn order.** Decided: wanted for remote play (row above), shown but never enforced.
- **Voice and video.** Decided: they stay outside the app, as the play setting says; building them would be far out of scope and too expensive.

## Campaign management

**Goal:** the app supports the DM and players in planning and playing a campaign over many sessions, not only its fights. It absorbs the former "Later: campaign manager" list of the [roadmap](/roadmap.md).

| Idea | What it does | Notes |
|------|--------------|-------|
| **Characters** | A character sheet with the basic stats beyond what a token needs: ancestry, class and level, ability scores, armour class, hit points, speed, background. Players keep their own; the DM sees every one. No spells, attacks or features. | Today a [character](/domain/character.md) is deliberately thin. The status inventory already sits near the character ([statuses](/features/statuses.md)); creatures' hit points are the DM's own note ([hit points](/features/hit-points.md)). Classes with levels and subclasses are built (2026-11-24, [handbook classes](/rules/handbook-classes.md)). |
| **Spells by class level** | The spell filters also check levels: a class list offers only the spell levels the character's class level reaches, and a subclass's spells come from the class level its table names. | The groundwork is built: each class's spellcasting (`full`, `half`, `pact`) and each subclass spell's class level ([handbook classes](/rules/handbook-classes.md)). The project owner asked on 2026-11-24 not to limit by level yet. |
| **Notes** | Notes for oneself and notes shared with the group, attached to a session, a character, an item or a knowledge base entry. | Private notes stay private, also from the DM. The DM's notes for a session are part of planning it ([session planning](/features/session-planning.md)). |
| **Items** | The campaign's item catalogue: weapons, armour, potions and magic items, with description, rarity, attunement and a picture. The DM makes them; players see an item once a character has it or the DM reveals it. | Pictures in the token style against the [image budget](/decisions/image-budget.md), like creature icons ([token icons](/features/token-icons.md)). |
| **Inventory** | What each character carries, with quantities and coins, plus a shared party stash. The DM hands out loot to characters or the stash; players move items between them. | "Inventar" in the app. The statuses a person picks from are called the **status list** ("Zustandsliste") so the names don't clash ([statuses](/features/statuses.md)). |
| **Knowledge base** | The campaign's world: NPCs, places, factions, quests and lore, as linked entries with pictures. The DM writes entries and reveals them, or parts of them, to players when the characters learn about them. Players add what they find out. | The same idea as [fog of war](/features/fog-of-war.md): hidden until the DM reveals it, by hand. Takes over "Campaign lore: NPCs, places, factions" from the roadmap. |
| **Session recaps** | After each session, a story recap of what happened: written by the DM or a player, shown on the session page and as a timeline for the campaign. | An AI draft from the session's fights, rolls, chat and notes is possible, but needs a text model and a budget like the images; that would be a new decision. Takes over "Session notes" from the roadmap. |

**Decided for this area** (project owner, 2026-10-16):

- **How smart is the character sheet?** Decided: it tracks basic stats and only works out the obvious (ability modifiers, proficiency bonus by level). Spells, attacks and the like are too complicated and stay out; nothing is automated ([play setting](/decisions/play-setting.md)). Changed on 2026-11-21 for spells only: characters keep [spell cards](/features/spell-cards.md) to read at the table, still without slots, class checks or anything automated.
- **Offline.** Decided: notes and knowledge base entries can be read offline; writing needs a connection at first ([offline prep](/decisions/offline-prep-pwa.md)).
- **Names.** Decided: the items a character carries are the "Inventar"; the statuses a person picks from are the "Zustandsliste" ("status list" in the knowledge base), renamed in the stage 9 concepts on 2026-10-16.
