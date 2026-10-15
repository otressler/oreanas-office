# Stage 8 backend lane: handoff notes

Branch `lane/stage8-backend`, based on `stage/8-token-icons` (contract commit 4d7ef2b).

## Done (by brief item)

1. FoundryImageClient.GenerateAsync: JSON POST to `images/generations`; shared `SendAsync` with EditAsync (429/400/other, parsing). EditAsync sends `background` when set, and now leaves out `output_compression` for `png` output (judgement call: the API documents compression only for JPEG/WebP). No tests yet.
2. `Images/TokenPrompt.cs`: CreatureIcon, CharacterPortrait, Restyle (= "Turn the person in this picture into a portrait token in the following style." + newline + portrait template), ForStorage (truncate to Asset.PromptMaxLength). Whitespace in name/appearance collapses to one space; trailing periods trimmed; name only when appearance empty. Lines joined with "\n". No tests yet.
3. `Images/TokenPicture.cs`: Identify (magic bytes), FromUpload (size check from header before decoding, EXIF orientation, centre crop, scaled to exactly TokenPixels, also upscaling small pictures; WebP lossy q85 with alpha), FromModel (throws if unreadable), ToPng. JPEGs decode at reduced scale when the short edge still covers the target. Only SKCodecResult.Success accepted (truncated files refused).
4. `Images/TokenImageEndpoints.cs`: all routes implemented. Shared `QueueAsync` (execution strategy + transaction + sp_getapplock `token-image:{ownerType}:{ownerId}`). Check order: 404 → ImagesUnavailable → ItemChanged / restyle ImageNotFound / AppearanceMissing → GenerationRunning → ImageBudgetExhausted. Upload: Content-Type must be image/jpeg|png|webp AND the bytes must match the declared type (else UploadInvalid); Content-Length and streamed read both capped (UploadTooLarge); raises Kestrel's body limit if below the setting. `Images/TokenImages.cs`: ToView, BlobName, VersionsOf, ListAsync, JobRunningAsync, FinishedAsync, PickAsync (ExecuteUpdate, no Version bump). `MapBackgrounds.BudgetAsync` moved from ImageEndpoints (public now).
5. Worker: `RunTokenAsync` / `FinishTokenAsync` in ImageJobWorker; map background path untouched. NotifyAsync and FailAsync dispatch on Kind. Finished version is always picked.
6. Hub WatchTokenImages implemented (creature type: dm + type in campaign; character: member, exists, owner or dm; BattleMap → ItemNotFound).
7. Board: `ImageAssetId` joined into the existing token query; ImageUrl = `/api/assets/{id}`.

`dotnet build` passed with 0 warnings after items 1–7; openapi.json unchanged.

## Left

- Item 8 (asset access tests), item 9 (character appearance tests), and every test except the two files below.
- Tests written but NOT YET COMPILED OR RUN: `tests/Server.Tests/Images/TestPictures.cs` (helpers, hand-built EXIF APP1 with orientation + GPS), `tests/Server.Tests/Images/TokenPictureTests.cs`.
- Still to write: FoundryImageClient GenerateAsync tests (extend the Handler to capture a JSON body), TokenPromptTests, a TokenImageTestApi helper (URLs, hub watcher for TokenImageUpdated), icon endpoint tests, portrait endpoint and upload tests, token worker tests (generated, restyle, failed, retry, requeue, auto-pick, prompt from current owner), hub permission tests, board ImageUrl test, asset access tests, character appearance tests. Fake: set `FakeImageClient.TokenPng = TestPictures.TransparentPng(...)` in token tests (null gives an empty image, which fails the job).
- Check: `CharacterEndpoints` builds `PortraitUrl` as `"/api/assets/" + c.TokenAssetId` inside the EF query; SQL Server may render the GUID in upper case. Add a test that expects the lower-case `/api/assets/{id}`; if it fails, build the URL in memory.
- Run the full `dotnet test` and `dotnet build` (0 warnings), check that openapi.json didn't change, then commit and report.

## Judgement calls so far

- Uploads are scaled to exactly TokenPixels, so small pictures are scaled up as well.
- An upload whose bytes don't match its Content-Type is UploadInvalid.
- `GET creature-types/icons` includes archived types, sorted by name.
- Listing and picking icons work for archived types; only generating returns 404 for them.
- Listing portraits needs the owner or a dm (403 otherwise), like the other portrait routes.
- `output_compression` is left out of PNG edit requests.
- If the model's picture can't be decoded, that counts as a failed attempt (retried up to MaxAttempts).

## Next step

Run `dotnet build` and fix compile errors in the two new test files, run `dotnet test --filter-class "*.TokenPictureTests"`, then write the remaining tests listed above.
