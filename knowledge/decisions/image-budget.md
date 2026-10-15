---
type: Decision
title: Image budget
description: Image generation may cost up to $20 a month for the whole site, and images are generated at high quality.
tags: [decision, ai, cost]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-14T19:21:37Z }
---

# Question

Is there a spending limit for image generation per map, or per month?

# Decision

Decided by the project owner on 2026-10-14:

- **$20 a month** for all image generation on the site: map backgrounds, [token icons](/features/token-icons.md) and portraits, across every campaign. The project owner pays for all of it, so the limit is site-wide rather than per campaign. One image costs a few cents, and the group won't make many maps, so the limit is a safety net rather than something to plan around.
- **No limit per map.** The monthly limit is the only one, so "regenerate" can be used as often as the month allows.
- **High quality by default.** No cheaper draft step first. The project owner first chose medium, then switched to high on 2026-10-14 after T0: high fixed the crypt sample that medium got wrong three times, and the extra 2–3 cents per image hardly touch the limit.
- **Never automatically.** Every image is generated only after a person starts the job and confirms it. This also means [token icons](/features/token-icons.md) are made on request, never when a creature type is created.
- **Players may spend too.** A player can generate and restyle portraits of their own characters, counted against the same monthly limit (project owner, 2026-10-14: the site is for a group of friends).

# How the app keeps to it

- The server records the cost of each generated image and adds up the current calendar month (UTC).
- Once the month's total reaches $20, new jobs are refused with a German message, and the board keeps the images it has. The plain rendering keeps every fight playable ([AI map generation](/features/ai-map-generation.md)).
- The limit is a setting, not a constant in code.

# Affects

- How many "regenerate" versions the [AI map generation](/features/ai-map-generation.md) allows: as many as the monthly limit covers.
- [Token icons](/features/token-icons.md) are generated only on request.

# Cost per image (T0, 2026-10-14)

The model is billed by tokens. Published rates for `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst` (the same; the app uses Sunburst, [image model](/decisions/image-model.md)): $8 per million image input tokens, $5 per million text input tokens, $30 per million output tokens. The T0 run on the sample maps at medium quality:

| Map | Image | Input tokens (image + text) | Output tokens | Cost |
|-----|-------|------------------------------|---------------|------|
| Gorge crossing | 1280×768 | 960 + 225 | 251 | $0.016 |
| River ford | 1728×576 | 972 + 303 | 144 | $0.014 |
| Crypt | 1536×1024 | 1536 + 345 | 343 | $0.024 |
| Open field | 1280×1216 | 1520 + 411 | 491 | $0.029 |

At `high` the crypt took 1536 + 385 input and 1,372 output tokens: **$0.055**, four times the output tokens of medium and about twice the total cost.

So one background costs 1.5–3 cents at medium and about twice that at high: roughly 3–6 cents, so $20 covers 350 or more a month at the default. The whole T0 run, eight images, cost about $0.20. Each response reports its token use, so the server computes the cost of each image from the response and the rates in its settings, rather than from a fixed price per image. The rates come from OpenAI's model page and a Foundry listing; the Azure invoice should confirm them after the first month.
