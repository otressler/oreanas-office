---
type: Domain Entity
title: Spell
description: A spell of the 2024 Player's Handbook shared by the whole site, its class lists, its variants (the German card text one user wrote), the spells a character has, and the art studio's prompts and reviews per variant.
tags: [domain, spells, characters]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-25T16:30:00Z }
---

# Spell

Site-wide, not per campaign: every signed-in user sees every spell (project owner, 2026-11-21). The library holds exactly the 390 spells of the 2024 Player's Handbook (project owner, 2026-11-24), copied from `handbook.json` with their class lists ([handbook classes](/rules/handbook-classes.md)); users don't create spells, only cards for them.

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `nameEn` | string | The English name from the 2024 Player's Handbook ("Moonbeam"), up to 60 characters. Unique, ignoring case and surrounding spaces |
| `nameDe` | string, nullable | The German Player's Handbook 2024's name, up to 60 characters, from `handbook.json`. Shown for a spell without a card; a variant's card `name` wins. Null for the one Handbook spell without a name yet and for spells outside the Handbook |
| `slug` | string, nullable | Its page on dnd2024.wikidot.com (`hunter-s-mark`), which spell import reads |
| `level` | int | 0 (cantrip, "Zaubertrick") to 9 |
| `school` | enum | `abjuration`, `conjuration`, `divination`, `enchantment`, `evocation`, `illusion`, `necromancy`, `transmutation` |
| `inHandbook` | bool | False for a spell made before the library was limited (see below) |
| `createdAt` | | |

The level and school belong to the spell, not to a variant, because they are rules facts that all variants share. They come from the Handbook data; nobody edits them in the app (the admin's "Zauber korrigieren" is gone, 2026-11-24).

**Spells from before the limit**: a spell made by hand that isn't in the Handbook (the spell-cards app had five, such as Buzzing Bee) keeps its variants, art and characters, but leaves the library and gets no new variants. It goes when its last variant is deleted. Handbook spells stay without variants.

## Spell list entry

Which class lists a spell is on, and which subclasses grant it from which class level: `spellId`, `classId`, `subclassId` (null for a class list), `classLevel` (null for a class list). Written only from the Handbook data. The groundwork for a filter by what a character of given class levels can cast; the filters use it without levels for now.

# Spell variant

The German card text for a spell as one user wrote it ("Variante"). A spell has one or more variants; a player who doesn't like the existing ones makes their own (project owner, 2026-11-21). Only its **author** edits a variant (and site admins), and their edits reach every character that uses it (project owner, 2026-11-21). Variants are never deleted while a character uses them.

| Field | Type | Notes |
|-------|------|-------|
| `id` | id | |
| `spellId` | → Spell | |
| `authorUserId` | → [User](/domain/user.md) | |
| `basedOnVariantId` | → Spell variant, nullable | The variant it was copied from with "Eigene Variante" |
| `origin` | enum | `manual`, `wiki` (dnd2024.wikidot.com), `photo` (a photographed book page), `seed` (the spell-cards import) |
| `card` | document | The card's content, below |
| `artAssetId` | → [Asset](/domain/asset.md), nullable | The picture picked in the studio for the card's front. Without one the front shows the school's pattern |
| `artApproved` | bool | "Abgenommen" in the studio: the author is happy with the art |
| `createdAt`, `updatedAt` | | |

## The card

Always German and in meters (1.5 m per 5 ft, [units](/rules/movement-distance.md)). The layout is the tarot card of the spell-cards app (70 × 120 mm, front with art, back with the text).

| Field | Limit | On the card |
|-------|-------|-------------|
| `name` | 1–60 | German name, front and back. May hold break points: written `|` in the editor ("Sonnen|explosion"), stored as soft hyphens, which show only as a hyphen where the title breaks there (since 2026-11-25) |
| `castingTime`, `range`, `components`, `duration` | 40 each | The four stats on the back ("Zeitaufwand", "Reichweite", "Komponenten", "Wirkungsdauer") |
| `concentration`, `ritual` | bool | "K" and "R" badges |
| `description` | 3,000 | The main text; `**bold**`, `*italic*`, line breaks and rules terms marked `[[festgesetzt]]` ([rules glossary](/features/rules-glossary.md)) are the only inline markup; the marks work in effect and table rows too. A blank line starts a new paragraph, and lines starting with "- " make a list (since 2026-11-25). Since 2026-11-25 up to 3,000 (was 1,500): a long text scrolls on the back ([spell cards](/features/spell-cards.md), "The card") |
| `tables` | up to 3 | A spell's own tables, between the text and the effects (since 2026-11-25): Prismatic Wall's seven layers, Confusion's behaviour roll. Each has a `caption` (80, may be empty: what applies to every row) and 1–12 `rows`: `key` (6, e.g. "1" or "2–4", may be empty) in a strip of the row's `color` (`red`, `orange`, `yellow`, `green`, `blue`, `indigo`, `violet`, or none for the school's colour), `title` (30) and `text` (300, with the description's markup), at least one of the two, and an optional `chip` as on an effect row |
| `effects` | up to 6 | Rows below the text and tables: `icon`, `title` (30), optional `tag` (24, e.g. "Bonusaktion"), `text` (200) and an optional `chip` with `big` (12, e.g. "2W10"), `small` (14, e.g. "Gleißend") and a damage `kind` |
| `icon` | | The flourish icon on the front and the divider |
| `pips` | up to 2 icons | The front's corner icons; "K" and "R" take a corner first |
| `higherLevels` | 300 | "Stärker auf Stufe …" for a cantrip, "Höherer Grad: …" otherwise |
| `tip` | 200 | "Tipp: …" |
| `material` | 120 | "M: …" in the footer |
| `source` | 60 | The book, shown only when it isn't the Player's Handbook |
| `writeIns` | `attack`, `saveDc`, `modifier` | Blank lines to write the character's numbers on ("Angr. +", "SG", "Mod +") |
| `offerStatus` | bool | Not shown. "Als Zustand anbieten": the spell itself is offered as a status when it's added to a character (Hunter's Mark, Hex, Bless; since 2026-11-25, [spell cards](/features/spell-cards.md), "Statuses when a spell is added") |
| `statuses` | condition keys | Not shown. The conditions the spell causes, offered with it (`restrained` for Entangle); the editor suggests the conditions the card's texts mark. Konzentration isn't listed here: `concentration` offers it |

Icons and damage kinds come from a fixed list in the app (`src/web/src/spells/icons.ts`); the server checks the names.

# Character spell

The spells a [character](/domain/character.md) has: one variant per spell, and whether it is currently prepared ("vorbereitet").

| Field | Type | Notes |
|-------|------|-------|
| `characterId` | → Character | |
| `spellId` | → Spell | Unique per character: switching the variant keeps the entry |
| `variantId` | → Spell variant | |
| `prepared` | bool | Only prepared spells appear in the gallery at the table |
| `addedAt` | | |

Whoever may edit the character ([character](/domain/character.md), Permissions) adds, removes, switches and prepares its spells. Every member of the campaign sees them on the character page. Copying a character into another campaign ([character import](/features/character-import.md)) copies its spells too.

# Art studio

Per variant, the spell-cards studio's history, kept append-only like there (project owner chose the full studio, 2026-11-21), with one exception: a motif nothing came of may be deleted with all its revisions and its failed requests (project owner, 2026-11-25; [spell cards](/features/spell-cards.md), "Art studio"). Only the variant's author (and admins) changes it; every signed-in user can look.

- **Art prompt** ("Motiv"): `variantId`, `letter` (`a`–`z`, one line of ideas each), `subject` (up to 1,500 characters), `createdAt`, `createdByUserId`. Each save adds a revision; the newest per letter is current. The app adds the style block (`ImageOptions.SpellArtStyle`) around the subject.
- **Art picture**: an [asset](/domain/asset.md) of kind `SpellArt`, owned by the variant, with the prompt revision it came from (`spellArtPromptId`), or an upload. Generated pictures go through the site's one image queue and count against the [budget](/decisions/image-budget.md). The asset row is also the request: queued, running, done or failed.
- **Art event**: `variantId`, optional `assetId`, `kind` (`comment`, `favorite`, `reject`, `dismiss`), `value`, `createdAt`, `userId`. The newest `favorite`/`reject` per picture counts ("1" or "0"); `dismiss` hides a failed request; a comment without a picture is a note on the variant.

# Suggestions and revisions

Since 2026-11-25 ([spell cards](/features/spell-cards.md), "Planned", steps 4 and 5).

- **Art prompt source**: `studio`, `seed` or `suggestion` (written by the suggestion queue, shown as "Vorschlag").
- **Card draft**: `spellId` (one per spell), the `card` as the text model wrote it from the wiki, an optional motif `subject`, `createdAt`, `createdByUserId` (the admin who started the run). Not a variant: it isn't in the library's "Mit Karte" and can't go on a character. Taking it makes a variant and removes it.
- **Card revision**: `variantId`, the `previous` card, `createdAt`, `revertedAt`. Made when the revision pass saves a card; "Zurücksetzen" puts `previous` back while the variant's `updatedAt` is still the revision's.
- **Spell job**: `kind` (`draft`, `motif`, `revision`), `spellId`, `variantId` (motif and revision), `status` (`queued`, `running`, `done`, `failed`), `outcome` for a done job (`saved`, `unchanged`, `wordsChanged`), `error`, `detail` (for `wordsChanged` the first field that differed), `attempts`, `createdAt`, `startedAt`, `finishedAt`, `createdByUserId`. Worked one at a time by its own background worker; jobs cut off by a restart go back to the queue when the app starts.
