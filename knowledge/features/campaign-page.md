---
type: Feature
title: Campaign page
description: The campaign page in the landing page's look at a desktop's width - cover banner with a pencil for dm members, sessions, characters as tall portrait cards, and the maps and bestiary as picture panels.
tags: [feature, campaigns, design]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-26T10:28:21Z }
---

# Goal

After the [campaign overview](/features/campaign-overview.md), the project owner asked on 2026-10-26 to bring the same look to the campaign page (`/kampagnen/:campaignId`): maps and the bestiary as two panels like home's joining and creating, the cover and description's editor behind a pencil instead of a section of its own, and more room for the characters, "the heart of the campaign", as big vertical cards below the sessions.

# Layout

The page uses a desktop's width (`handle: { wide: true }`), top to bottom:

1. **Cover banner** with the name over it and the viewer's role as a label. `dm` members get a pencil in the cover's corner that opens "Titelbild und Beschreibung" (name, description, cover gallery) below the banner. The description follows the banner for every member.
2. **Sessions**, unchanged.
3. **"Die Gefährten" / Charaktere**: every character as a tall card, the viewer's own first. Two columns on phones, three from `sm`, four from `lg`. A card shows the picked portrait uncropped (not cut to the token's circle), fading at its edges into a generated stone alcove lit in the character's ring colour, with the ring colour as a bar along the top. Below it: the name, "Dein Charakter" or who plays it, the size, the character's flavor sentence ("Kurzer Satz", three lines at most), Without a portrait the token's letter stands in, large, in its ring. The whole card links to the [character page](/features/character-page.md), where editing and the status list live. The last tile adds a character: it opens the character page as an empty editor.
4. **"Hinter dem Schirm" / Vorbereitung** (`dm` members only): "Karten" and "Bestiarium" as picture panels, side by side from `md`, each with a line of text, its button and how many maps or creature types this browser holds. The counts come from the offline copy, like the pages they open.
5. **Members** and the DM's own status list, side by side from `lg`.

A campaign made offline shows the same two panels under its offline note.

# Bestiary page

Before, the bestiary was only reachable from the editor's creature tool. `/kampagnen/:campaignId/bestiarium` now shows the same list outside any map: create, edit and archive creature types, and their icons. Like the map list it is an offline page (`RequireLocalUser`): it reads the campaign's copy, is for `dm` members only, and generating or uploading icons still needs a connection ([token icons](/features/token-icons.md)).

# As built

Built on `feature/campaign-page`, frontend only; no API or schema change.

- The home page's section heading, picture panel and cover label moved to `components/ornaments.tsx` and are shared by both pages.
- Three pictures generated with the `image-assets` skill in the cover style (high quality): a war table with a battle map and miniatures (maps), an open bestiary on a lectern with a beast's eyes in the dark (bestiary), both 1536 × 1024, and an empty lit alcove at 1024 × 1536 behind the character portraits. Kept as WebP in `src/web/public/campaign/` and precached, so the page looks the same offline.
- Portraits are 512 px squares in the token style (centred, head and shoulders, mostly transparent background), so a card shows the whole portrait as painted, not a full-body figure. Full-body character art would need a new asset kind and template, like campaign covers; not built.
