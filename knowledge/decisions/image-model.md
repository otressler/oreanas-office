---
type: Decision
title: Image model
description: Backgrounds and other pictures come from gpt-image-2.5-sunburst on Microsoft Foundry, which replaced gpt-image-2.5-flare after a side-by-side test.
tags: [decision, ai, images]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-15T07:30:00Z }
---

# Decision

Decided by the project owner on 2026-10-15: the app and the `image-assets` skill use the Foundry deployment **`gpt-image-2.5-sunburst`**. It replaces `gpt-image-2.5-flare`, which the project owner had picked for the Phase 0 spike and which stage 7 was built with.

The deployment is configuration, not code: `AZURE_IMAGE_DEPLOYMENT` in `.env` for local development and the phone test, and in `.env.prod` for production, where `infra/deploy.ps1` passes it to the app as `Images:Deployment` ([hosting](/decisions/hosting.md)). Both models take the same requests, so nothing else changes.

# Why

Both models painted the four sample maps from the same guides with the same prompt, the one the app sends ([image generation approach](/decisions/image-generation-approach.md)), at high quality as JPEG:

| Map | Flare | Sunburst |
|-----|-------|----------|
| Crypt | A purple haze outside the map and a magenta glow on the stairs, despite the prompt's rule against the guide's colours | No trace of the guide's colours; plain dark rock outside the map |
| Open field | Saturated colours; an invented ring-shaped path | More natural and muted, fewer invented details |
| River ford | Small stone posts where the guide marks the exits | The road simply runs on |
| Gorge crossing | Clean | Clean, with more depth in the gorge |

All eight lined up with the grid. Sunburst is better at the problem the project owner had raised: artifacts in the guide's signal colours.

- **Cost:** the same. Both used exactly the same tokens per map, so an image costs the same, 2.7 to 7.4 cents at high quality depending on the map's size ([image budget](/decisions/image-budget.md)).
- **Time:** Sunburst took 46 to 61 seconds per image, Flare 26 to 39. Still within what [AI map generation](/features/ai-map-generation.md) expects, and the editor stays usable meanwhile.

# Open

- The rate limit was measured on the Flare deployment (2 requests per minute). The worker keeps the same spacing and waits out 429s, so a different limit on the Sunburst deployment only changes how fast a queue drains.
