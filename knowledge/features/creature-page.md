---
type: Feature
title: Creature page
description: The bestiary as cards like the characters', and a page per creature type that the DM reads and edits in place, offline, with its size, initiative, appearance and notes.
tags: [feature, campaigns, bestiary]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-27T17:00:00Z }
---

# Goal

The project owner asked (2026-10-27) for the bestiary to follow the design of the characters on the [campaign page](/features/campaign-page.md) and the [character page](/features/character-page.md): cards instead of a plain list, and a page per creature type. They chose a backdrop of the creatures' own and a real route per type over a panel on top of the grid.

# Bestiary page

`/kampagnen/:campaignId/bestiarium`, at a desktop's width, still an offline page for `dm` members only ([campaign page](/features/campaign-page.md), "Bestiary page").

- Every active [creature type](/domain/creature-type.md) is a card like a character's: its picked icon uncropped in a generated lair alcove, lit in the creatures' red, with a red bar along the top. Below it the name, the size and the initiative modifier ("Klein · Ini +2"), and the start of the appearance as one plain line (two lines at most, markdown marks left out). Without an icon, or offline, the token's letter stands in. The whole card links to the type's page.
- The grid is denser than the characters', since a bestiary grows to dozens of types: two columns on phones, three from `sm`, four from `md`, five from `lg`. The last tile, "Neue Kreaturenart", opens the type's page as the editor.
- From 12 types on, "Nach Namen filtern" above the cards narrows them by name.
- Archived types are folded away under "Archiviert (n)": each name opens its page, "Zurückholen" brings it back at once.

The editor's side panel keeps the compact list for picking a type while placing creatures; that list no longer appears on the bestiary page. Its "Ändern" and "Neue Kreaturenart" open the creature page as a dialog over the editor (see "In the editor" below).

# Creature page

`/kampagnen/:campaignId/bestiarium/:typeId`, built from the same pieces as the character page (`src/components/sheet.tsx`). Offline like the bestiary: it reads and writes the campaign's copy in this browser.

- A link back to the bestiary, the icon in the red light on the left (the letter without one), "Kreaturenart" (or "Archivierte Kreaturenart") over the name, the labelled "Bearbeiten" button and "Archivieren".
- The facts under the name: **Größe**, **Platz** (the footprint, "2 × 2 Felder") and **Initiative** ("+2", "−1 mit Vorteil").
- Two texts under their headings, **Aussehen** and **Notizen der Spielleitung**, with the same little markdown as the character texts; an empty one says "Noch nichts eingetragen."
- An archived type says so in a box with "Zurückholen".

# Editing in place

As on the character page: the name becomes a field, then Größe (with its footprint), Initiative-Modifikator and Initiative-Wurf side by side; the two texts become growing boxes with a counter (appearance 500, notes 2,000 characters). While editing, the texts move up into the right column under the fields, beside the portrait and its icon tools, so the column doesn't stand empty; read, they stay under the whole page (project owner, 2026-10-27). The icon tools ("Symbol": generate, upload, versions, or "Jetzt synchronisieren" for a type the server hasn't seen) sit under the icon and save unsaved edits first, as before ([token icons](/features/token-icons.md)). One bar sticks to the bottom with "Abbrechen" and "Änderungen speichern"; leaving with unsaved changes asks first. The checks are the old form's: a name is required, unique in the campaign ignoring case (archived types included), and the modifier is a whole number from −10 to +20; problems show at the field and in the bar.

"Neue Kreaturenart" opens `/kampagnen/:campaignId/bestiarium/neu`: the page as the editor with an empty type. Nothing is stored until saving; then its page opens in reading mode, replacing the "neu" entry in the history. The icon tools wait for the first save.

# In the editor

At the project owner's request (2026-10-27), the editor's side panel no longer has a form of its own, which was too cramped in the narrow panel. "Ändern" on a row and "Neue Kreaturenart" open the creature page in a wide dialog over the editor, so the DM stays on the map.

- The dialog opens straight into editing, without the back link; its title is "Goblin bearbeiten" or "Neue Kreaturenart". The checks and icon tools are the page's. Its portrait column is slightly narrower than the page's.
- Saving closes it. A new type becomes the picked one; an edited type that is picked updates the pick.
- "Abbrechen" closes it without asking. The close button and Escape ask first when there are unsaved changes ("Trotzdem schließen?"), and closing the tab asks as on the page.
- "Archivieren" stands at the start of the save bar for a type that isn't archived yet. It drops unsaved edits, closes the dialog, and unpicks the type if it was picked.
- A dialog opened from the dialog, such as the icon's confirm or crop step, takes Escape for itself; the creature dialog stays open.

# As built

Frontend only; no API or schema change. Built on `feature/bestiary-sheets`.

- The character page's pieces (back link, section title, facts, text box, story section, portrait, save bar) moved to `src/components/sheet.tsx`, the leave warning to `useLeaveWarning.ts`, and the card and "add" tile to `SheetCard.tsx`; both pages and both grids use them. Shared text is `de.sheet`.
- The old side-panel form (`CreatureTypeForm.tsx`) is gone; `CreatureDialog` in `CreaturePage.tsx` wraps the same page in `Modal` (new size `page`). `Modal` keeps a stack of open dialogs so Escape closes only the newest. The dialog doesn't block in-app navigation, since the editor isn't always under a data router in tests; it only asks on closing and on unload.
- The lair alcove was generated with the `nano-banana` skill (Gemini), three variants, the third picked: an empty niche in a rough stone arch with chains, bones and a horned skull, two torches. It came at 768 × 1376 and is kept as WebP at 512 and 768 px wide in `src/web/public/campaign/` (precached); the cards are at most about 220 px wide.

# Open

- Hit points and stat blocks on the page wait for the [backlog](/backlog.md).
- Creature types have no status list of their own; their creatures pick from the DM's list ([statuses](/features/statuses.md)).
