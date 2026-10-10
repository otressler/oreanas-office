---
type: Reference
title: Original project brief
description: The project owner's first description of the app and proposed data model, kept verbatim.
tags: [brief, requirements]
generated: { by: human:oliver.langschede, at: 2026-10-10T19:13:07Z }
---

# Brief (verbatim)

> I need help for our DnD games. We have trouble with creating playable battlemaps for staging our fights. We don't have access to a printer that can print on bigger paper sizes, so everything is pretty cramped and we can't really place our minifigures. What I'm planning is a tool with two parts:
>
> 1. Battle Map gen for dungeon master:
> The dungeon master should be able to create a map for a fight. They can specify the grid size (NxM) and then draw the walkable area. Additionally, they should be able to add some map objects that they can add to the grid. This should not be a full level editor. The idea is rather, that they can place the most important objects (e.g. a bridge), add information about height levels, entrances and exits, then specify the scene and vibe. The actual visuals should be created by an AI Image Generation model that is hosted e.g. via Microsoft Foundry. Enemies need to be added to the map. Icons should be created per enemy type.
> 2. Playable Map:
> Players should be able to move themselves on the map. They should see the distance they would move. There should not be any restrictions regarding order, etc. Each player moves on their own device and sees the current state of the board. The dm can move the monsters.
>
> For a data model, I would use:
> - User
> - Character
> - Campaign
> - Session
> - Fight
> - Creature
>
> A player can have multiple characters. A campaign can have multiple sessions (a session could be a battle map, or a battle map is a fight in a session). Only one session is active. Only one battle map is active. A session always has one dm (creator of the session). Rest is players. A campaign has a default DM, but it can vary per session. One session has multiple players and multiple creatures.

# How the brief maps to the knowledge base

The proposed entities were refined during planning. The [data model](/domain/data-model.md) lists what changed and why.
