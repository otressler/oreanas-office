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
4. Claude merges the stage into `main`, deploys, and updates the knowledge base: decisions confirmed by the stage, answered open questions, and a dated entry in the [log](/log.md).

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
| 7 | 3 | AI backgrounds | The editor generates backgrounds, the DM picks one, and the board shows it |
| 8 | 3 | Token icons and portraits | Creatures get generated icons, characters get portraits |
| 9 | 4 | Measuring tools | Ruler and area templates |
| 10 | 4 | DM control at the table | Pings, hidden tokens, and HP and conditions |

Phase 1 of the roadmap is done after stage 4, phase 2 after stage 6, phase 3 after stage 8 and phase 4 after stage 10.

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
| 9 | [Offline prep and PWA](/decisions/offline-prep-pwa.md) is only proposed | Stage 5 | Accept as written |
| 10 | Largest grid size | Stage 5 | 40×40, which the [frontend stack](/decisions/frontend-stack.md) sizes for |
| 11 | [Image budget](/decisions/image-budget.md) | Stage 7 | Set after T0 records the cost per image |
| 12 | Are ruler and area templates shared with everyone, or only on the measuring device? | Stage 9 | Shared, like pings, and not saved |
| 13 | What "HP and conditions" means, and how it relates to status rings in the [backlog](/backlog.md) | Stage 10 | Designed with the project owner at the start of stage 10 |
| 14 | How do images reach the browser: public blob container, short-lived signed links, or through the app? ([persistence](/decisions/persistence.md)) | Stage 7 | Short-lived signed links, so one campaign's images stay private |

# T0 — Image spike (parallel track)

Runs alongside stages 1–6. It needs only the `image-assets` skill and no app code.

- Use the sample maps from stage 3 as layouts. They cover the hard cases: an edge-heavy dungeon, a large open field near 40 cells, a wide map near 3:1, and the gorge crossing.
- Generate each at low quality, then medium; check the fit with `check_alignment.py`; regenerate with prompt fixes where needed.
- Record cost and time per image and quality level in the [image budget](/decisions/image-budget.md).

**Order:** strictly one generation at a time because of the rate limit. Claude runs it as one background job between stage work, never as parallel agents.

**Gate:** the project owner looks at the review sheets and decides whether the [image generation approach](/decisions/image-generation-approach.md) is accepted, and sets the image budget. Stage 7 needs both.

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
- SignalR hub, one group per encounter: permission and target check, save the move and its history, then broadcast. Only confirmed moves are sent. Optimistic moves with rollback when rejected. On other devices the token slides to its new cell in about 200 ms.
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
- [ ] Undo works on a phone after a mistaken tap, and is gone once someone else has moved that token.
- [ ] Lock a phone for a minute and unlock it: it reconnects and shows the current board.
- [ ] Leave everything closed until the app scales to zero; reopen: waking screen, then the correct board.

# Stage 5 — Offline map editor

**Feature set**

- Dexie (IndexedDB) storage for battle maps, with a version number and a "changed" flag per item, ready for stage 6 sync.
- Editor for laptops: new map N×M up to the grid limit; terrain brush with single cell, rectangle and fill; elevation painting; features with footprint, kind, label, elevation and "blocks movement"; entrances and exits on edge cells; scene, vibe and lighting text ([DM map editor](/features/dm-map-editor.md)).
- Undo and redo inside the editor.
- Preview with the stage 3 renderer, and a test placement with the stage 4 target check.
- Works completely offline, with the editor routes in the cached app shell. Export and import of the layout JSON stays as a tool.

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

# Stage 6 — Bestiary, encounter prep and sync

Completes roadmap phase 2.

**Feature set**

- [Creature types](/domain/creature-type.md): create from the editor while placing, with size, speed in meters, appearance and DM notes.
- Place creatures by clicking cells, numbered automatically ("Goblin 1", "Goblin 2"). Save the [encounter](/domain/encounter.md) as draft or ready.
- Sync button: push and pull battle maps, encounters and creature types with version numbers; a conflict dialog that asks which version to keep and never merges ([offline prep](/decisions/offline-prep-pwa.md)). Automatic sync before starting an encounter.
- Starting an encounter from the editor replaces the stage 3 import as the normal path.

**Order**

1. *Sequential:* write the sync protocol (per-item versions, "changed since", a conflict reply carrying the server copy) into the offline prep concept for the project owner to approve; then endpoint stubs and types.
2. *Parallel, three lanes:*
   - **Sync backend:** endpoints and concurrency tests.
   - **Sync client:** the Dexie change queue, push and pull, the conflict dialog.
   - **Bestiary and placement:** creature type UI, placement, auto-numbering.
3. *Sequential:* integrate; Playwright with two browser profiles editing the same map.

**Manual gate**

- [ ] Prepare a complete encounter offline, go online, sync, start it: the phones show it.
- [ ] Place three goblins: they're labelled Goblin 1 to 3.
- [ ] Edit the same map in two browsers and sync both: the second gets the conflict dialog, and nothing is merged silently.

# Stage 7 — AI backgrounds

Needs the T0 gate and the image budget (question 11).

**Feature set**

- Server-side guide renderer, a C# port of the skill's `render_guide.py` with the same colours and legend, and the prompt builder from the skill's prompt templates ([AI map generation](/features/ai-map-generation.md)).
- Foundry client with the local size checks.
- Job queue in the database: [asset](/domain/asset.md) rows `queued → running → done | failed`, one worker that runs jobs one at a time within 2 requests per minute and honours 429 waits. The worker is woken when a job is added and on startup, never by polling ([hosting](/decisions/hosting.md)).
- Images in Blob Storage, a "done" notification to the editor over SignalR, a version gallery, picking `backgroundAssetId`, and the budget limit enforced.
- Board: the image under the app-drawn grid, with the plain rendering as fallback. The service worker caches images by URL.

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

# Stage 8 — Token icons and portraits

Completes roadmap phase 3. Reuses the stage 7 queue, so it is smaller.

**Feature set**

- Generate one icon per creature type from its name and appearance, with a transparent background and the fixed style template ([token icons](/features/token-icons.md)); automatic or on request as the image budget says.
- Character portraits: generated, or uploaded from the phone (type and size checks, resized on the server).
- Tokens show the icon cropped to a circle with the creature or character ring colour, falling back to the first letter.

**Order**

1. *Sequential:* the icon job kind and the upload endpoint stub.
2. *Parallel, two lanes:* **backend** (icon jobs, upload validation and resizing) and **frontend** (bestiary icon UI, portrait UI, token rendering with images).
3. *Sequential:* integrate; a small real batch of icons.

**Manual gate**

- [ ] Icons for three creature types look like one set.
- [ ] A portrait uploaded from a phone's photo library shows on the token.
- [ ] Rings have the right colours on every device; a creature without an icon still shows its letter.

# Stage 9 — Measuring tools

**Feature set:** a ruler between any two points; area templates (cone, sphere, line, cube) sized in meters ([playable map](/features/playable-map.md)). Sharing follows question 12. The reach highlight and distance preview are deferred with the distance rules (see stage 4).

**Order:** a short sequential step for the shared "overlay" message type on the hub, then two parallel lanes (ruler, templates), each its own board layer.

**Manual gate**

- [ ] Measure a ranged attack on a phone; the reading matches counting squares by hand.
- [ ] Place a 4.5 m cone and a 6 m sphere; they cover the expected cells, and everyone sees them.

# Stage 10 — DM control at the table

Completes roadmap phase 4.

**Feature set:** ping (tap and hold flashes a spot on every screen; broadcast, not saved); hidden tokens that only the DM sees until revealed; HP and conditions as designed in question 13.

**Order**

1. *Sequential:* design HP and conditions with the project owner and write the concept; add `hidden` to the token and the filtering contract.
2. *Parallel, three lanes:* **ping** (hub and board); **hidden tokens** (the server filters hidden tokens out of board state and broadcasts for players, plus the DM's reveal UI); **HP and conditions.**
3. *Sequential:* integrate; Playwright checks that a player's network traffic never contains a hidden token.

**Manual gate**

- [ ] A ping from a phone shows on every device in that player's colour.
- [ ] A hidden goblin is invisible on phones, even after reloads, and appears for everyone when revealed.
- [ ] HP and conditions work as agreed in the design step.

# After stage 10

The [backlog](/backlog.md) items are not scheduled. When they are, they fit naturally into these groups, each as its own stage with its own gate:

- **Shared table:** table view, join by QR code, who's here, local mode.
- **Board extras:** free draw, status rings and terrain statuses, map reveal, monster reveal and spawn, removing tokens.
- **Running the session:** several fights per session, undo for the DM.
- **Player extras:** colour and portrait, show my token, haptic feedback. These are small and could also be folded into stage 4 or 8 if the project owner wants them earlier.
