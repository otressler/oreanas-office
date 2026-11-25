---
type: Feature
title: Spell cards
description: A site-wide library of the 2024 Player's Handbook's spells as German tarot-style cards, made by hand, from dnd2024.wikidot.com or from a book photo, with variants per player, an art studio and filters by class; characters keep their spells, prepare some, and flip through them in a gallery at the table.
tags: [feature, spells, characters, players, ai]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T15:30:00Z }
---

# Goal

The project owner asked on 2026-11-21 to bring the separate **spell-cards** app (printable German druid spell cards with an art studio) into Oreana's Office. Spells are shared by everyone; each character keeps a list of spells and prepares some of them; at the table a player opens their prepared spells like the [dice tray](/features/dice-tray.md) and flips a card to read it.

This changes the campaign management decision "spells stay out" in the [backlog](/backlog.md): the cards are reference cards a player reads, and the app still automates nothing ([overview](/overview.md), "show, don't enforce"). It doesn't track spell slots, stop a character from taking a spell of another class or count how many are prepared; the class lists only filter (project owner, 2026-11-24).

Data: [spell](/domain/spell.md). Text model: [text model](/decisions/text-model.md).

# The card

The spell-cards layout, ported as it was: 70 × 120 mm tarot proportions, the front with the art, the German name, the school and level ("Zaubertrick" or "Grad 3"), the flourish icon and two corner pips; the back on parchment with the school's colours and pattern, the four stats, the description, the effect rows with damage chips, the notes (higher levels, ritual, tip) and a footer with material, source and write-in lines. The fonts (Alegreya, Alegreya Sans, Alegreya Sans SC, Cinzel) come bundled with the app, not from Google's servers ([legal notice](/decisions/legal-notice.md)). The back shrinks its text to fit, as the original did, but only down to its normal size (scale 1.00; the spell-cards app went to 0.88).

**Long backs scroll** (project owner, 2026-11-25, after a prototype with Prismatic Wall): spells like Prismatic Wall don't fit on one card, and the cards are read on phones, not printed. When the text doesn't fit at its normal size, the head and the four stats stay put and everything below them (text, tables, effects, notes, footer) scrolls inside the card. A gold rail along the right edge shows where the reader is; the text fades out softly at the bottom, with a small ▾ arrow, until the end, and at the top once it has moved. A vertical swipe scrolls the card, a horizontal one goes to the next card in the gallery, and a tap still turns it over; with the keyboard, ↑ and ↓ scroll a turned card. The editor says so below the preview ("Langer Text: Die Rückseite lässt sich scrollen."), as information, not a warning. Rejected: continuation cards (a tap already turns the card), a separate reading view, and a short summary on the card with the full text elsewhere.

**Tables**: a spell's own table (Prismatic Wall's layers, Confusion's roll, Control Weather's stages) is a block of its own between the text and the effects: an optional line above it, then a row per entry with its key in a coloured strip (the rainbow colours of the prismatic spells, or the school's), a title, a text and an optional chip ([spell](/domain/spell.md), "The card"). Spell import writes tables when the rules text has one.

Changes from the original: there's no class badge (a spell isn't one class's), illusion gets its own colours, and without a picked picture the front shows the school's pattern on its colour instead of a placeholder picture.

# Library: `/zauber`

"Zauber" in the header, for every signed-in user. The library holds the 391 spells of the 2024 Player's Handbook and no others (project owner, 2026-11-24; [handbook classes](/rules/handbook-classes.md)). The spells grouped by level, each as a small card front with its German name (of the first variant, or the English name without one), English name, school, and how many variants it has. A search field matches German and English names. Filters by level, school, **class** (its spell list) and, once a class is picked, **subclass** (the class's list plus what the subclass grants, also the Wizard list for the Eldritch Knight and the Arcane Trickster), and by cards: "Mit Karte" (the default, as the library looked before), "Ohne Karte" and "Alle Zauber". "Neuer Zauber" opens the creation page.

# Creating a spell: `/zauber/neu`

Three ways, as tabs; each ends in the same editor with a draft, and nothing is saved until "Speichern":

1. **Von Hand**: an empty card. The English name is asked first and must be one of the Handbook's (the field suggests them); level and school come from the Handbook.
2. **Nach Name**: the user types a name in any language ("Mondstrahl", "Moonbeam"). The server:
   1. asks the text model for the English 2024 name, unless the input already is one;
   2. refuses a spell that isn't the Handbook's ("Diesen Zauber gibt es nicht im Spielerhandbuch 2024");
   3. if the spell has cards already, says so and offers its variants or "Eigene Variante";
   4. otherwise loads `https://dnd2024.wikidot.com/spell:<slug>` with the Handbook data's slug (404: "Diesen Zauber gibt es im Wiki nicht");
   5. has the text model write the German card from that page, in meters, with the Handbook's level and school.
3. **Aus Foto**: the user takes or picks a photo of a Player's Handbook page. The app shrinks it on the device and sends it; the text model reads every spell on the page and writes a German card for each. Spells that aren't the Handbook's are dropped. With several spells, the user picks which ones to take.

`/zauber/neu?zauber=<spellId>` is the creation page for one spell: "Von Hand" starts with it picked and "Nach Name" with its name filled in. A spell's page without cards links there ("Karte anlegen").

The editor shows the card live, front and back, beside the fields. Saving creates the variant of that spell, with the user as author. Opened from a character ("Neuen Zauber anlegen"), saving also adds the spell to that character.

Spell import costs a fraction of a cent and counts against the site's monthly AI budget ([image budget](/decisions/image-budget.md)); when the month is used up, "Nach Name" and "Aus Foto" are refused and "Von Hand" still works.

# Spell page: `/zauber/:spellId`

The spell's variants side by side, each as a card that flips on a tap, with its author and how many characters use it. The user's own variant has "Bearbeiten" and "Bildstudio". Every other variant has "Eigene Variante", which opens the editor with a copy (`basedOnVariantId`). Under the names, its **Zauberlisten**: the classes whose list it is on and the subclasses that grant it ("Zirkel des Mondes (ab Druide 3)"). Without cards it says so and offers "Karte anlegen". A spell from before the Handbook limit says that it gets no new cards. The admin's correction of name, level and school is gone: those come from the Handbook data.

# Art studio: `/zauber/varianten/:variantId/studio`

The spell-cards studio for one variant, as it was, with the app's [image queue](/features/token-icons.md) instead of the local server:

- The card (picked art and back) and notes on the variant.
- **Motive A, B, C …**: a text per letter with its revisions ("Verlauf"), "Speichern", "Speichern & generieren", "Änderung verwerfen", "+ Motiv". The style block is added by the server.
- **Vorschlagen** (project owner, 2026-11-24): the [text model](/decisions/text-model.md) reads the variant's card (name, level, school, stats, description, effects, higher levels, material), the classes whose list the spell is on, the current text of every motif and the notes on the variant, and writes one new subject in English, different from the motifs there are. It lands in the motif's text field as an unsaved change: "Speichern" keeps it, "Änderung verwerfen" brings the saved text back. Only the author and admins, like everything that costs; it counts against the monthly AI budget and is hidden without a text model.
- **Generieren** queues a picture of the current revision. Each request shows as a tile while it's queued (with its place in the queue and "Abbrechen"), running (with the time so far), or failed (with the reason, "Erneut" and "Ausblenden").
- **Hochladen**: pictures per motif; the server crops their middle to 7:12.
- Every picture as a card front, with ★ (favourite), ✕ (reject, kept but hidden with "Verworfene ausblenden") and "Als Kartenbild". A lightbox shows a picture large with its prompt, model, size, timings and comments, and steps with ← and →.
- "Als abgenommen markieren" says the art is done.
- Updates arrive live while a request is open, over the image hub.

Only the variant's author and admins change anything; others see the studio read-only. Pictures are 1008 × 1728 px at the site's image quality and kept as 672 × 1152 WebP. A generated picture becomes the card art only when picked, unless the variant has none yet.

# A character's spells

On the [character page](/features/character-page.md), a section **Zauber** below the texts: the character's spells grouped by level as small card fronts, each with a "Vorbereitet" switch, and for whoever may edit the character "Variante wechseln" and "Entfernen". "Zauber hinzufügen" opens a dialog that searches the library; a spell with several variants asks which one. By default it shows only the spells of the character's classes and subclasses ("Nur Zauber für Waldläufer"), whatever their level; unticking shows all, and any spell may be taken (project owner, 2026-11-24). A spell without a card links to "Karte anlegen" for it. "Neuen Zauber anlegen" goes to the creation page and comes back with the spell added. Every member reads the list; only whoever may edit the character changes it.

# At the table: "Zauber"

A "Zauber" button next to "Würfeln" on the fight screen and the session page, for everyone who plays a character there that has prepared spells ([character](/domain/character.md), "Who plays it"). It opens a dialog like the dice tray with a gallery of the prepared spells, ordered by level and name; with several characters, a tab per character.

- On a phone the cards fill the width and the user swipes from one to the next (scroll snapping), with "3 / 8" below.
- On a wider screen the cards stand in a grid.
- A tap on a card flips it to its back and back again; with reduced motion it swaps without turning.
- Once the dialog's spells are loaded it keeps working when the connection drops, and the art is cached like portraits. After a reload it needs the server; offline copies of spells aren't built.

# Seeding from spell-cards

The 59 German druid spells (levels 0–2) of the spell-cards app, their art motifs and the picked art come in once, without entering the public repository (project owner, 2026-11-21): `node scripts/spell-seed.mjs <spell-cards folder>` writes `spell-seed.json` next to it, and the admin page's "Zauberkarten übernehmen" uploads that file and the art files. The variants belong to the admin who uploads them. Uploading twice skips spells that already have a seeded variant. Spells that aren't the Handbook's are rejected (since 2026-11-24): the spell-cards app now has 69 spells, five of them from other books (Buzzing Bee, Battle Familiar, Dueling Ground, Tortoise Shell, Wither and Bloom).

# As built (2026-11-21)

Built on `feature/spell-cards`.

- **Server** (`src/Server/Spells/`): `Spell`, `SpellVariant` (the card as the JSON column `CardJson`), `CharacterSpell`, `SpellArtPrompt`, `SpellArtEvent`, `TextModelCall`; migration `SpellCards`, which also makes `Asset.CampaignId` nullable. Endpoints: `/api/spells` (library, spell, variants), `/api/spells/import` (status, `name`, `photo`), `/api/spells/variants/{id}/studio` (state, prompts, generate, upload, art, approved, events, cancelling a queued request), `/api/campaigns/{id}/characters/{id}/spells`, `/api/campaigns/{id}/character-spells` (the gallery) and `/api/admin/spells/seed`. Spell art runs in the image job worker (`RunSpellArtAsync`); the studio follows it with the image hub's `WatchSpellArt`. Character import copies the spells.
- **Errors**: `spellInvalid` (with the field), `spellNotFound`, `notSpellAuthor`, `variantInUse`, `textModelUnavailable`, `spellNotInWiki`, `spellNotRecognized`, `spellImportFailed`, `artPromptInvalid`, and since 2026-11-24 `spellNotInHandbook`.
- **Frontend** (`src/web/src/spells/`): the card (`SpellCard.tsx`, `cards.css`, `fit.ts`, the icons from spell-cards in `iconPaths.ts`), the pages `/zauber`, `/zauber/neu`, `/zauber/:spellId`, `/zauber/varianten/:id/bearbeiten`, `…/eigene` and `…/studio`, the character page's section (`CharacterSpells.tsx`), the gallery (`SpellGalleryButton.tsx`) and the admin page's seed (`SeedSpells.tsx`). The parchment and the school patterns are in `public/spells/` and cached for offline use.
- **Seeding**: `scripts/spell-seed.mjs` writes `spell-seed.json` next to the spell-cards app.
- **Tests**: `SpellTests`, `SpellImportTests` (fake text model and wiki), `SpellUnitTests`, `Images/SpellArtTests`; `spells.test.tsx`.
- **Differences from the spec above**: uploads in the studio are cropped by the server, not on the device; the studio's history of a request is its status and times, not a full status log as in spell-cards.

# As built (2026-11-24): limited to the Handbook

- **Server**: `Rules/handbook.json` and `HandbookSync` (copied after the migrations, once per version), `CharacterClass`, `CharacterSubclass`, `SpellListEntry`, `CharacterClassLevel`, `ReferenceDataVersion`; migration `HandbookClasses`, which also drops `Spell.CreatedByUserId` and the old `Character.CharacterClass`. `GET /api/rules/classes`. `SpellSummary` and `SpellDetail` carry `lists`; `CreateVariantRequest` takes a `spellId` instead of name, level and school; drafts carry `spellId` and `variantCount` instead of `existingSpellId`; `PUT /api/spells/{id}` is gone.
- **Fix on the way**: "Nach Name" built the wiki address from the name and dropped apostrophes (`hunters-mark`), but the wiki keeps a dash (`hunter-s-mark`), so every spell with an apostrophe ended in "gibt es im Wiki nicht". The Handbook data's slug replaces it.
- **Frontend**: `src/web/src/rules/classes.ts` (the classes query, the text "Magier 5 (Hervorrufer)", the filters), the class picker `campaigns/ClassesField.tsx`, the library's filters, the editor's Handbook name field, the spell page's lists and the add dialog's default filter.
- **Tests**: `HandbookUnitTests`, `CharacterClassTests`, the reworked `SpellTests` and `SpellImportTests`; `rules/classes.test.ts`. Spells are shared by the parallel backend tests, so they check their own variants, and each import test uses a spell no other test writes cards for.

# As built (2026-11-24): motif suggestions

- **Server**: `POST /api/spells/variants/{id}/studio/motif` answers `{ subject }` and saves nothing but the `TextModelCall` (`spell-motif`). The prompt is `SpellImportPrompts.MotifSystem` with four motifs of the spell-cards app as examples; `SpellStudio.motifSuggestions` says whether the text model is configured. Errors: `notSpellAuthor`, `textModelUnavailable`, `imageBudgetExhausted` and the new `motifSuggestionFailed` (no answer, an empty one, or a refusal).
- **Frontend**: "Vorschlagen" in each motif's row of buttons in `SpellStudioPage.tsx`.
- **Tests**: `SpellImportTests.The_studio_suggests_a_motif_from_the_card_without_saving_it`; `SpellStudioPage.test.tsx`.
- **Style block**: its headroom line named only outdoor backgrounds ("sky, treetops, haze or distant scenery"), so an indoor scene (an apothecary) came back with open sky and a castle above the room. The calm top quarter now belongs to the scene's setting (indoors ceiling, rafters, vaults or a dim upper wall; underground the cave roof), and the image must stay one coherent place. It now differs from the spell-cards app's `prompts/style.txt`.

# As built (2026-11-25): long backs scroll, tables

- **Server**: `SpellCard.Tables` (`SpellTable`, `SpellTableRow`, `SpellRowColor`) in the card's JSON column, no migration; `SpellCards` checks them (`spellInvalid` with `card.tables`, `card.tables[i]` or `card.tables[i].rows[j]`) and allows descriptions up to 3,000 characters. The import's JSON schema and rules have `tables` and let a long spell's description run to about 2,800 characters; drafts cut tables to the limits and drop empty rows. The studio's "Vorschlagen" reads the tables too.
- **Frontend**: `SpellCard.tsx` wraps everything below the stats in `.sc-body` and draws the tables (`SpellTableBlock`), the rail and the arrow; `fit.ts` stops at `MIN_K` (1.00), marks the frame `.sc-scrolls` and updates the rail and fades on scroll (`updateScroll`); `cards.css` has the scroll and table styles. The editor has a "Tabellen" section (up to 3 tables, 12 rows each) and shares the chip fields with the effects.
- **Changes for existing cards**: a back that used to shrink below scale 1.00 to fit now scrolls a little instead.
- **Tests**: `SpellUnitTests` (table limits, description limit, motif prompt), `SpellImportTests.A_table_in_the_rules_comes_as_a_table_cut_to_the_limits`, `spells.test.tsx` (the table on the back).

# Open

- Printing the cards (PDF or the print shop's PNGs), which the spell-cards app did: not built yet.
- Whether a variant should be private to its author until they publish it.
