---
type: Implementation Plan
title: Implementation plan
description: The roadmap split into ten stages, each ending in a quality gate the project owner checks by hand, with the order of work and where subagents in worktrees can run in parallel.
tags: [planning, process]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T21:21:07Z }
---

# How this plan works

The [roadmap](/roadmap.md) phases are too big to check in one go, so each phase is split into **stages**. Every stage ends with a **quality gate**:

1. Claude finishes the stage and runs the automated checks: unit tests, Playwright end-to-end tests, and a code review of the stage's diff.
2. Claude hands over a short report: what was built, test results, anything that differs from the spec, and the manual checklist.
3. The project owner works through the checklist by hand. The stage passes only when every item passes.
4. Claude merges the stage into `main`, deploys, and updates the knowledge base: decisions confirmed by the stage, answered open questions, and a dated entry in the [log](/log.md). It also raises `BUILT_THROUGH_STAGE` in `src/web/src/pages/RoadmapPage.tsx`, so the app's public roadmap page (`/fahrplan`) marks the stage as done, and updates that page's text in `de.roadmap` when a stage's scope changes.

The next stage starts only after the gate passes. Gate findings are fixed inside the same stage.

| Stage | Phase | Feature set | Gate in one sentence |
|-------|-------|-------------|----------------------|
| T0 | 0 | Image spike (runs alongside stages 1–6) | 3–4 sample layouts give backgrounds that line up with the grid |
| 1 | 1 | Walking skeleton | The empty app runs locally and in production, installs as a PWA and wakes from zero |
| 2 | 1 | Accounts and campaigns | Two people sign in, one joins the other's campaign, and both stay signed in across restarts |
| 3 | 1 | Board on screen | A hand-made map shows up on every phone with grid, tokens, zoom and pan |
| 4 | 1 | Live table | Players and the DM move tokens, live on all devices |
| 5 | 2 | Offline map editor | The DM builds a map on a laptop with no connection |
| 6 | 2 | Bestiary, encounter prep and sync | The DM preps a whole encounter offline, syncs it and runs it |
| 7 | 3 | AI backgrounds and session planning | The editor generates backgrounds, the DM picks one, and the board shows it; the DM plans a session's fights and runs them from the session page |
| 8 | 3 | Token icons and portraits | Creatures get generated icons, characters get portraits |
| T1 | 4 | Condition icon library (before stage 9) | The 15 condition icons read as one set at token size |
| 9 | 4 | Pings, token card, statuses and removing tokens | Everyone points at cells and tokens, taps a token for its card, and puts statuses on tokens; the DM takes tokens off the board |
| 10 | 4 | Fog of war and spectator view | The DM reveals map and creatures by hand, and a screen in the middle follows the fights by itself |

Phase 1 of the roadmap is done after stage 4, phase 2 after stage 6, phase 3 after stage 8 and phase 4 after stage 10. The project owner reordered phase 4 on 2026-10-16: pings, the token card, statuses and removing tokens first, then fog of war and the spectator view. The measuring tools, which were stage 9, moved to the [backlog](/backlog.md).

# Working method

## Who does what

- **The main Claude session is the integrator.** It plans each stage, writes the shared contracts, merges the lanes, runs the full test suite and talks to the project owner.
- **Lanes are subagents in their own git worktree** (`isolation: worktree`). Each lane gets a precise brief: the folder it owns, the contract it codes against, the knowledge concepts to read, and the tests that must pass before it reports back.
- **Two to four lanes per stage.** More lanes cost more in merging than they save.
- Well-specified, self-contained lanes (pure functions such as pathfinding or the guide renderer) can run on a smaller model. Contracts and integration stay with the integrator.

## Shape of every stage

1. **Contract first (sequential, integrator).** Entities and the EF Core migration, endpoint signatures returning stubs, the generated TypeScript API types, SignalR message types, new npm and NuGet packages, and test fixtures. Committed on the stage branch `stage/<n>-<name>`.
2. **Lanes (parallel, worktrees).** Each lane branches from the contract commit and works only in its own folders.
3. **Integration (sequential, integrator).** Merge the lanes, run all tests, run the Playwright scenario for the gate, review the diff, deploy, hand over.

## Rules that keep worktrees from colliding

- **Shared files belong to the integrator:** `Program.cs`, the `DbContext`, EF migrations, `package.json` and lock files, the generated API types, the app router and the editor's tool registry. Each backend feature registers itself through its own extension method (`builder.AddTableHub()`), so wiring it in is a one-line merge.
- **Migrations are created only by the integrator**, once, after the lanes are merged. Two worktrees generating migrations always conflict in the model snapshot.
- **Packages are added in the contract step**, so lanes never touch lock files.
- **Lanes don't edit `knowledge/`.** If a lane finds a gap in the spec, it says so in its report, and the integrator asks the project owner (the rule in the project's `CLAUDE.md`: code and knowledge must not silently disagree).
- **Only one agent at a time may call the Foundry image deployment.** It allows 2 requests per minute, and rejected requests count ([image generation approach](/decisions/image-generation-approach.md)). Lanes test against a fake image client.

## Testing on real phones before production

The PWA needs HTTPS, and phones can't reach `localhost`. To check a stage on phones before it reaches production, the developer's machine serves it at `https://dev.oreanas-office.otressler.de`, reachable only inside the home network. `pwsh scripts/phone.ps1` starts the production container, its database and a Traefik proxy there (Docker Compose profile `phone`). Traefik gets a Let's Encrypt certificate through the INWX DNS challenge, and a public A record points the domain at the machine's home network address. The project owner's homeserver isn't involved. The domain is a Google redirect URI from stage 2 on. Until stage 4 passes nobody plays on production, so stages 1–4 may also be checked directly on production. From stage 5 on, production is in use, so gates are checked on the phone test address first and deployed after they pass.

# Decisions to confirm

These are open or only proposed in the knowledge base. Each has a default that the plan uses unless the project owner decides otherwise.

| # | Question | Needed by | Default in this plan |
|---|----------|-----------|----------------------|
| 1 | UI language | Stage 1 | **Answered:** German only ([UI language](/decisions/ui-language.md)); more languages are in the [backlog](/backlog.md) |
| 2 | Where does the code live? | Stage 1 | **Answered:** the GitHub repository `otressler/oreanas-office` |
| 3 | Who provisions Azure? | Stage 1 | **Answered:** only the project owner. Claude writes the templates and gives a summary of every resource and its cost before each provisioning ([hosting](/decisions/hosting.md)) |
| 4 | [Persistence](/decisions/persistence.md) and [realtime sync](/decisions/realtime-sync.md) are only proposed, but stages 2–4 build them | Stage 2 / Stage 4 | **Answered:** persistence accepted as written. Realtime sync accepted at the start of stage 4: last move wins, only confirmed moves are sent, undo only your own last move while it is the token's latest, moving off while disconnected, idle connections drop after 30 minutes ([realtime sync](/decisions/realtime-sync.md)) |
| 5 | When an encounter starts, how do characters get onto the board? ([DM map editor](/features/dm-map-editor.md) open question) | Stage 3 | **Answered:** the session DM ticks the characters and places each one on a setup screen; starting creates their tokens ([encounter](/domain/encounter.md)) |
| 6 | The sample "Gorge crossing" map has its bridge over `void` cells, but `void` blocks movement and a feature with `blocksMovement: false` doesn't make cells walkable ([battle map](/domain/battle-map.md), [movement rules](/rules/movement-distance.md)) | Stage 3 | **Answered** for placement and moves: a non-blocking feature makes its footprint walkable at the feature's elevation, whatever the terrain below ([encounter](/domain/encounter.md)). For paths it is deferred with the distance rules |
| 7 | Corner rule: does one blocked side cell block a diagonal? | Deferred | **Deferred:** distance rules are out of the proof of concept. The current reading stays "either side blocks" |
| 8 | Elevation and flying in the distance preview | Deferred | **Deferred** with the distance rules |
| 9 | [Offline prep and PWA](/decisions/offline-prep-pwa.md) is only proposed | Stage 5 | **Answered:** accepted, including campaigns created offline (question 15). The stage 6 sync protocol is still approved separately |
| 10 | Largest grid size | Stage 5 | **Answered:** 40×40. A map wider than 3:1 gets padding painted as dead terrain or darkness ([image generation approach](/decisions/image-generation-approach.md)) |
| 11 | [Image budget](/decisions/image-budget.md) | Stage 7 | **Answered:** $20 a month for all image generation, no limit per map, high quality by default |
| 12 | Are ruler and area templates shared with everyone, or only on the measuring device? | Backlog | Shared, like pings, and not saved. The measuring tools moved to the [backlog](/backlog.md) on 2026-10-16 |
| 13 | What "HP and conditions" means, and how it relates to status rings in the [backlog](/backlog.md) | Stage 9 | **Answered** on 2026-10-16: conditions are [statuses](/features/statuses.md) in stage 9; hit points moved to the [backlog](/backlog.md) |
| 14 | How do images reach the browser: public blob container, short-lived signed links, or through the app? ([persistence](/decisions/persistence.md)) | Stage 7 | **Answered:** through the app at `/api/assets/{id}`, for members of a campaign that uses the image, cached for good by the browser and the service worker |
| 15 | Can campaigns be created offline? | Stage 6 | **Answered:** yes, only creating; no join code, members, characters or sessions until it syncs ([offline prep](/decisions/offline-prep-pwa.md)). Built with sync in stage 6 |
| 16 | Does a copy from the map store take the chosen background image? ([battle map](/domain/battle-map.md)) | Stage 7 | **Answered:** yes, the copy points to the same image asset, and its DMs can regenerate it |
| 17 | Stage 7 details | Stage 7 | **Answered:** an encounter saves the picked background when it starts; changing a map's size makes its backgrounds outdated; nothing is generated without the DM confirming the job; the map syncs before a job is queued; any `dm` member generates; production uses the same Foundry deployment as development ([AI map generation](/features/ai-map-generation.md), [battle map](/domain/battle-map.md)) |
| 18 | How do sessions and fights relate? | Stage 7 | **Answered** at the stage 7 gate: every fight belongs to a session; only the session DM plans its fights; continuing an ended session brings back the fight it interrupted; built inside stage 7 ([session planning](/features/session-planning.md)) |
| 19 | Stage 8 details | Stage 8 | **Answered:** players generate portraits of their own characters from the shared budget; characters get an `appearance` field; an uploaded picture can be restyled into the token style; uploads get a crop step; icons and portraits keep versions to pick from; the board shows the current image, without live updates ([token icons](/features/token-icons.md)) |
| 20 | Controls for pings and the token card ([token card](/features/token-card.md), "Why this layout") | Stage 9 | **Answered** on 2026-10-16: a double tap on a token pings the token, so there is no "double tap and hold"; pings also work while a token is selected, because the first tap is taken back; tapping the selected token lets it go instead of cycling through the stack, whose tokens the card lists |
| 21 | May players put statuses on their own characters? | Stage 9 | **Answered** on 2026-10-16: yes, as the backlog had it. Players put statuses on their own characters and on any creature they can see; the session DM on any token |
| 22 | Whose is the DM's own status list? | Stage 9 | **Answered** on 2026-10-16: one per `dm` member of the campaign, not one per session, so it stays with the person when sessions change hands |
| 23 | Who may remove a status? | Stage 9 | **Answered** on 2026-10-16: the session DM any; a player those they put on |
| 24 | Do spectators join a session or the campaign? | Stage 10 | **Answered** on 2026-10-16: a session. The device may differ each time, and usually one person signs in on a phone to play and on a tablet to watch, so spectating is a mode of the connection: members open it from the session page, others get spectator access to that one session ([spectator view](/features/spectator-view.md)) |
| 25 | Does the spectator QR code also let players join? | Stage 10 | **Answered** on 2026-10-16: yes, the join page asks "Mitspielen" or "Nur zuschauen", and a wrong choice can be changed by joining again; this takes "Join by QR code" out of the [backlog](/backlog.md) |
| 26 | Open questions 1–5 of [fog of war](/features/fog-of-war.md): background image sent whole, areas on the encounter, characters always visible, no moving into fog, spawning stays in the backlog | Stage 10 | **Answered** on 2026-10-16: the concept's proposals, all six ([fog of war](/features/fog-of-war.md)) |
| 27 | Which stage gets removing tokens? ([removing tokens](/features/removing-tokens.md)) | Stage 9 | **Answered** on 2026-10-16: stage 9, since its button sits on the token card |

# T0 — Image spike (parallel track)

Runs alongside stages 1–6. It needs only the `image-assets` skill and no app code.

- Use the sample maps from stage 3 as layouts. They cover the hard cases: an edge-heavy dungeon, a large open field near 40 cells, a wide map near 3:1, and the gorge crossing.
- Generate each at low quality, then medium; check the fit with `check_alignment.py`; regenerate with prompt fixes where needed.
- Record cost and time per image and quality level in the [image budget](/decisions/image-budget.md).

**Order:** strictly one generation at a time because of the rate limit. Claude runs it as one background job between stage work, never as parallel agents.

**Gate:** the project owner looks at the review sheets and decides whether the [image generation approach](/decisions/image-generation-approach.md) is accepted. Stage 7 needs that. **Passed on 2026-10-14:** the approach is accepted, with high quality as the default. The image budget is already set (question 11); T0's cost numbers let the app count costs against it.

# Stage 1 — Walking skeleton

**Feature set**

- Repository layout: `src/Server` (ASP.NET Core, .NET 10), `src/web` (Vite, React, TypeScript), `tests/`. One command starts local development; Docker Compose runs SQL Server and Azurite.
- EF Core with the first migration, applied on startup (one replica, so no race).
- `GET /api/health`, which also touches the database, so a call wakes it.
- ASP.NET Core Data Protection keys in Blob Storage, so sign-in survives cold starts ([hosting](/decisions/hosting.md)).
- OpenAPI document and an `npm run gen:api` script with openapi-typescript.
- PWA: manifest, icons, service worker caching the app shell only, and the waking screen ("Der Tisch wird geweckt…" or similar).
- Install button in the header: the browser's install dialog where supported, instructions on iOS ([playable map](/features/playable-map.md)).
- German interface text in one message catalogue, and German number and date formatting ([UI language](/decisions/ui-language.md)).
- Dockerfile that builds the frontend into `wwwroot`. Bicep for the Container Apps environment (Consumption, 0–1 replicas), the free Azure SQL offer set to "continue with charges", Storage with soft delete, small logging, and budget alerts at $10 and $30. A GitHub Actions workflow: build, test, push to GHCR, update the container app.

**Order**

1. *Sequential:* scaffold both projects, test projects, Compose file, lint and format settings, all packages.
2. *Parallel, three lanes:*
   - **Infra:** Dockerfile, Bicep, deploy script, GitHub Actions.
   - **Backend:** health endpoint, `DbContext` and first migration, Data Protection, logging levels, OpenAPI.
   - **Frontend:** PWA config, app shell, waking screen, routing skeleton, Tailwind, the German message catalogue, Vitest and Playwright setup.
3. *Sequential:* integrate, run the container locally, then Claude hands over the provisioning summary (resources, settings, monthly cost) and the project owner runs the first Azure deployment.

**Automated:** backend and frontend unit tests; Playwright smoke test against the local container (shell loads, health answers, offline reload still shows the shell).

**Manual gate**

- [ ] One command starts the app locally and it opens in the browser.
- [ ] The production address opens on a phone, and the app installs to the home screen.
- [ ] "App installieren" opens the install dialog on Android, shows the Share instructions on an iPhone, and is gone once the app runs installed.
- [ ] After the app has scaled to zero, opening it shows the shell at once, then "Waking up the table…", then the app.
- [ ] The Azure portal shows both budget alerts, 0–1 replicas, and the free SQL offer with "continue with charges".

# Stage 2 — Accounts and campaigns

**Feature set**

- Sign-in with a local account and with Google, 180-day sliding cookie sessions, linking Google from the profile, and admin-created one-time reset links ([auth](/decisions/auth.md)).
- Registration only through a [registration invite](/domain/registration-invite.md): the site admin creates a link valid for 4 hours, usable by several people, revocable. The admin flag comes from the configured address on a Google sign-in.
- [Campaigns](/domain/campaign.md) with a join code that `dm` members can replace, [members](/domain/campaign-member.md) with roles, and promoting a member to `dm` (by any `dm` member).
- [Characters](/domain/character.md): name, size, speed entered in meters and stored in squares.
- [Sessions](/domain/session.md): create, choose the DM, make active (only one per campaign), end.
- Landing page: your campaigns, and the active session of each.
- Shared helpers: squares ↔ meters and locale-aware formatting.

**Order**

1. *Sequential:* entities and migration, authorization policies (campaign member, campaign DM, session DM), endpoint stubs, generated TypeScript types.
2. *Parallel, three lanes:*
   - **Identity backend:** local accounts, Google, linking, reset links.
   - **Campaign backend:** campaigns, members, characters, sessions, with authorization tests.
   - **Frontend:** sign-in, profile, campaign, character and session screens against the stubs.
3. *Sequential:* integrate; Playwright with two browser contexts (register, create, join by code).

**Needs from the project owner:** a Google OAuth client with `localhost`, phone test (`dev.oreanas-office.otressler.de`) and production (`oreanas-office.otressler.de`) redirect URIs on the path `/api/auth/google/callback`; its ID and secret as local user secrets, in `.env` for phone tests, and in Container Apps; and the admin address in the same three places.

**Manual gate**

- [ ] Sign in with Google as admin and create an invite link. Through it, register a local account on the laptop and a Google account on a phone.
- [ ] Without a link, or with an expired or revoked one, registering fails with a German message; signing in to an existing account still works.
- [ ] Create a campaign on the laptop and join it from the phone with the code.
- [ ] Create a character with speed 9 m; it shows 9 m everywhere (and "9 m", not "6 squares").
- [ ] Create a session, make it active, hand the DM role to another member.
- [ ] Restart the container: both devices are still signed in.
- [ ] Link Google to the local account; use an admin reset link.

# Stage 3 — Board on screen

**Feature set**

- [Battle maps](/domain/battle-map.md), [encounters](/domain/encounter.md) and [tokens](/domain/token.md) in the database. Creature types exist with name, size and speed only (the bestiary UI comes in stage 6).
- Until the editor exists: a `dm` member imports a layout JSON file or picks one of the sample maps ([import file](/domain/battle-map.md)). The import creates the map, the encounter in status `ready` and its creature tokens. Cells missing from the file are `void`.
- The session DM starts and ends an encounter in the active session. Starting is a setup screen: tick the characters and place each one ([encounter](/domain/encounter.md)). Players opening the app land on the active encounter.
- `GET` board state: one document with the layout, tokens and their sizes. Stage 4 reuses it for reconnects.
- Konva board: the plain textured rendering of the layout (the permanent fallback for missing images), features and entrances, the grid drawn by the app, tokens as circles with the first letter and a coloured ring, footprints by [creature size](/rules/creature-size.md).
- Pinch to zoom, drag to pan, fit to screen. Tap a cell or token to see terrain and elevation in meters.

**Order**

1. *Sequential:* entities and migration, the layout JSON schema (C# record, generated TypeScript type and a JSON Schema for validation), the board-state DTO, sample map fixtures.
2. *Parallel, three lanes:*
   - **Backend:** import with validation, encounter start and end, character placement, board state, landing route.
   - **Board renderer:** layers, gestures and tap info, built against fixture JSON only. It is the largest lane and doesn't depend on the others.
   - **DM screens:** import a map or pick a sample, the setup screen that picks and places the characters, start and end an encounter.
3. *Sequential:* integrate; Playwright screenshots at phone and laptop sizes; a 40×40 performance check.

**Manual gate**

- [ ] Import the gorge crossing, start the encounter, open it on two phones and the laptop.
- [ ] The grid is crisp, terrain is readable, a Large creature covers 2×2.
- [ ] Pinch-zoom and pan feel smooth on a phone, with no page scrolling or zooming by accident.
- [ ] Tapping a cell shows its elevation in the phone's number format.
- [ ] After a container restart the board looks the same.

# Stage 4 — Live table

Completes roadmap phase 1.

Distance rules are out of the proof of concept: no path, no distance preview and no reach highlight. They come back at a later, not yet scheduled stage ([playable map](/features/playable-map.md)).

**Feature set**

- Phone controls: tap a token, tap a target cell to see the token there as a preview, tap again to confirm ([playable map](/features/playable-map.md)). Only cells the token may stand on are accepted: its whole footprint on walkable cells, overlapping other tokens allowed ([realtime sync](/decisions/realtime-sync.md)).
- SignalR hub, one group per encounter: permission and target check, save the move and its history, then broadcast. Only confirmed moves are saved; while someone is at the confirm step, the others see an arrow to the target in the token's ring colour. Optimistic moves with rollback when rejected. On other devices the token slides to its new cell in about 200 ms.
- Undo your own last move, only while it is still that token's latest move. The session DM moves any token but undoes only their own moves. Other `dm` members of the campaign, the default DM included, move only their own characters ([session](/domain/session.md)).
- Connection lifecycle: disconnect when the app goes to the background, reconnect and reload the board when visible, drop connections idle for 30 minutes, a small connection indicator, moving switched off while disconnected, and the waking screen when a reconnect hits a cold start.

**Order**

1. *Sequential:* hub contract as a C# interface with matching TypeScript types and a test that checks the method names match; the move history table.
2. *Parallel, two lanes:*
   - **Hub backend:** permissions, target check, save before broadcast, undo, idle timeout, integration tests with two SignalR clients.
   - **Board interaction:** the select, preview and confirm state machine, optimistic updates, the slide animation, connection lifecycle and indicator.
3. *Sequential:* integrate; Playwright with a player and a DM context: live sync, a rejected move by the wrong player, undo, reconnect.

**Manual gate (a rehearsal with real devices)**

- [ ] Three or more phones and the DM laptop on production. A move shows up on the other devices within about a second.
- [ ] A player can't move another player's character or a creature; the DM can move anything.
- [ ] A token can't be put on a wall or into the gorge, but can stand on the bridge and on another token.
- [ ] A stack shows its count. A player whose character lies under another token still selects it with a tap, and repeated taps cycle through their own tokens in the stack.
- [ ] Undo works on a phone after a mistaken tap, and is gone once someone else has moved that token.
- [ ] While a player is at the confirm step, the other devices show an arrow from their token to the target in their colour. It goes away when they confirm or cancel, or lock their phone.
- [ ] Lock a phone for a minute and unlock it: it reconnects and shows the current board.
- [ ] Leave everything closed until the app scales to zero; reopen: waking screen, then the correct board.

# Stage 5 — Offline map editor

**Feature set**

- First, remove speed from the code: the character form and list, the setup screen, creature types and the database column. The map import ignores `speedMeters` ([character](/domain/character.md)).
- Dexie (IndexedDB) storage for battle maps, with a version number and a "changed" flag per item, ready for stage 6 sync.
- Editor for laptops: new map N×M up to the grid limit, resized later at any edge; terrain brush with single cell, rectangle and fill; elevation painting; features with footprint, kind, label, elevation and "blocks movement"; entrances and exits on walkable cells at the grid edge; scene, vibe and lighting text ([DM map editor](/features/dm-map-editor.md)). The layout rules on the [battle map](/domain/battle-map.md) are checked in the editor and become the shared checks of stage 6. Below about 1024 px of width only the map list is shown, with a hint that the editor is meant for laptops.
- Undo and redo inside the editor.
- Preview with the stage 3 renderer, and a test placement with the stage 4 target check.
- Works completely offline, with the editor routes in the cached app shell. Export and import of the layout JSON stays as a tool.
- Map list per campaign: open a map to edit it, duplicate it, archive it and bring it back. Nothing is deleted ([battle map](/domain/battle-map.md)).
- Offline storage per user, with GUIDs made in the browser, a request to keep the storage, and a "not synced yet" mark. A copy of the user's campaigns from the last time online, so maps can be built for them offline ([offline prep](/decisions/offline-prep-pwa.md)).
- Maps built here stay in the browser until stage 6 adds sync; stage 6 follows right after this gate. The map list shows only the maps in the browser: maps on the server, such as imports and samples, join it with the stage 6 pull.

**Order**

1. *Sequential:* editor store (Zustand over the layout document, with commands for undo), Dexie schema, tool registry and editor frame.
2. *Parallel, three lanes, each a separate tool module:*
   - **Terrain and elevation tools.**
   - **Features and entrances,** with the property panel.
   - **Map list, scene text and offline storage,** including service worker caching for the editor.
3. *Sequential:* integrate; Playwright with the browser set offline.

**Manual gate**

- [ ] With the laptop in airplane mode, build the gorge crossing from scratch in under ten minutes.
- [ ] Close the browser, reopen it offline: the map is still there.
- [ ] A test token stands on the bridge but not on a wall or in the gorge.
- [ ] Undo and redo behave as expected while painting.
- [ ] Grow the map by two columns on the left: the layout moves along and the new cells are void. Shrink it again: features outside the grid are gone, and undo brings them back.
- [ ] Duplicate the gorge crossing and change the copy: the original stays as it was. Archive the copy: it can no longer be picked. Bring it back: it can be picked again.

# Stage 6 — Bestiary, encounter prep and sync

Completes roadmap phase 2.

**Feature set**

- [Creature types](/domain/creature-type.md): create from the editor while placing, with name, size, appearance and DM notes.
- Place creatures by clicking cells, numbered automatically ("Goblin 1", "Goblin 2"). Save the [encounter](/domain/encounter.md) as draft or ready.
- Sync button: push and pull battle maps, encounters and creature types with version numbers; a conflict dialog that asks which version to keep and never merges ([offline prep](/decisions/offline-prep-pwa.md)). Automatic sync before starting an encounter.
- Starting an encounter from the editor replaces the stage 3 import as the normal path; the import stays as a tool. Starting saves a copy of the map layout on the encounter ([encounter](/domain/encounter.md)).
- "Ready" is set by hand and needs every creature validly placed. Encounters and creature types are archived and brought back, never deleted. Tokens keep the size they were placed with ([token](/domain/token.md)).
- Sync also runs automatically when leaving the editor and when the connection comes back.
- Map store: add a copy of a map from another campaign, with the store's rules on which maps it offers ([battle map](/domain/battle-map.md)). Needs a connection.
- Campaigns created offline: no join code, invites hidden, synced before their maps. Changes the server rejects at sync, such as after losing `dm` rights, are shown, never dropped. A warning before signing out with unsynced changes ([offline prep](/decisions/offline-prep-pwa.md)).

**Order**

1. *Sequential:* the [sync protocol](/decisions/offline-prep-pwa.md) is approved (2026-10-14). Write the endpoint stubs and types for push and the per-campaign pull list, the `Version` and `archivedAt` columns, the encounter's layout copy and the token's `size`, and the shared check test cases: the server reads `src/web/src/editor/validation.cases.json` from stage 5. The server's import checks still differ from them: they don't reject overlapping features, entrance cells that aren't walkable or that two entrances share, or extra decimals, they fill in missing ids, and they stop at the first problem.
2. *Parallel, three lanes:*
   - **Sync backend:** push with per-item answers, the pull list, rights and ID checks, concurrency and retry tests.
   - **Sync client:** the Dexie change queue, push and pull, the conflict and rejection dialogs, the status in the editor header, Web Locks.
   - **Bestiary and placement:** creature type UI, placement, auto-numbering.
3. *Sequential:* integrate; Playwright with two browser profiles editing the same map, a lost push answer, and an encounter started while it was edited offline.

**Manual gate**

- [ ] Prepare a complete encounter offline, go online, sync, start it: the phones show it.
- [ ] Place three goblins: they're labelled Goblin 1 to 3. Remove Goblin 2 and place another: it's Goblin 4.
- [ ] Run an encounter, end it, then move a wall on its map: the ended encounter still shows the old layout. A ready encounter with a goblin on the new wall is flagged and can't start.
- [ ] Make the Goblin type Large: placed goblins stay Small, a new one is Large.
- [ ] Edit the same map in two browsers and sync both: the second gets the conflict dialog, and nothing is merged silently.
- [ ] In a second campaign, add the gorge crossing from the store: it appears as a copy and is gone from that campaign's store. Archive the copy and add the map again: the archived copy comes back.
- [ ] Create a campaign offline and build a map in it: no invite or join code is offered. Go online and sync: the campaign gets a join code and the map is on the server.
- [ ] In the editor the side panel changes with every toolbar pick and shows nothing else. The map's name is in the header, scene texts and size are under "Karte" in the toolbar, the encounters open from the header, and the problem count in the status bar opens the Prüfung list ([DM map editor](/features/dm-map-editor.md), "Editor layout").

# Stage 7 — AI backgrounds

Needs the T0 gate, passed on 2026-10-14. The image budget is set (question 11).

**Feature set**

- Server-side guide renderer, a C# port of the skill's `render_guide.py` with the same colours and legend, and the prompt builder from the skill's prompt templates ([AI map generation](/features/ai-map-generation.md)). Maps wider than 3:1 are padded, and the prompt asks for dead terrain or darkness in the padding ([image generation approach](/decisions/image-generation-approach.md)).
- Foundry client with the local size checks, asking for high quality and JPEG output (the edits endpoint refuses WebP), so phones load a few hundred kilobytes rather than 2–3 MB PNGs.
- Job queue in the database: [asset](/domain/asset.md) rows `queued → running → done | failed`, one worker that runs jobs one at a time within 2 requests per minute and honours 429 waits. The worker is woken when a job is added and on startup, never by polling ([hosting](/decisions/hosting.md)).
- Generate button for `dm` members with a confirm step before the job is queued, and a sync of the map first. Nothing is ever generated automatically ([AI map generation](/features/ai-map-generation.md)).
- Images in a private Blob container, served at `/api/assets/{id}` to members of a campaign that uses them ([persistence](/decisions/persistence.md)), a "done" notification to the editor over SignalR, a version gallery, picking `backgroundAssetId`, and the monthly limit enforced: each image's cost is recorded, and new jobs are refused once the month reaches $20 ([image budget](/decisions/image-budget.md)).
- Board: the image under the app-drawn grid, with the plain rendering as fallback. The service worker caches images by URL.
- Starting an encounter saves the picked background with the layout copy. A resized map's backgrounds are outdated and not shown; the editor asks for a new one. Store copies take the picked background ([battle map](/domain/battle-map.md)).
- Production gets the Foundry endpoint and key through `infra/deploy.ps1` as Container Apps secrets; it uses the same deployment as development ([hosting](/decisions/hosting.md)).

**Order**

1. *Sequential:* asset entity and migration, the job and Blob interfaces, a fake image client.
2. *Parallel, three lanes:*
   - **Guide and prompt:** pure code, with golden-image tests against the Python renderer's output for the sample maps.
   - **Job queue:** worker, Foundry client, Blob upload, restart recovery, tested against the fake client.
   - **Frontend:** generate button, progress, version gallery, pick, background layer.
3. *Sequential:* integrate, then one real generation end to end (after the project owner agrees to the cost).

**Manual gate**

- [ ] Generate the gorge crossing, regenerate once, compare the two versions, pick one.
- [ ] The phones show the picked image, lined up with the grid.
- [ ] Restart the container while a job runs: the job finishes after the restart.
- [ ] A failed job leaves the plain rendering, and the fight is still playable.
- [ ] Offline, the editor says generation needs a connection instead of failing silently.
- [ ] Nothing is generated until the DM confirms the job.
- [ ] Resize the map: the board falls back to the plain rendering and the editor asks for a new image. Undo the resize: the image is back.
- [ ] Start an encounter, then pick another version on the map: the running fight keeps its image.
- [ ] In a second campaign, add the map from the store: the copy shows the same image to that campaign's players.

## Session planning (added at the gate)

The project owner found sessions and fights unconnected on the campaign page and decided on 2026-10-14 to build [session planning](/features/session-planning.md) inside stage 7.

**Feature set**

- `Encounter.sessionId` required, `Session.interruptedEncounterId`. The migration deletes every existing session and fight with their tokens and moves; maps, creature types and characters stay. The app isn't in real use yet (project owner, 2026-10-15). Devices drop their local fights on the next start.
- Rights: only the session DM adds, edits, archives, moves and marks ready the session's fights, also at sync ([offline prep](/decisions/offline-prep-pwa.md), "Server checks"). The pull carries the campaign's sessions read-only.
- Campaign page: sessions as cards with their fights, the running one on top; the "Kämpfe" panel goes.
- Session page: fights with status, start, move, archive; "Kampf hinzufügen" with Vorhandene Karte, Karte kopieren and Neue Karte; the import moves here; editing title and date.
- The editor's "Neue Begegnung" asks for the session.
- "Sitzung fortsetzen": ended → active, with the interrupted fight back as running.
- The roadmap page (`de.roadmap`) moves "Mehrere Kämpfe pro Sitzung" into stage 7.

**Order**

1. *Sequential:* migration, endpoint stubs (session page data, add fight, move, continue), sync format change with a raised minimum, generated types.
2. *Parallel, two lanes:* **backend** (rights, sync checks, continue with the interrupted fight, import into a session) and **frontend** (campaign cards, session page, add-fight dialog, the editor's session pick).
3. *Sequential:* integrate; Playwright: plan two fights, start the session, run one, end the session mid-fight, continue it and find the tokens where they were.

**Manual gate**

- [ ] Create a planned session and add three fights: one on an existing map, one on a copy, one on a new map. The campaign page shows them in the session's card.
- [ ] A second `dm` member sees the planned fights but can't change them, also not by syncing an offline edit.
- [ ] Start the session, start a planned fight, place the players: the phones show it. End it: everyone is back on the session page.
- [ ] During the running session, add a fight on a new map, place two goblins, mark it ready and start it.
- [ ] End the session while a fight runs. Continue the session: the fight comes back with every token where it stood, and the phones land on it.
- [ ] Move an unplayed fight from the ended session to the next planned one.

# Stage 8 — Token icons and portraits

Completes roadmap phase 3. Reuses the stage 7 queue, so it is smaller.

**Feature set**

- Generate creature type icons from name and appearance, with a transparent background and the fixed style template, through the text-to-image call; only on request and after the DM confirms the job ([token icons](/features/token-icons.md), [image budget](/decisions/image-budget.md)).
- Character portraits: an `appearance` field; generated by the owner or a DM; uploaded from the phone after a crop step in the app (type and size checks, saved as a square WebP on the server); an upload restyled into the token style with the upload as reference.
- Versions for creature types and characters, with a gallery and a picked version, like map backgrounds.
- Tokens show the picked image cropped to a circle with the creature or character ring colour, falling back to the first letter. Running fights show the current image; no live update, a reload shows changes.
- Stage 7's pieces widened for other kinds: the image client gets a text-to-image call, the worker builds the request by kind, `/api/assets/{id}` also lets members of a campaign whose creature type or character uses the image, and the month's spending counts every kind.

**Order**

1. *Sequential:* `Character.appearance`, `CreatureType.iconAssetId`, `Character.tokenAssetId` and `Asset.sourceAssetId` with a migration; the icon and portrait job kinds; endpoint stubs for versions, generate, upload and pick.
2. *Parallel, two lanes:* **backend** (icon and portrait jobs, restyling, upload validation and resizing) and **frontend** (bestiary icon gallery, character portrait gallery with the crop step, token rendering with images).
3. *Sequential:* integrate; a small real batch of icons.

**Manual gate**

- [ ] Icons for three creature types look like one set.
- [ ] A portrait uploaded from a phone's photo library, cropped in the app, shows on the token after a reload, and the saved file has no location data.
- [ ] Restyle that upload: the new version looks like the photo in the icons' style, and the upload is still in the gallery.
- [ ] A player generates a portrait for their own character after confirming the job, and can't change another player's character.
- [ ] Regenerate a creature icon, then pick the older version: tokens show the picked one after a reload, also in a running fight.
- [ ] Rings have the right colours on every device; a creature without an icon still shows its letter.

# T1 — Condition icon library (before stage 9)

Needs only the `image-assets` skill and no app code, like T0.

- Check the German names of the 15 conditions, then generate one icon per condition with the skill's "Status icon" template: the token style block word for word, one bold symbol, transparent background ([statuses](/features/statuses.md)).
- One generation at a time because of the rate limit. Look at the first two before the rest, so a style problem is fixed early.
- A review sheet shows every icon at 20, 32 and 64 pixels on the board's dark background.
- Expected cost: about $0.05 per icon at high quality, so under $2 with a few retries ([image budget](/decisions/image-budget.md)).
- The picked icons go into the repository as static files of the app (`src/web/public/statuses/<key>.webp`), so the service worker caches them and they work offline.

**Gate:** the project owner accepts the set on the review sheet. Stage 9's card and status lists lane needs it; the other lanes don't.

# Stage 9 — Pings, token card, statuses and removing tokens

**Feature set**

- Pings and arrows: double tap pings a cell or a token, double tap and drag draws an arrow, in the person's colour, broadcast and not saved; off-screen markers ([pings and arrows](/features/pings-and-arrows.md)).
- The token card: docked at the bottom on phones and top right on wide screens, never beside the token; portrait, name and statuses; a stack lists all its tokens, and a row selects its token if the person may move it ([token card](/features/token-card.md)).
- Statuses: the 15 conditions from T1 and custom statuses with generated icons in the same style; the session DM sets them on any token, players on creatures; status lists on each character and for each `dm` member ([statuses](/features/statuses.md)).
- Removing tokens: the session DM takes a token off the board from its card, with undo and a list to bring removed tokens back ([removing tokens](/features/removing-tokens.md)).

**Order**

1. *Sequential:* status definitions, status list entries and token statuses with a migration; seeding the 15 library statuses; status list and custom status endpoints as stubs; the status icon job kind; `removedAt` on the token; the hub messages for pings, arrows, statuses and removing tokens; the double-tap contract of the gesture tracker (a `doubleTap` and an `arrow` gesture, and taking back the first tap).
2. *Parallel, three lanes:*
   - **Backend:** status permissions and the hub methods, saved before broadcast; ping and arrow relay with the rate limit; removing and restoring tokens; status lists; custom status icon jobs through the stage 8 queue with `TokenPrompt` and the same style block.
   - **Board:** the gesture tracker's double tap, taking back the first tap, the 300 ms delay before a preview is sent; the ping and arrow layer with off-screen markers; status badges on tokens.
   - **Card and status lists:** the token card with stack rows and the changed tap rules; the status picker; the status list section on the character page and the DM status list; creating a custom status and its icon gallery; "Vom Feld nehmen", its undo bar and the "Vom Feld genommen" list.
3. *Sequential:* integrate; Playwright with a player and a DM: a ping and an arrow reach the other context, a status set by the player shows for the DM after a reload, a quick double tap on a preview doesn't move the token.

**Manual gate**

- [ ] A double tap on a phone pings that cell on every device in the player's colour; on a token, the ring goes around the token. Double tap and drag draws an arrow that fades after a few seconds.
- [ ] A ping outside the current view shows a marker at the screen's edge; tapping it pans there.
- [ ] A quick double tap while a token is selected never moves it.
- [ ] Tapping a goblin opens its card at the bottom of the phone without covering the goblin; tapping a stack lists its tokens, and tapping my character's row selects it for moving.
- [ ] A player puts "Liegend" on a goblin; the DM puts "Erschöpfung 2" on a character; both show as badges on every device and survive a reload. The player can't remove the DM's status.
- [ ] A player creates "Verhext" on their character, generates its icon after confirming, and it looks like the condition icons.
- [ ] The DM's picker lists their own status list and every character's status list in the fight.
- [ ] A player puts "Vergiftet" on their own character but can't put a status on another player's character.
- [ ] The DM takes a defeated ghost off the board; it fades out on every phone. "Rückgängig" brings it back, and so does "Zurückholen" later from the list. A player can't remove a token.

# Stage 10 — Fog of war and spectator view

**Feature set**

- Fog of war and hidden creatures as in the concept: prepared offline in the editor, revealed and hidden at the table after a confirm step, filtered on the server for every player ([fog of war](/features/fog-of-war.md)).
- Spectator view: a tablet joins one session by QR code, link or join code, or a member opens it from the session page; the screen follows that session's fights by itself and always shows what players see, whoever is signed in ([spectator view](/features/spectator-view.md)).

**Order**

1. *Sequential:* `fog` and `fogVersion` on the encounter, the token's `hidden` flag in the contract, session spectators, with a migration; two hub groups per encounter (the session DM, everyone else, spectator connections always among the others) and a session group for spectator screens; the per-viewer filter as one server function that every board load and broadcast goes through, pings and statuses included; the sync format for fog in encounter prep.
2. *Parallel, three lanes:*
   - **Fog backend:** the filter for board state, moves, previews, pings and statuses; fog changes and reveals with undo; the target check for hidden cells; reloads on a DM hand-over.
   - **Fog frontend:** the editor's "Nebel" tool, areas and the "Verborgen" switch; the DM's fog mode on the board with the confirm bar and "Spieleransicht"; fog rendering and fades for players.
   - **Spectator:** session spectators, the join page with "Mitspielen" and "Nur zuschauen" and changing a wrong choice, "Als Zuschauer öffnen" and the QR code on the session page, the spectator screen and its states, `WatchSession`, the exemption from the idle timeout and the wake lock.
3. *Sequential:* integrate; Playwright checks that a player's and a spectator's network traffic never contain a hidden creature or the layout of a hidden cell, also when the spectator screen is signed in as the session DM.

**Manual gate**

- [ ] The gate in the [fog of war](/features/fog-of-war.md) concept.
- [ ] A player signed in on their phone opens "Als Zuschauer öffnen" on a tablet with the same account; the phone still plays, the tablet only watches.
- [ ] The DM starts a fight; the tablet shows it within about a second, with the whole map in view. Ending it brings the waiting screen back.
- [ ] The tablet signed in as the session DM still shows only what players see.
- [ ] Someone outside the campaign scans the QR code, picks "Nur zuschauen", and sees this session only; scanning again and picking "Mitspielen" makes them a member.
- [ ] The tablet stays connected for an hour without being touched while the session runs, and disconnects when the session ends.
- [ ] A player joins a new campaign by scanning the QR code and picking "Mitspielen".

# After stage 10

The [backlog](/backlog.md) items are not scheduled. When they are, they fit naturally into these groups, each as its own stage with its own gate:

- **Shared table:** who's here, local mode.
- **Board extras:** free draw, terrain statuses, monster spawn, hit points.
- **Measuring tools:** ruler and area templates, with their concept in the [playable map](/features/playable-map.md) and question 12. Once stage 9, then moved behind pings, statuses, fog and the spectator view, then to the backlog (2026-10-16).
- **Running the session:** undo for the DM.
- **Player extras:** colour and portrait, show my token, haptic feedback. These are small and could also be folded into stage 4 or 8 if the project owner wants them earlier.
