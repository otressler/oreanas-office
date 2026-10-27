---
type: Feature
title: Character import
description: A player copies one of their characters from another campaign into this one, with its texts, facts, colour and picked portrait; the copy is independent from then on.
tags: [feature, campaigns, characters]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T16:40:00Z }
---

# Goal

The project owner asked (2026-10-27) to import their characters from another campaign, so a character played in several campaigns doesn't have to be typed in and painted again.

# Rules

Claude's defaults, not yet confirmed by the project owner:

- **A copy, not a link.** The import makes a new [character](/domain/character.md) in this campaign. From then on the two are independent: editing one leaves the other as it was.
- **Only your own characters**, from campaigns you are still a member of. `dm` members import only their own characters too; they can give the copy to a player afterwards, as with any character.
- **The copy belongs to whoever imports it.**
- **What is copied:** name, size, the four texts, the flavor sentence, Klasse, Spezies, Alter, the picked colour (none stays none, so the copy takes the next default colour here) and the picked portrait. The portrait becomes the copy's only version, picked, with a picture of its own, so it survives the source campaign. It costs nothing and doesn't count against the [image budget](/decisions/image-budget.md); its origin (generated or uploaded) and prompt are kept. Other versions are not copied.
- **Not copied:** the status list (the copy starts with the 15 conditions like any new character; custom statuses belong to their campaign, see [statuses](/features/statuses.md)), session hand-overs, and tokens on maps.
- The same character can be imported more than once; a card says "Gibt es hier schon" when one of your characters here has its name. Characters can't be deleted, so only a card's button imports, never a click on the card.

# Where

- On the [campaign page](/features/campaign-page.md), a "Charakter übernehmen" tile stands after "Neuer Charakter", only for someone who has characters in other campaigns.
- It opens `/kampagnen/:campaignId/charaktere/uebernehmen`: your characters elsewhere as cards like the campaign page's (portrait in the alcove, lit in the colour the copy will have here, Spezies · Klasse, the flavor sentence), grouped under the name of their campaign, each with "Übernehmen". Importing opens the copy's [character page](/features/character-page.md).

# As built

API: `GET /api/campaigns/{campaignId}/characters/importable` lists the signed-in user's characters in their other campaigns, by campaign name and name; `POST /api/campaigns/{campaignId}/characters/import` with `{ characterId }` makes the copy (201 with the new character, 404 for anything not importable, 403 for non-members of the target campaign). No schema change. Built on `feature/character-import`.
