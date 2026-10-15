---
name: image-assets
description: Generate image assets for Oreana's Office with the gpt-image-2.5-sunburst model on Microsoft Foundry. Covers battle map backgrounds painted from a grid layout (guide image to image), creature token icons with transparent backgrounds, character portraits, and textures or fallback tiles. Use this whenever the user wants to generate, regenerate, repaint or test any picture for the app, run the Phase 0 image-generation spike, try a prompt or style against the model, make icons for a bestiary, or asks how to call the Foundry image deployment, even if they only say "make a map for this fight", "draw the goblins" or "try that layout with the AI".
---

# Image assets

The app's pictures come from one deployment: `gpt-image-2.5-sunburst` on Microsoft Foundry (OpenAI-compatible v1 API), set as `AZURE_IMAGE_DEPLOYMENT` in `.env` (`knowledge/decisions/image-model.md`; it replaced `gpt-image-2.5-flare` on 2026-10-15). This skill holds the scripts and prompt patterns that make its output fit the game: maps that line up with the grid, icons that work as tokens.

Read the knowledge concepts first when the task touches design, because they are the spec: `knowledge/features/ai-map-generation.md`, `knowledge/features/token-icons.md`, `knowledge/decisions/image-generation-approach.md`, `knowledge/domain/asset.md`.

## Setup and limits

Credentials live in `.env` at the project root (`AZURE_OPENAI_ENDPOINT`, `AZURE_API_KEY`, `AZURE_IMAGE_DEPLOYMENT`). The scripts read it themselves. Never print the key, paste it into files, prompts or knowledge concepts, or commit `.env`.

The deployment allows **2 requests per minute**, and rejected requests count too. One image takes about 45–60 s at high quality, larger ones longer. So:

- `scripts/generate_image.py` throttles across all invocations on this machine and retries 429s after the wait the server asks for. Run requests one after another, not in parallel. Parallel calls just queue on the throttle.
- Before a batch, tell the user roughly how long it takes (each image ≈ 60 s, so 6 icons ≈ 6 min). For more than a few images, run the batch in the background.
- Draft with `--quality low` while the prompt is still changing, then do the final at `medium` or `high`.

Size rules, checked locally by the script because a bad size still costs a slot: both edges divisible by 16, longest edge ≤ 3840, aspect ratio ≤ 3:1, between 655,360 and 8,294,400 pixels. Any size inside those limits works, so a map can be generated at exactly its grid's pixel size. See `references/foundry-api.md` for the raw API.

## The generator

```bash
python .claude/skills/image-assets/scripts/generate_image.py \
  --prompt "..." --size 1024x1024 --quality medium --out assets/generated/tokens/goblin.png
```

Options: `--prompt-file`, `--image` (repeatable; switches to the edits endpoint), `--mask` (PNG, transparent pixels get repainted), `--background transparent|opaque|auto`, `--n` (several variations in one request), `--format png|webp|jpeg`, `--compression`.

It writes the image plus a sidecar `<file>.json` holding the prompt, model, size, quality, token usage and request id. Keep the sidecar next to the image: it carries the fields the Asset entity (`knowledge/domain/asset.md`) stores, so a result can be repeated or tweaked later.

Put outputs under `assets/generated/maps/<map-slug>/` and `assets/generated/tokens/` unless the user names another place. Use versioned names (`v1.png`, `v2.png`) for regenerations instead of overwriting, since the DM picks between versions.

## Battle map backgrounds

The grid is the source of truth and the picture is decoration. The model paints from a colour-coded guide image, never from coordinates in text, and never draws the grid itself.

1. **Get the layout.** A battle map JSON document (schema in `knowledge/domain/battle-map.md`) or an ASCII sketch. If the user only describes the fight in words, sketch the ASCII grid yourself and show it to them before spending a request: a 15×10 grid is quick to read and fix.
2. **Render the guide.**
   ```bash
   python .claude/skills/image-assets/scripts/render_guide.py map.json --out <dir>/guide.png
   ```
   ASCII uses `.` floor, `,` difficult, `~` water, `#` wall, space or `_` void; add features with `--feature "bridge:5,3,3,1:rope bridge"` (x, y, w, h in cells, zero-based). It prints the exact `size` to request, `cell_px`, and a `legend` describing each colour.
3. **Write the prompt** with the map template in `references/prompts.md`: scene, vibe and lighting, then the legend lines, then the fixed rules (top-down orthographic, keep every region in place, no grid, no text). Mention elevation in words when it matters ("the bridge spans a deep gorge, the ledge is 3 m above the floor"), because the guide has no height channel.
4. **Generate** with the guide as `--image` at the printed `--size`.
5. **Check the fit.**
   ```bash
   uv run .claude/skills/image-assets/scripts/check_alignment.py <dir>/guide.png <dir>/v1.png --cell <cell_px> --out <dir>/v1-review.png
   ```
   Read the review sheet and look for walls, water and features that moved out of their cells, regions the model invented, and painted grid lines or text. Report what drifted. If something important is off, adjust the prompt (name the problem region, strengthen "keep exactly where it is") and regenerate as v2 rather than accepting it.

Observed so far: the model follows the guide's regions closely, including stepped river shapes and wall rectangles. It tends to dress up edges (it turned a solid black border row into grass), so name edge regions explicitly when they matter.

Grids wider than 3:1 are padded to 3:1 with void, and the prompt asks for dead terrain or darkness there. Above about 40 cells on the long edge, cells drop below ~96 px; still fine on phones, but say so.

## Token icons and portraits

One icon per creature type, all in one consistent style so a bestiary reads as a set. Use the token template in `references/prompts.md` with `--background transparent --size 1024x1024`. Start from the creature type's `name` and `appearance`. The app crops icons to a circle and adds a coloured ring, so keep the subject centred, filling the middle of the frame, with nothing important in the corners, and no frame or ring painted in.

For a batch, write one prompt per creature with the same style block word for word, and generate them one after another. Look at each result before moving on, so a style problem is fixed after the first icon and not the sixth.

Character portraits follow the same template with portrait framing. If the user uploads a reference picture, pass it with `--image` and ask for a token in the shared style.

## Other images

Textures, fallback floor tiles, handouts: use plain text to image, opaque background. A seamless texture prompt should say "seamless tileable texture, top-down, even lighting, no objects".

## When things fail

- **HTTP 400** shows the server's message: usually size (should be caught locally), a moderation block, or a malformed upload. A moderation block on dark-fantasy prompts usually clears by toning down gore words; tell the user what you changed.
- **Repeated 429s**: someone else is using the deployment, or a background batch is running. Wait; don't loop.
- **Bad alignment after two tries**: say so plainly and fall back to the plain textured rendering the spec requires. A fight never depends on the AI.

## Feeding results back

Image generation is still Phase 0 in `knowledge/roadmap.md`. When a run teaches something about the model (alignment quality, prompt tricks, time, token usage per quality level), record it in `knowledge/decisions/image-generation-approach.md` or `image-budget.md` and add a dated entry to `knowledge/log.md`, following the rules in `CLAUDE.md`.
