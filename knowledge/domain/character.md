---
type: Domain Entity
title: Character
description: A player character owned by one user in one campaign.
tags: [domain, people, tokens]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T20:30:00Z }
---

# Schema

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `ownerUserId` | → [User](/domain/user.md) | A member of the campaign. Its player, unless the session DM hands it to someone else for one session (see Who plays it) |
| `campaignId` | → [Campaign](/domain/campaign.md) | Characters are campaign-specific |
| `name` | string | |
| `size` | enum | See [creature size](/rules/creature-size.md); usually Medium or Small |
| `appearance` | text, nullable | Short visual description that feeds the portrait prompt, as on a [creature type](/domain/creature-type.md) |
| `tagline` | text | One flavor sentence, up to 120 characters, shown under the portrait on the [campaign page](/features/campaign-page.md) and under the name on the character's page. Not in the portrait prompt (project owner, 2026-10-27) |
| `background` | text | Where the character comes from and what it has lived through, up to 1,500 characters. Feeds the portrait prompt, like `appearance` |
| `personality` | text | How the character is and acts, up to 750 characters. Feeds the portrait prompt |
| `characterClass`, `species`, `age` | text | Free-text facts shown under the name ("Klasse", "Spezies", "Alter"), up to 40 characters each. Feed the portrait prompt after the appearance, as "Species: …. Class: …. Age: ….", leaving out empty ones |
| `bonds` | text | Ties to people and places ("Verbindungen"), up to 1,500 characters. For the other players to read; never part of the portrait prompt |
| `tokenAssetId` | → [Asset](/domain/asset.md), nullable | The picked portrait version: generated, uploaded or restyled from an upload ([token icons](/features/token-icons.md)) |
| `color` | string, nullable | The ring colour its player picked, `#rrggbb` in lower case. Null keeps the default colour by the order characters were added ([token](/domain/token.md)). Characters may share a colour; the app doesn't check, and the DM sorts it out at the table (project owner, 2026-10-16). Added to stage 8 after its merge |

Later (stage 9): a status list, the list of statuses its player picks from ([statuses](/features/statuses.md), [status](/domain/status.md)).

# Permissions

A player creates and edits their own characters, colour included. Every `dm` member of the campaign can edit any character in it ([campaign member](/domain/campaign-member.md)), and gives characters to members: they pick the owner when creating a character ("Gehört") and change it later, to any member of the campaign in either role. Players can't give their characters away. Whoever can edit a character can also upload, generate and pick its portrait; generating counts against the site-wide [image budget](/decisions/image-budget.md).

# Who plays it

Added on 2026-10-24 at the project owner's request ("assign characters to players in a campaign and override that in a session"). Draft: the split below is Claude's proposal and still needs the project owner's yes.

- **In the campaign**, the owner plays the character.
- **In a session**, the session DM can hand it to another member for that session only, for example when its player is absent ([session](/domain/session.md), "Who plays which character"). Without that, the owner plays it.
- **Playing** is what a player does with a character at the table: moving and undoing its moves, putting statuses on it and picking from its status list, it being drawn on top for them, "Meine Figur", their place in "who's here", and their ping colour. Wherever the spec says a player's own characters or a character's owner at the table, it means who plays it in that session.
- **Editing** stays with the owner and `dm` members, also in a session where someone else plays it: name, size, appearance, colour, portrait and status list.
- A running fight with the character reloads its boards when its player changes, so the change applies at once.

# Notes

The texts `appearance`, `background`, `personality` and `bonds` are shown and edited on the character's [page](/features/character-page.md); every member of the campaign can read them (project owner, 2026-10-27).

A player can copy one of their characters from another campaign into this one ([character import](/features/character-import.md)); the copy is a new, independent character.

Deliberately thin: only what the board needs. Speed is out until the [distance rules](/backlog.md) come back (project owner, 2026-10-14). Full character sheets are part of the campaign management focus area in the [backlog](/backlog.md).
