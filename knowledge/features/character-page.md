---
type: Feature
title: Character page
description: A page per character that every campaign member can read and only its player and dm members edit, in place, with four texts - appearance, background, personality and bonds.
tags: [feature, campaigns, characters]
status: draft
generated: { by: claude-code/claude-sonnet-5-5, at: 2026-10-27T12:45:00Z }
---

# Goal

The project owner asked (2026-10-27) for a page per character where other players read about a character and only the player who owns it edits. A second round the same day: editing must not feel like a form pasted onto the page, and the texts that matter are **Aussehen, Hintergrund, Persönlichkeit and Verbindungen**; all but Verbindungen are taken into account when a portrait is generated.

# Page

`/kampagnen/:campaignId/charaktere/:characterId`. On the [campaign page](/features/campaign-page.md) a character's whole card links here; editing and the status list live only on this page. The "Neuer Charakter" tile links to `/kampagnen/:campaignId/charaktere/neu`, the same page as the editor with an empty character (see "New character").

On a wide screen the top row has the portrait on the left and the name, the edit button and the flavor sentence beside it; the four texts and the status list follow below at reading width. On a phone everything stacks. For every member:

- A link back named after the campaign ("← Der Fluch von Barovia").
- A portrait in the ring colour's light (the token's letter without one), the name, "Dein Charakter" or who plays it, and the **flavor sentence** ("Kurzer Satz", up to 120 characters) under the name. The same sentence stands under the portrait on the character's card on the campaign page.
- The facts under the name: **Klasse**, **Spezies**, **Alter** (free text) and **Größe** (the creature size), each a small label over its value; an empty one is left out. The size is no longer next to the owner note.
- The four texts, each under its own heading: **Aussehen**, **Hintergrund**, **Persönlichkeit**, **Verbindungen**. An empty one says "Noch nichts eingetragen." The texts take a little markdown: bold, italic, lists and line breaks. Headings, links, images and raw HTML are shown as plain text, so one player's text can't bring links or pictures onto another's page.
- Whoever may edit the character ([character](/domain/character.md), "Permissions") also sees its status list ([statuses](/features/statuses.md)), folded behind "Zustandsliste zeigen" because it is a combat setting, not part of the story.

# Editing in place

Whoever may edit has a labelled "Bearbeiten" button by the name. It does not open a form beside the page: the page itself turns into the editor and the portrait stays where it was.

- The name becomes a field; below it the flavor sentence (two lines), Klasse, Spezies, Alter, Größe, "Gespielt von" (`dm` members only) and "Farbe auf dem Brett": the default colours as swatches with the chosen one marked (also the automatic one), and a "+" swatch that opens a hex field.
- Each of the four texts becomes a box under the same heading that grows with its text. Under it stand the hint and a counter on the right, which stands out near the limit (appearance 750, background 1,500, personality 750, bonds 1,500 characters; markdown characters count). The hints say which texts feed the portrait and that markdown works.
- The portrait tools sit in the left column under the portrait: "Neues Porträt erzeugen" (a secondary button, since saving is the primary action), upload, "Ohne Bild" and the versions as a grid of thumbnails. They say they use the text currently in the fields.
- The status list is hidden while editing.
- One bar sticks to the bottom of the screen with "Abbrechen" and "Änderungen speichern", and "Ungespeicherte Änderungen" once something changed. Save sends every field at once and returns to reading; cancel drops what was typed. A server error shows in the bar. Closing the tab or moving to another page with unsaved changes asks first.
- Generating a portrait saves changed fields first, because the server paints from its copy ([token icons](/features/token-icons.md)).

# New character

The "Neuer Charakter" tile on the campaign page opens `/kampagnen/:campaignId/charaktere/neu`: the page as the editor with a blank character, so there is one form for creating and editing. Nothing exists on the server until "Änderungen speichern" (a name is required): then the character is created and its page opens in reading mode, replacing the "neu" entry in the history. "Abbrechen" returns to the campaign page. The leave warning applies here too. A `dm` member also sees "Gespielt von", which starts as themselves. The portrait tools wait for the first save, since a portrait belongs to a saved character.

# Portrait prompt

Name and appearance as before, then a line with the species, class and age that are filled in ("Species: Waldelfe. Class: Waldläuferin. Age: 112."), then one line with the background and personality when they are filled in: "Background: …. Personality: …. Let this show in the expression, clothing and bearing, without drawing scenes from it." A portrait still needs a filled-in appearance. Bonds are never sent.

# As built

API: `CharacterRequest` and `CharacterResponse` carry `background`, `personality`, `bonds` and `tagline`; a missing text saves as empty. Migration `CharacterStory`. The separate new-character form on the campaign page is gone.

# Open

- Not built from the second review round: a blurred portrait behind the header, links to the other characters, a marker for which texts are visible to whom, and a placeholder tagline on the campaign page's other cards.
- Whether a text should be private to its player and `dm` members (secrets); today all four are readable by every member.
- Class, level, race and other structured sheet fields are not built; they come with the full character sheet in the [backlog](/backlog.md).
