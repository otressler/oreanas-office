# Stage 8 frontend lane: handoff notes (paused, WIP)

Branch: `lane/stage8-frontend` (from `stage/8-token-icons`). `npm ci` done in `src/web`.

## Done (not yet typechecked, linted or tested)
- Item 1 (shared module, `src/web/src/tokenImages/`):
  - `queries.ts`: keys (`tokenImagesKey`, `creatureIconsKey`, `pickedImageKeys`), fetch/generate/pick per owner, `uploadPortrait` (raw-body fetch, own error unwrap), `useTokenImages`, `useCreatureIcons` (online only, Map by type id), rules `hasPendingImage`, `canPickImage`, `pickedImage`, `withImage`, `imageKind`.
  - `watch.ts`: `TokenImageWatch` + `useTokenImageWatch` (copy of the background watch, calls `WatchTokenImages`, listens to `TokenImageUpdated`; reuses `WATCH_RETRY_MS`, `invokeImageHub`, `createImageConnection` from `editor/background`).
- Item 2: `TokenImageGallery.tsx` (picked image in ring, versions list with state/failed note/kind, pick, "Ohne Bild", generate behind `ConfirmDialog.tsx`, upload button + file input `accept="image/*"` + `CropDialog`, restyle on uploaded versions, offline notice, budget line, hub watch only while pending, invalidates characters list / icons list after picks and finished jobs). `TokenPicture.tsx` (circle + ring colour, letter fallback incl. on img error).
  - `crop.ts`: crop math (view = centre in picture px + zoom 1..8; clamp keeps the square inside the picture; pan, zoom-at-point, slider zoom, `cropSquare`, `pictureLayout`, `cropToBlob` 1024x1024 JPEG q 0.9). `CropDialog.tsx`: pointer drag/pinch (reuses `board/gestures` GestureTracker), wheel, range slider, circle overlay in ring colour.
- Item 3 (partly): `bestiary/CreatureIconSection.tsx` (offline notice; never-synced type -> note + "Jetzt synchronisieren"; else gallery whose prepare saves the form draft, syncs, sends `itemVersion`). `CreatureTypeForm.tsx` now wraps the form in a div and renders the section for existing types outside the `<form>`; adds `saveDraft()`.
- `sync/client.ts`: `syncCreatureTypeBeforeGenerate(db, typeId)` next to `syncMapBeforeGenerate`.
- `text/de.ts`: `characters.appearance/appearanceHint/portraitAlt/portrait.*`, `bestiary.icon.*`, new `tokenImages.*` section (see diff for exact strings).

## Left (by brief item)
- 3: `BestiaryList` rows show the small icon from `useCreatureIcons` (online only; nothing for types without icon).
- 4: `CharacterForm`: "Aussehen" textarea (max 500, counter like creature form), send `appearance` in the request; split the mutation so saving before generating doesn't close the form; portrait section (gallery with `uploads`, ring = `ringColor({kind:'character', colorIndex})`, `generateHint` = needsAppearance when empty, prepare saves dirty fields first). Update `CharacterForm.test.tsx` expected bodies (now include `appearance`). `CharactersPanel` rows: `TokenPicture` from `portraitUrl`.
- 5: Board: new `board/tokenPictures.ts` (per-URL HTMLImageElement cache + `useTokenPictures(urls)` that bumps state on load; drop failed entries), `TokenDrawOptions.images` map by url, `drawToken` clips image to circle inside ring, letter fallback, number badge (lower right) for marks like G1 when an image is drawn; ghost too. Wire into `Board.tsx`. Editor canvas tokens (`EditorCanvas.tsx`, not owned) stay letters.
- 6: mock backend: icons/portraits endpoints, upload (raw body), pick, icons list, generate finishes after a short delay with a small PNG and auto-picks, `/api/assets` serving token images, `appearance`/`portraitUrl` in characters, `imageUrl` in board tokens; `MockImageHub` handling `WatchTokenImages` + sending `TokenImageUpdated`.
- 7: Vitest (crop math, gallery states/confirm, icon section offline/not-synced, board image vs letter + badge via a recording ctx, Board loads one Image per URL) and Playwright (DM generates icon from editor bestiary; player uploads portrait via crop; board with image token renders).
- Then run `npx tsc -b --noEmit`, `npm run lint`, `npm test`, `npm run test:e2e`.

## Checks
None run yet since the code was written: typecheck, lint, unit and e2e all unknown. Prettier was run on the changed files.

## Judgement calls / gaps so far
- A never-synced creature type gets no gallery, only a note and a "Jetzt synchronisieren" button (the brief: can't generate until synced).
- Generating an icon first saves the form's unsaved edits (without closing it), then syncs, like the map editor saves before syncing.
- Restyle posts `{ restyleAssetId }` without saving the character form first.
- Uploads are allowed while a generation job is pending.
- Crop output: JPEG has no alpha, so transparent PNGs get the board's dark ground (#14161b) behind them.
- The editor canvas's creature tokens keep letters (EditorCanvas is outside this lane).
- Bestiary rows without an icon show nothing extra.

## Exact next step
Run `npx tsc -b --noEmit` in `src/web` and fix errors in the new files. Then do item 4 (CharacterForm/CharactersPanel).
