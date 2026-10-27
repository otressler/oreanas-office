---
type: Feature
title: Creature page
description: The bestiary as cards like the characters', and a page per creature type that the DM reads and edits in place, offline, with its size, initiative, appearance and notes.
tags: [feature, campaigns, bestiary]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T15:50:00Z }
---

# Goal

The project owner asked (2026-10-27) for the bestiary to follow the design of the characters on the [campaign page](/features/campaign-page.md) and the [character page](/features/character-page.md): cards instead of a plain list, and a page per creature type. They chose a backdrop of the creatures' own and a real route per type over a panel on top of the grid.

# Bestiary page

`/kampagnen/:campaignId/bestiarium`, at a desktop's width, still an offline page for `dm` members only ([campaign page](/features/campaign-page.md), "Bestiary page").

- Every active [creature type](/domain/creature-type.md) is a card like a character's: its picked icon uncropped in a generated lair alcove, lit in the creatures' red, with a red bar along the top. Below it the name, the size and the initiative modifier ("Klein · Ini +2"), and the start of the appearance as one plain line (two lines at most, markdown marks left out). Without an icon, or offline, the token's letter stands in. The whole card links to the type's page.
- The grid is denser than the characters', since a bestiary grows to dozens of types: two columns on phones, three from `sm`, four from `md`, five from `lg`. The last tile, "Neue Kreaturenart", opens the type's page as the editor.
- From 12 types on, "Nach Namen filtern" above the cards narrows them by name.
- Archived types are folded away under "Archiviert (n)": each name opens its page, "Zurückholen" brings it back at once.

The editor's side panel keeps the compact list for picking a type while placing creatures; that list no longer appears on the bestiary page.

# Creature page

`/kampagnen/:campaignId/bestiarium/:typeId`, built from the same pieces as the character page (`src/components/sheet.tsx`). Offline like the bestiary: it reads and writes the campaign's copy in this browser.

- A link back to the bestiary, the icon in the red light on the left (the letter without one), "Kreaturenart" (or "Archivierte Kreaturenart") over the name, the labelled "Bearbeiten" button and "Archivieren".
- The facts under the name: **Größe**, **Platz** (the footprint, "2 × 2 Felder") and **Initiative** ("+2", "−1 mit Vorteil").
- Two texts under their headings, **Aussehen** and **Notizen der Spielleitung**, with the same little markdown as the character texts; an empty one says "Noch nichts eingetragen."
- An archived type says so in a box with "Zurückholen".

# Editing in place

As on the character page: the name becomes a field, then Größe (with its footprint), Initiative-Modifikator and Initiative-Wurf side by side; the two texts become growing boxes with a counter (appearance 500, notes 2,000 characters). The icon tools ("Symbol": generate, upload, versions, or "Jetzt synchronisieren" for a type the server hasn't seen) sit under the icon and save unsaved edits first, as before ([token icons](/features/token-icons.md)). One bar sticks to the bottom with "Abbrechen" and "Änderungen speichern"; leaving with unsaved changes asks first. The checks are the old form's: a name is required, unique in the campaign ignoring case (archived types included), and the modifier is a whole number from −10 to +20; problems show at the field and in the bar.

"Neue Kreaturenart" opens `/kampagnen/:campaignId/bestiarium/neu`: the page as the editor with an empty type. Nothing is stored until saving; then its page opens in reading mode, replacing the "neu" entry in the history. The icon tools wait for the first save.

# As built

Frontend only; no API or schema change. Built on `feature/bestiary-sheets`.

- The character page's pieces (back link, section title, facts, text box, story section, portrait, save bar) moved to `src/components/sheet.tsx`, the leave warning to `useLeaveWarning.ts`, and the card and "add" tile to `SheetCard.tsx`; both pages and both grids use them. Shared text is `de.sheet`.
- The lair alcove was generated with the `nano-banana` skill (Gemini), three variants, the third picked: an empty niche in a rough stone arch with chains, bones and a horned skull, two torches. It came at 768 × 1376 and is kept as WebP at 512 and 768 px wide in `src/web/public/campaign/` (precached); the cards are at most about 220 px wide.

# Open

- Hit points and stat blocks on the page wait for the [backlog](/backlog.md).
- Creature types have no status list of their own; their creatures pick from the DM's list ([statuses](/features/statuses.md)).
