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

**Titles** (2026-11-25, after "Sonnenexplosion" came out as "SONNENEXP / LOSION"): the name takes one line if it fits down to a minimum size, else two lines broken only between words or at the name's break point ("Sonnen|explosion", [spell](/domain/spell.md), "The card"), shrinking further rather than cutting a word. Only a word too long even then gets the browser's German hyphenation by syllables, and as the very last resort a break anywhere. The fit allows a quarter line of slack in height, because Cinzel's letters reach slightly past their lines; without it every title failed the check and ended at the smallest size, cut anywhere. The fit runs again when the face shown changes (the editor's preview starts on the back; switching to the front left "Dunkelsicht" unfitted at 17 pt, cut off), whenever fonts finish loading (a first measure with a fallback font is too narrow) and when a card gets its size. Until the fit has run, a long word wraps rather than being cut.

**Description**: a blank line starts a paragraph, with a small gap; lines starting with "- " are a list with markers in the school's colour. Spell import writes short spells as one paragraph and longer ones as paragraphs with bold lead-ins ("**Licht.** …"), choices as a list.

**Long backs scroll** (project owner, 2026-11-25, after a prototype with Prismatic Wall): spells like Prismatic Wall don't fit on one card, and the cards are read on phones, not printed. When the text doesn't fit at its normal size, the head and the four stats stay put and everything below them (text, tables, effects, notes, footer) scrolls inside the card. A gold rail along the right edge shows where the reader is; the text fades out softly at the bottom, with a small ▾ arrow, until the end, and at the top once it has moved. A vertical swipe scrolls the card, a horizontal one goes to the next card in the gallery, and a tap still turns it over; with the keyboard, ↑ and ↓ scroll a turned card. The editor says so below the preview ("Langer Text: Die Rückseite lässt sich scrollen."), as information, not a warning. Rejected: continuation cards (a tap already turns the card), a separate reading view, and a short summary on the card with the full text elsewhere.

**Tables**: a spell's own table (Prismatic Wall's layers, Confusion's roll, Control Weather's stages) is a block of its own between the text and the effects: an optional line above it, then a row per entry with its key in a coloured strip (the rainbow colours of the prismatic spells, or the school's), a title, a text and an optional chip ([spell](/domain/spell.md), "The card"). Spell import writes tables when the rules text has one.

Changes from the original: there's no class badge (a spell isn't one class's), illusion gets its own colours, and without a picked picture the front shows the school's pattern on its colour instead of a placeholder picture.

# Library: `/zauber`

"Zauber" in the header, for every signed-in user. The library holds the 390 spells of the 2024 Player's Handbook and no others (project owner, 2026-11-24; [handbook classes](/rules/handbook-classes.md)). The spells grouped by level, each as a small card front with its German name (of the first variant, or the English name without one), English name, school, and how many variants it has. A search field matches German and English names. Filters by level, school, **class** (its spell list) and, once a class is picked, **subclass** (the class's list plus what the subclass grants, also the Wizard list for the Eldritch Knight and the Arcane Trickster), and by cards: "Mit Karte" (the default, as the library looked before), "Ohne Karte" and "Alle Zauber". "Neuer Zauber" opens the creation page.

# Creating a spell: `/zauber/neu`

Three ways, as tabs; each ends in the same editor with a draft, and nothing is saved until "Speichern":

1. **Von Hand**: an empty card. The English name is asked first and must be one of the Handbook's (the field suggests them); level and school come from the Handbook. When the page was opened for a known spell, its Handbook German name is filled in too.
2. **Nach Name**: the user types a name in any language ("Mondstrahl", "Moonbeam"). The server:
   1. asks the text model for the English 2024 name, unless the input already is one;
   2. refuses a spell that isn't the Handbook's ("Diesen Zauber gibt es nicht im Spielerhandbuch 2024");
   3. if the spell has cards already, says so and offers its variants or "Eigene Variante";
   4. otherwise loads `https://dnd2024.wikidot.com/spell:<slug>` with the Handbook data's slug (404: "Diesen Zauber gibt es im Wiki nicht");
   5. has the text model write the German card from that page, in meters, with the Handbook's English and German names, level and school. The official German name is also put on the returned draft, so a model's alternate translation cannot replace it.
3. **Aus Foto**: the user takes or picks a photo of a Player's Handbook page. The app shrinks it on the device and sends it; the text model reads every spell on the page and writes a German card for each. Spells that aren't the Handbook's are dropped. With several spells, the user picks which ones to take.

`/zauber/neu?zauber=<spellId>` is the creation page for one spell: "Von Hand" starts with it picked and its known German name filled in, while "Nach Name" starts with its English name filled in. A spell's page without cards links there ("Karte anlegen").

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
- **Motiv löschen** (project owner, 2026-11-25): a motif nothing came of goes with all its revisions. "Nothing came of it" means no picture, generated or uploaded, and no request queued or running; its failed requests, which have no picture and cost nothing, go with it. A motif with pictures stays, so the history of every picture stays whole (`motifInUse`). A saved motif asks first, in its own row ("Löschen" or "Behalten"), never in a browser dialog; a new one never saved just disappears.
- Every picture as a card front, with ★ (favourite), ✕ (reject, kept but hidden with "Verworfene ausblenden") and "Als Kartenbild". A lightbox shows a picture large with its prompt, model, size, timings and comments, and steps with ← and →.
- "Als abgenommen markieren" says the art is done.
- Updates arrive live while a request is open, over the image hub.

Only the variant's author and admins change anything; others see the studio read-only. Pictures are 1008 × 1728 px at the site's image quality and kept as 672 × 1152 WebP. A generated picture becomes the card art only when picked, unless the variant has none yet.

# A character's spells

On the [character page](/features/character-page.md), a section **Zauber** below the texts: the character's spells grouped by level as small card fronts, each with a "Vorbereitet" switch. A tap on a card opens it large in a dialog, with "Variante wechseln" and "Entfernen" for whoever may edit the character. "Entfernen" acts at once, without asking: a spell is quickly added again (project owner, 2026-11-25). "Zauber hinzufügen" opens a dialog that searches the library; a spell with several variants asks which one. By default it shows only the spells of the character's classes and subclasses ("Nur Zauber für Waldläufer"), whatever their level; unticking shows all, and any spell may be taken (project owner, 2026-11-24). A spell without a card links to "Karte anlegen" for it. "Neuen Zauber anlegen" goes to the creation page and comes back with the spell added. Every member reads the list; only whoever may edit the character changes it.

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

# As built (2026-11-25): removing without asking, deleting motifs

- **Server**: `DELETE /api/spells/variants/{id}/studio/motifs/{letter}` (author and admins; 404 for a letter without revisions, `motifInUse` for a motif with a picture or an open request). It checks and deletes in one serializable transaction, so a request queued meanwhile can't be orphaned. No schema change.
- **Frontend**: "Entfernen" in a character's spell dialog no longer asks (`CharacterSpells.tsx`); "Motiv löschen" in a motif's row of buttons in the studio, only where nothing came of it, confirmed in the row.
- **Tests**: `Images/SpellArtTests.Only_a_motif_nothing_came_of_can_be_deleted`, `SpellStudioPage.test.tsx`, `CharacterPage.test.tsx`.

# As built (2026-11-25): titles that fit, paragraphs and lists

- **Server**: `SpellCards.BreakPoints` turns "|" in a card name into a soft hyphen when saving and in import drafts; the motif prompt gets the name without them. The import prompt asks for a break point in long names and for paragraphs, lead-ins and lists. No schema change.
- **Frontend**: `fit.ts` (`fitTitle`'s order, the height slack), `parseBlocks` in `markupText.ts` with `Description` in `SpellCard.tsx`, list styles in `cards.css`; the editor shows break points as "|" (`nameForEditing`, `nameFromEditing` in `model.ts`) and search ignores them.
- **Tests**: `SpellUnitTests.A_break_point_in_the_name_is_saved_as_a_soft_hyphen`, `spells.test.tsx` (blocks, break points, the description on the back). The fit itself needs real layout and was checked in a browser.
- **Existing cards** keep their text; their titles now fit at larger sizes. Paragraphs come with the revision pass (step 4) or an edit.

# As built (2026-11-25): statuses from spells

- **Server**: `SpellCard.OfferStatus` and `SpellCard.Statuses` (condition keys, saved in the conditions' order; `spellInvalid` with `card.statuses` for anything else or a repeat) in the card's JSON column. `SpellStatuses` works out the offers and adds them: `GET /api/campaigns/{id}/characters/{id}/spells/{spellId}/status-offers` answers `SpellStatusOffer`s (`key` "spell" or a library key), `POST …/statuses` with `{ keys }` adds the picked ones still on offer and answers the status list; both for whoever may edit the character, 404 when the spell isn't on it. Migration `SpellStatuses`: `StatusDefinition.SpellId` (unique per campaign) and `SpellIcon`, and the library status `concentration`. Spell import's schema and rules have `offerStatus` and `statuses`. `TableStatuses` lets everyone put statuses on every token they can see.
- **Frontend**: the editor's "Zustände" (`StatusFields` in `SpellEditor.tsx`, the marked conditions from `spells/statuses.ts`, matched by the glossary's and the statuses' names without needing the glossary); the offer dialog `StatusOffers.tsx`, opened after "Zauber hinzufügen" and when the creation page comes back with `addedSpell` in the navigation state; `statuses/icon.ts` draws a spell status's card icon as an SVG picture in candle gold for the badges and lists; "Status hinzufügen" on the token card for everyone.
- **Konzentration's icon**: `public/statuses/concentration.webp`, a glowing cyan crystal orb with a spark at its heart, made with the status icon template (medium quality, about 20 s); its source is `assets/generated/statuses/concentration-v1.png`.
- **Tests**: `SpellStatusTests`, `SpellUnitTests.A_cards_statuses_are_condition_keys`, the changed `TableStatusTests` and `StatusListTests`; `spells/statuses.test.ts`, `statuses/icon.test.ts`, `SpellEditor.test.tsx`, `CharacterPage.test.tsx` and the token card's test.
- **Existing cards** offer nothing until an edit or the revision pass (step 4) sets their switch and conditions; their Konzentration is offered already.

# As built (2026-11-25): suggestion queue and revision pass

- **Server**: `SpellJob`, `SpellCardDraft` and `SpellCardRevision` (migration `SpellSuggestions`); `SpellJobWorker` with its doorbell `SpellJobQueue`, separate from the image queue because it needs only the text model; wiki pages at most every `Images:SpellWikiInterval` (3 s). Admin endpoints under `/api/admin/spells`: `GET jobs` (overview), `POST jobs/plan` (counts and estimate), `POST jobs` (start; 409 `textModelUnavailable` or `imageBudgetExhausted`), `POST jobs/retry`, `POST jobs/{id}/retry`, `POST revisions/{id}/revert` (409 `revisionOutdated` after an edit); `DELETE /api/spells/drafts/{id}` for admins. `SpellSummary.hasDraft`, `SpellDetail.draft`, `CreateVariantRequest.draftId`. The revision prompt is `SpellImportPrompts.RevisionSystemWith` (the card rules, the glossary, then rules that keep the words), recorded as `spell-revise`; `SpellCardRevise` merges and checks. Motif source `suggestion`. Deleting a variant deletes its jobs.
- **Frontend**: `SpellJobsPanel.tsx` on the admin page (reloads every 3 s while jobs are open); the draft on the spell page (`DraftCard` in `SpellPage.tsx`); `CheckDraft` on the creation page for `?zauber=…&vorschlag=1` (`spellPaths.checkDraft`); "Vorschlag bereit" in the library; "Vorschlag prüfen" in a character's add dialog; the "Vorschlag" badge on a motif in the studio.
- **Tests**: `SpellJobTests` (in the Images collection with `SpellImportTests`, since both set the fake text model's answers and need the monthly budget), `SpellUnitTests` for the check; `SpellJobsPanel.test.tsx`, `SpellDraft.test.tsx`.
- **Not tried against the real model yet**: how many of the ~60 cards pass the word check depends on how closely the model keeps the words; cards that fail land in "Zum Prüfen".

# Planned (2026-11-25)

Agreed with the project owner on 2026-11-25, not built yet. Built in this order, each step on top of the one before, so the revision pass (4) redoes every existing card once.

## 1. Paragraphs, lead-ins and lists (built 2026-11-25, see "The card")

The project owner noticed that cards often are one long block of text. In the description:

- A blank line starts a new **paragraph** with a small gap (about 1 mm); a single line break stays a line break. Today a blank line is two line breaks, a whole empty line.
- **Bold lead-ins**, as the 2024 book writes spells, are a writing rule, not new markup: "**Wand oder Kugel.** …", "**Licht.** …".
- Lines starting with "- " are a compact **list**, for spells that offer choices (Command, Enhance Ability, Alter Self).
- No headings: on a card they take room that lead-ins cover.

Effect and table rows stay one block each. The import prompt changes from "no headings, no lists" to "short paragraphs by topic with a bold lead-in where the spell has parts; a list for choices".

## 2. Explaining conditions: dashed underline and a tap (built 2026-11-25 as the [rules glossary](/features/rules-glossary.md), for the whole glossary)

- A German **glossary** ships with the app, so it works offline: the 15 conditions under the status keys of [statuses](/features/statuses.md) (`blinded`, `restrained` …), maybe a few rules terms (Konzentration, Vorteil/Nachteil, schwieriges Gelände, helles/dämmriges Licht). *Open*: the German SRD 5.2.1's text (CC BY 4.0, then credited in the [legal notice](/decisions/legal-notice.md)) or short summaries of our own.
- **Markup** `[[festgesetzt]]` marks a term in any card text; the app matches it against each condition's word forms. Explicit, because German endings defeat guessing ("festgesetzte Kreatur", "darunterliegend"); without a match it's plain text. Spell import writes it.
- **On the card** a marked term has a **dashed underline** in the school's colour (the project owner's idea): about 0.25 mm thick, a little below the letters, solid with a faint tint while its explanation is open. No ⓘ icons.
- **A tap** on it (hover on a desktop as well) shows the condition's icon, name and rules, outside the card so it isn't clipped or scaled: a sheet at the bottom of the gallery on a phone, a popover beside the term on a desktop. The tap doesn't turn the card. The card then needs its own "Karte umdrehen" control for the keyboard and screen readers, since buttons can't sit inside the card's button.
- The same explanation opens from a status on the [token card](/features/token-card.md) and in the initiative list.

## 3. Statuses when a spell is added (built 2026-11-25, see "As built")

When a spell is added to a character, and only when something is missing from the character's status list ([statuses](/features/statuses.md), "Status lists"), the app offers the statuses ticked: "Für Liriels Zustandsliste: ☑ Mal des Jägers ☑ Konzentration", with "Hinzufügen" and "Überspringen". Unticking skips one; nothing is added unseen. This happens in the "Zauber hinzufügen" dialog and when "Neuen Zauber anlegen" comes back to the character page; not when switching a variant.

The card says what it offers (project owner, 2026-11-25):

- **"Als Zustand anbieten"** (`offerStatus`): the spell itself is a status, for spells that mark a target or last on someone (Hunter's Mark, Hex, Bless, Faerie Fire). The author sets it in the editor and spell import sets it.
- **Conditions** (`statuses`): the conditions the spell causes. The editor's "Zustände" section lists every condition the card's texts mark (step 2) as a suggestion to tick, and keeps the ticked ones even when a mark goes. Mentioning isn't causing (Lesser Restoration ends Blinded), so the author decides; spell import ticks only conditions the spell causes.
- **Konzentration**: offered with a concentration spell (the card's `concentration`), as a built-in status (below).

What is offered is what the character's list doesn't have yet. A spell status is **linked to its spell**: one per campaign and spell, made the first time it's taken, with the German name of the variant it was taken from (without break points) and the card's icon drawn as its icon, so nothing is generated or spent and it works offline. Two characters with Hunter's Mark share it, and a character whose list has it isn't offered it again. Its icon can still be generated like a custom status's; a generated picture takes the drawn icon's place.

**Konzentration** becomes a 16th built-in status (key `concentration`), with an icon made once like the conditions' and the glossary's "Konzentration" as its explanation. New status lists don't start with it; it's offered with a concentration spell, and anyone may add it to a list by hand.

Removing the spell keeps its statuses; tokens may carry them, and statuses are never deleted.

## 4. Revising the existing cards (built 2026-11-25, see "As built")

An admin action "Karten überarbeiten": for every variant, the text model gets the **current card**, not the wiki, and may change only its form: paragraphs and lead-ins (1), condition markup (2), the status switch (3).

- **Checked**: the server strips markup and spacing from the old and the new text and compares them. Only formatting changed: the revision is saved. A word changed: nothing is saved, and the card is listed on the admin page to look at by hand.
- **Undo**: the card before the revision is kept, so it can be put back. Variants have no history yet, so this needs a schema addition.
- Moving text into tables rewrites it and can't pass the check; that stays with the editor and "Eigene Variante", card by card.
- About 60 cards at a fraction of a cent each; it runs as a background job (below).
- **What the model may touch** (2026-11-25): the name (break points only), the description, the effect rows' texts and the tables' caption, titles and texts, plus "Als Zustand anbieten" and the conditions. Everything else is kept from the card as it is. The check compares each of those texts with its markup (`**`, `*`, `[[…|…]]`, list dashes, break points) and all spacing taken out. A model that changes the number of effects or tables keeps the card's own.
- **On the admin page**: "Karten überarbeiten" with "nur noch nicht überarbeitete" ticked, the number of cards and the estimated cost before it starts. Afterwards the cards whose words changed ("Zum Prüfen", with the field and a link to the editor) and the revised cards with "Zurücksetzen". Putting a card back is refused once it was edited after the revision.
- A card edited while its revision ran isn't overwritten: the job fails with "inzwischen geändert" and can be tried again.

## 5. A queue for card drafts and motif suggestions (built 2026-11-25, see "As built")

Project owner, 2026-11-25: queue all spells for suggestions, cards and art motifs, **but not the art itself** (pictures cost far more per image; 330 would use up the [image budget](/decisions/image-budget.md)).

- **Starting it**: "Vorschläge erstellen" on the admin page, with the library's filters (level, class, school) and "nur Zauber ohne Karte" ticked by default, and the estimated cost before it starts. About 330 spells without a card cost well under $1 of the monthly AI budget.
- **The queue**: a job per spell in the database (queued, running, done, failed), worked in the background like the image queue, with progress, failures and "Erneut versuchen" on the admin page. Production scales to zero ([hosting](/decisions/hosting.md)), so an interrupted run goes on at the next start. Wiki pages are fetched a few seconds apart, not all at once. The revision pass (4) runs on the same queue.
- **Card drafts** are not variants: a machine card would look like someone's own, count as "Mit Karte" and could land on a character unchecked. A spell with a draft shows "Vorschlag bereit" in the library; its page shows the draft with "Prüfen und übernehmen", which opens the editor with it, and saving makes it a variant with whoever checked it as author. A spell with only a draft can't be added to a character. This settles the open question below for machine-written cards.
- **Motif suggestions**: for each card without a motif, and for each draft, the text model writes one subject as "Vorschlagen" does. On a variant it becomes motif A with a revision of its own source (`suggestion`, shown as "Vorschlag" in the studio); a draft carries its suggestion into the variant when it's taken. One that doesn't fit is deleted with "Motiv löschen". Generating the picture stays the author's step.
- **Which jobs** (2026-11-25): a spell without a card gets a **draft** job (wiki page, German card, then a motif for it); with "nur Zauber ohne Karte" unticked, each variant of the other spells without any motif gets a **motif** job. A spell with a draft already, or with an open job of the same kind, is skipped. The class filter uses the class's list.
- **Who and what it costs**: only admins start it. The calls are recorded under the admin who started the run and count against the monthly AI budget; the estimate uses the average cost of earlier calls of the same kind (a fixed guess before there are any). Without a text model the buttons are disabled. When the month's budget is used up, the remaining jobs fail with "Budget aufgebraucht" and can be tried again next month.
- **Progress**: the admin page shows waiting, running, done and failed jobs per kind and reloads every few seconds while jobs are open. Failed ones show their reason, with "Erneut versuchen" for one or all.
- **Drafts**: a spell has at most one. Its page shows the draft card with "Prüfen und übernehmen" for everyone signed in and "Verwerfen" for admins. Taking it opens the creation page's editor with the draft (also from a character's "Zauber hinzufügen", whose row says "Vorschlag prüfen"); saving creates the variant with origin "aus dem Wiki", gives it the draft's motif and removes the draft.

# Open

- Printing the cards (PDF or the print shop's PNGs), which the spell-cards app did: not built yet.
- Whether a variant should be private to its author until they publish it.
