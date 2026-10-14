# Foundry image API notes

What was observed against the deployment on 2026-10-10. `scripts/generate_image.py` wraps all of this; read this only to call the API another way (for example from app code).

## Endpoints

Base: `AZURE_OPENAI_ENDPOINT` from `.env` (`https://<resource>.services.ai.azure.com/openai/v1`). Auth header: `Authorization: Bearer <AZURE_API_KEY>`. The OpenAI SDKs work with this base URL and key.

| Call | Path | Body |
|------|------|------|
| Text to image | `POST /images/generations` | JSON |
| Image to image, mask | `POST /images/edits` | multipart form: `image` (or several `image[]`), optional `mask`, other fields as text |

Fields: `model` (deployment name), `prompt`, `size` (`WxH` or `auto`), `n`, `quality` (`low` / `medium` / `high` / `auto`, default medium), `background` (`transparent` / `opaque` / `auto`), `output_format` (`png` / `webp` / `jpeg`; the edits endpoint refuses `webp` with a 400, only `png` and `jpeg` work there, seen 2026-10-14), `output_compression` (0–100, webp/jpeg).

Response: `data[].b64_json`, plus `size`, `quality`, `background`, `output_format` and `usage` (input text and image tokens, output image tokens). Transparent PNGs come back as RGBA with a real alpha channel.

## Sizes

- Both edges divisible by 16.
- Longest edge ≤ 3840. Aspect ratio ≤ 3:1.
- Total pixels: 3840x2160 (8,294,400) accepted, 3840x3840 rejected ("exceeds pixel budget"); 256x256 rejected ("below minimum pixel budget"). The minimum of 655,360 is OpenAI's published value for this model family and wasn't probed exactly.

## Rate limit

Headers: `x-ratelimit-limit-requests: 2`, `x-ratelimit-renewalperiod-requests: 60`, `x-ratelimit-remaining-requests`, `x-ratelimit-reset-requests` (seconds). 400 responses count against the limit. A 429 body says `Please retry after N seconds`.

## Timing and usage seen

| Request | Time | Output tokens |
|---------|------|---------------|
| 1024x1024 generation, medium | 22 s | 781 |
| 1536x1024 edit from a guide, medium | 24 s | 343 (+1,536 input image tokens) |
| 1024x1024 transparent icon, low | ~20 s | 196 |
| 2048x2048 generation, low | ~27 s | 412 |
| 3840x2160 generation, low | under 71 s, throttle wait included | 386 |

Cost per token isn't known yet; that belongs in `knowledge/decisions/image-budget.md` once it is.
