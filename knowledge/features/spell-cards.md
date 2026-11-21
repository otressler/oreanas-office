---
type: Feature
title: Spell cards
description: A site-wide library of spells as German tarot-style cards, made by hand, from dnd2024.wikidot.com or from a book photo, with variants per player and an art studio; characters keep their spells, prepare some, and flip through them in a gallery at the table.
tags: [feature, spells, characters, players, ai]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T15:30:00Z }
---

# Goal

The project owner asked on 2026-11-21 to bring the separate **spell-cards** app (printable German druid spell cards with an art studio) into Oreana's Office. Spells are shared by everyone; each character keeps a list of spells and prepares some of them; at the table a player opens their prepared spells like the [dice tray](/features/dice-tray.md) and flips a card to read it.

This changes the campaign management decision "spells stay out" in the [backlog](/backlog.md): the cards are reference cards a player reads, and the app still automates nothing ([overview](/overview.md), "show, don't enforce"). It doesn't track spell slots, check whether a class may learn a spell or count how many are prepared.

Data: [spell](/domain/spell.md). Text model: [text model](/decisions/text-model.md).

# The card

The spell-cards layout, ported as it was: 70 × 120 mm tarot proportions, the front with the art, the German name, the school and level ("Zaubertrick" or "Grad 3"), the flourish icon and two corner pips; the back on parchment with the school's colours and pattern, the four stats, the description, the effect rows with damage chips, the notes (higher levels, ritual, tip) and a footer with material, source and write-in lines. The fonts (Alegreya, Alegreya Sans, Alegreya Sans SC, Cinzel) come bundled with the app, not from Google's servers ([legal notice](/decisions/legal-notice.md)). The back shrinks its text to fit, as the original did; a back that still overflows is marked in the editor ("Der Text passt nicht auf die Karte").

Changes from the original: there's no class badge (a spell isn't one class's), illusion gets its own colours, and without a picked picture the front shows the school's pattern on its colour instead of a placeholder picture.

# Library: `/zauber`

"Zauber" in the header, for every signed-in user. The spells grouped by level, each as a small card front with its German name (of the first variant), English name, school, and how many variants it has. A search field matches German and English names. A filter by level and school. "Neuer Zauber" opens the creation page.

# Creating a spell: `/zauber/neu`

Three ways, as tabs; each ends in the same editor with a draft, and nothing is saved until "Speichern":

1. **Von Hand**: an empty card. The English name, level and school are asked first, because they identify the spell.
2. **Nach Name**: the user types a name in any language ("Mondstrahl", "Moonbeam"). The server:
   1. asks the text model for the English 2024 name, unless the input already is one;
   2. if a spell with that English name exists, says so and offers its variants or "Eigene Variante";
   3. otherwise loads `https://dnd2024.wikidot.com/spell:<slug>` (404: "Diesen Zauber gibt es im Wiki nicht");
   4. has the text model write the German card from that page, in meters.
3. **Aus Foto**: the user takes or picks a photo of a Player's Handbook page. The app shrinks it on the device and sends it; the text model reads every spell on the page and writes a German card for each. With several spells, the user picks which ones to take.

The editor shows the card live, front and back, beside the fields. Saving creates the spell (if new) and the variant, with the user as author. Opened from a character ("Neuen Zauber anlegen"), saving also adds the spell to that character.

Spell import costs a fraction of a cent and counts against the site's monthly AI budget ([image budget](/decisions/image-budget.md)); when the month is used up, "Nach Name" and "Aus Foto" are refused and "Von Hand" still works.

# Spell page: `/zauber/:spellId`

The spell's variants side by side, each as a card that flips on a tap, with its author and how many characters use it. The user's own variant has "Bearbeiten" and "Bildstudio". Every other variant has "Eigene Variante", which opens the editor with a copy (`basedOnVariantId`). An admin can also correct the spell's English name, level and school.

# Art studio: `/zauber/varianten/:variantId/studio`

The spell-cards studio for one variant, as it was, with the app's [image queue](/features/token-icons.md) instead of the local server:

- The card (picked art and back) and notes on the variant.
- **Motive A, B, C …**: a text per letter with its revisions ("Verlauf"), "Speichern", "Speichern & generieren", "Änderung verwerfen", "+ Motiv". The style block is added by the server.
- **Generieren** queues a picture of the current revision. Each request shows as a tile while it's queued (with its place in the queue and "Abbrechen"), running (with the time so far), or failed (with the reason, "Erneut" and "Ausblenden").
- **Hochladen**: pictures per motif; the server crops their middle to 7:12.
- Every picture as a card front, with ★ (favourite), ✕ (reject, kept but hidden with "Verworfene ausblenden") and "Als Kartenbild". A lightbox shows a picture large with its prompt, model, size, timings and comments, and steps with ← and →.
- "Als abgenommen markieren" says the art is done.
- Updates arrive live while a request is open, over the image hub.

Only the variant's author and admins change anything; others see the studio read-only. Pictures are 1008 × 1728 px at the site's image quality and kept as 672 × 1152 WebP. A generated picture becomes the card art only when picked, unless the variant has none yet.

# A character's spells

On the [character page](/features/character-page.md), a section **Zauber** below the texts: the character's spells grouped by level as small card fronts, each with a "Vorbereitet" switch, and for whoever may edit the character "Variante wechseln" and "Entfernen". "Zauber hinzufügen" opens a dialog that searches the library; a spell with several variants asks which one. "Neuen Zauber anlegen" goes to the creation page and comes back with the spell added. Every member reads the list; only whoever may edit the character changes it.

# At the table: "Zauber"

A "Zauber" button next to "Würfeln" on the fight screen and the session page, for everyone who plays a character there that has prepared spells ([character](/domain/character.md), "Who plays it"). It opens a dialog like the dice tray with a gallery of the prepared spells, ordered by level and name; with several characters, a tab per character.

- On a phone the cards fill the width and the user swipes from one to the next (scroll snapping), with "3 / 8" below.
- On a wider screen the cards stand in a grid.
- A tap on a card flips it to its back and back again; with reduced motion it swaps without turning.
- Once the dialog's spells are loaded it keeps working when the connection drops, and the art is cached like portraits. After a reload it needs the server; offline copies of spells aren't built.

# Seeding from spell-cards

The 59 German druid spells (levels 0–2) of the spell-cards app, their art motifs and the picked art come in once, without entering the public repository (project owner, 2026-11-21): `node scripts/spell-seed.mjs <spell-cards folder>` writes `spell-seed.json` next to it, and the admin page's "Zauberkarten übernehmen" uploads that file and the art files. The variants belong to the admin who uploads them. Uploading twice skips spells that already have a seeded variant.

# As built (2026-11-21)

Built on `feature/spell-cards`.

- **Server** (`src/Server/Spells/`): `Spell`, `SpellVariant` (the card as the JSON column `CardJson`), `CharacterSpell`, `SpellArtPrompt`, `SpellArtEvent`, `TextModelCall`; migration `SpellCards`, which also makes `Asset.CampaignId` nullable. Endpoints: `/api/spells` (library, spell, variants), `/api/spells/import` (status, `name`, `photo`), `/api/spells/variants/{id}/studio` (state, prompts, generate, upload, art, approved, events, cancelling a queued request), `/api/campaigns/{id}/characters/{id}/spells`, `/api/campaigns/{id}/character-spells` (the gallery) and `/api/admin/spells/seed`. Spell art runs in the image job worker (`RunSpellArtAsync`); the studio follows it with the image hub's `WatchSpellArt`. Character import copies the spells.
- **Errors**: `spellInvalid` (with the field), `spellNotFound`, `notSpellAuthor`, `variantInUse`, `textModelUnavailable`, `spellNotInWiki`, `spellNotRecognized`, `spellImportFailed`, `artPromptInvalid`.
- **Frontend** (`src/web/src/spells/`): the card (`SpellCard.tsx`, `cards.css`, `fit.ts`, the icons from spell-cards in `iconPaths.ts`), the pages `/zauber`, `/zauber/neu`, `/zauber/:spellId`, `/zauber/varianten/:id/bearbeiten`, `…/eigene` and `…/studio`, the character page's section (`CharacterSpells.tsx`), the gallery (`SpellGalleryButton.tsx`) and the admin page's seed (`SeedSpells.tsx`). The parchment and the school patterns are in `public/spells/` and cached for offline use.
- **Seeding**: `scripts/spell-seed.mjs` writes `spell-seed.json` next to the spell-cards app.
- **Tests**: `SpellTests`, `SpellImportTests` (fake text model and wiki), `SpellUnitTests`, `Images/SpellArtTests`; `spells.test.tsx`.
- **Differences from the spec above**: uploads in the studio are cropped by the server, not on the device; the studio's history of a request is its status and times, not a full status log as in spell-cards.

# Open

- Printing the cards (PDF or the print shop's PNGs), which the spell-cards app did: not built yet.
- Whether a variant should be private to its author until they publish it.
