---
type: Feature
title: Rules glossary
description: The Player's Handbook's rules glossary (Anhang C), uploaded by the admin and never in the repository, explains conditions and rules terms with a dashed underline on spell cards, links its entries to each other, and explains the conditions on a token card.
tags: [feature, rules, spells, statuses, players]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-25T19:30:00Z }
---

# Goal

Players at the table look up what "Festgesetzt" or "schwieriges Gelände" does. The project owner asked on 2026-11-25 for hints on statuses and terms; the [spell cards](/features/spell-cards.md) plan ("Planned", step 2) had them for the 15 conditions. The project owner then provided the whole glossary of the German Player's Handbook (Anhang C, pp. 360–377) as a Claude Doc, "Regelglossar (Anhang C)", and chose the **whole glossary** over the conditions alone, and links between its entries.

The app explains; it doesn't apply rules ([overview](/overview.md), "show, don't enforce").

# Where the texts live

The texts are the Player's Handbook's, and the repository is public, so they never enter it (project owner, 2026-11-25), as with the seeded druid cards ([spell cards](/features/spell-cards.md), "Seeding from spell-cards"):

1. Export the Claude Doc as Markdown to a folder outside the repository (`regelglossar.md`).
2. `node scripts/glossary-seed.mjs <regelglossar.md>` writes `regelglossar.json` next to it: one entry per "### Name [Tag]" heading, with its text as Markdown, and links between entries (below).
3. The admin page's "Regelglossar übernehmen" uploads it; an upload replaces the whole glossary.

Every signed-in user reads it from the server; the site is invitation-only ([legal notice](/decisions/legal-notice.md)). Without an uploaded glossary nothing is underlined and nothing breaks.

## Entry

| Field | Limit | Notes |
|-------|-------|-------|
| `name` | 1–60, unique ignoring case | As the Handbook heads it: "Festgesetzt" |
| `tag` | 30, nullable | The rule family in brackets: Aktion, Gefahr, Haltung, Wirkungsbereich, Zustand |
| `text` | 1–8,000 | Markdown: paragraphs, bold, italic, lists, tables, and links `[[Name]]` |
| `position` | | The glossary's order |

At most 500 entries; the Handbook's has 155.

# Marking terms

Card texts (description, effect and table rows) mark a term with double brackets: `[[festgesetzt]]`, or `[[im Vorteil|Vorteil]]` when the words shown differ from the entry's name by more than an ending. The app finds the entry by the name, or by the words without a German ending (-e, -en, -em, -er, -es, -n, -s); an unknown term is plain text. Marks work inside bold and italic too.

- **Spell import** gets the glossary's names in its prompt and marks each condition and rules term that matters for the spell, the first time it appears; not in the name, stats, higher levels, tip or material.
- **The editor** says so in the description's hint.
- **Existing cards** get marks by an edit or the revision pass ([spell cards](/features/spell-cards.md), "Planned", step 4).

# Links between entries

`scripts/glossary-seed.mjs` links an entry to others where the Handbook refers to them: a quoted name ("*Siehe auch* „Begegnung“"), a line of names between "·" (the actions, the conditions) when most of them are entries, and a condition after "Zustand" or "Zustände" ("die Zustände Kampfunfähig und Liegend"). The Handbook's glossary gets 128 links, all to existing entries; an entry never links to itself.

# On screen

- **The mark**: a dashed underline in the school's colour on a card (about 0.25 mm, a little below the letters), solid with a faint tint while its explanation is open (project owner's idea). In the explanation itself, links have the same dashed underline in the app's candle colour.
- **A tap** shows the entry: its name, tag and text. On a phone a sheet at the bottom of the screen (at most 70 % of its height, scrolling); on a wider screen a box beside the term, below it when there is room. With a mouse, hovering shows it too and leaving closes it; a click keeps it open.
- A tap on a term **doesn't turn the card**. The card's turning is a hidden button of its own ("Netz: Karte umdrehen") for the keyboard and screen readers, whose focus rings the whole card, since a term button can't sit inside a card button.
- **Links** inside the explanation open the linked entry in place; "← Zurück" goes back along the way.
- **Escape** or a tap elsewhere closes it, never a dialog around the card.
- **Token card**: a status that is one of the 15 conditions opens on a tap with the condition's rules under it, above the status's buttons for whoever may change it ([token card](/features/token-card.md), [statuses](/features/statuses.md)).

# As built (2026-11-25)

- **Server**: `Rules/Glossary.cs` (`GlossaryEntry`, `GET /api/rules/glossary` for signed-in users, `PUT /api/admin/rules/glossary` for the admin, error `glossaryInvalid` with `entries` or `entries[i]`), migration `RulesGlossary`. Spell import's prompts end with the glossary's names (`SpellImportPrompts.GlossaryRule`).
- **Frontend**: `src/rules/glossary.ts` (store, lookup, the 15 conditions' entries, hover), `GlossaryTerm.tsx`, `GlossaryHint.tsx` (the explanation, mounted in `RequireAuth`; the entry's text with its links and tables), `UploadGlossary.tsx` on the admin page; `markup.tsx` renders marks; `FlipCard` turns with a hidden button; the token card explains conditions.
- **Script**: `scripts/glossary-seed.mjs`.
- **Tests**: `GlossaryTests`, `GlossaryUnitTests`; `src/rules/glossary.test.tsx`.
- **Not yet**: the explanation in the initiative list; links from a glossary text to chapters of the book ("*Siehe auch* Kapitel 1") stay plain text.
