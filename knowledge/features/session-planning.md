---
type: Feature
title: Session planning
description: The DM plans a game night as a session, adds its fights, runs them from the session page, and continues an ended session on another day.
tags: [feature, dm, session]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-14T21:55:33Z }
---

# Goal

Plan a game night as a whole and run it from one place. The DM thinks in game nights ("what do we play on Friday?"), so the [session](/domain/session.md) is the folder that holds its fights, not a switch that only says "we play now". Decided by the project owner on 2026-10-14, after finding sessions and fights unconnected on the campaign page.

# The DM's workflow

1. Create a planned session.
2. Add fights to it: on a map of the campaign, on a copy of one, or on a new map. Place the enemies in the [map editor](/features/dm-map-editor.md) and mark the fight ready.
3. Start the session when the group sits at the table.
4. Start one of its ready fights: tick the characters taking part and place them (the setup screen, [encounter](/domain/encounter.md)).
5. For a last-minute change, add another fight to the running session the same way.
6. End the session. If the group didn't get through it, continue it on another day.

# Campaign page

- The sessions are the main list: the running session on top, then planned sessions by date, then ended ones (collapsed, newest first).
- Each session shows as a card with its title, date, DM, status and its fights with their status. `dm` members see every fight; players see only the running one.
- The card opens the session page. The running fight has a "Zum Kampf" button on the card, for everyone.
- The campaign-wide "Kämpfe" panel goes away: every fight belongs to a session ([encounter](/domain/encounter.md)).

# Session page

`/kampagnen/:id/sitzungen/:sessionId`. What it offers depends on the session's status and the viewer.

- **Header:** title, date, DM and status. The session DM edits title and date. The session DM or the campaign's default DM starts, ends, continues and hands over the session ([session](/domain/session.md)).
- **Fights:** the session's fights in the order they were added, each with its name, map, creature count and status (Entwurf, Bereit, Läuft, Vorbei). A fight whose creatures no longer stand validly on a changed map carries the warning from the editor.
- **For the session DM, per fight:** open it in the editor, start it (ready fights, while the session runs and no other fight runs), move it to another planned or running session they run, archive it. Draft and ready fights can be moved; running and ended ones can't.
- **For the session DM, for the session:** "Kampf hinzufügen", "Karte importieren" (the [import file](/domain/battle-map.md) now creates its fight in this session).
- **Players** see the session's header and the running fight with "Zum Kampf". Prepared and ended fights stay hidden from them, as before ([encounter](/domain/encounter.md)).
- Ending a fight returns everyone to the session page.

# Adding a fight

"Kampf hinzufügen" asks for a name and how to get the map:

| Choice | What happens |
|--------|--------------|
| **Vorhandene Karte** | Pick one of the campaign's maps. The new draft fight uses that map. |
| **Karte kopieren** | Pick a map. It is duplicated (with `copiedFromMapId`, [battle map](/domain/battle-map.md)), and the fight uses the copy. |
| **Neue Karte** | Name and size. A new empty map is made, and the editor opens in map mode with the fight in its "Begegnungen" menu. |

- **Shared maps change for every fight on them.** Draft and ready fights always use the map's current layout. The map picker shows how many planned fights use each map and says that changes to the map reach those fights too; "Karte kopieren" is the way to change a map for one fight only.
- The first two open the new fight in the editor's encounter mode, where the DM places creatures and marks it ready.
- Archived maps aren't offered. The map store stays in the map list ([DM map editor](/features/dm-map-editor.md)); a copy added from there can then be picked.
- Works offline like any other prep: the fight, a copied map and a new map are saved on the device and synced later ([offline prep](/decisions/offline-prep-pwa.md)). The session itself must already exist on the device, since sessions are created online.
- The editor needs a wide screen (about 1024 px); on a narrow one the dialog says so, as "Neue Begegnung" does today.
- The editor's own "Neue Begegnung" in the "Begegnungen" menu asks which session the fight goes in: the planned and running sessions the user runs. Without one it says a session must be created first.

# A fight at short notice

When the group goes somewhere the DM didn't plan for, the DM adds a fight to the running session the normal way ("Kampf hinzufügen"), places the creatures in the editor, marks it ready and starts it. There is no separate quick mode: such maps don't need to be fleshed out, and a short break at the table is fine (decided by the project owner on 2026-10-15).

# Continuing an ended session

"Sitzung fortsetzen" on an ended session, for when the group didn't get through it in one evening.

- The same people who start a session continue it: the session DM or the campaign's default DM. It fails while another session of the campaign runs ([session](/domain/session.md)).
- The session becomes `active` again. Its unplayed fights are still there.
- **An interrupted fight comes back.** If ending the session ended a running fight, continuing brings that fight back as running, with every token where it stood and its move history kept. Players opening the app land on it again. Fights the DM ended by hand stay ended.
- The session's date doesn't change.

# Open questions

None at the moment.
