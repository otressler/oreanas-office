---
type: Feature
title: Campaign overview
description: Home lists the signed-in user's campaigns as cards with a cover, description and characters, and offers joining and creating side by side, in the landing page's look and at a desktop's width.
tags: [feature, campaigns, design]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-25T20:45:00Z }
---

# Goal

The project owner found on 2026-10-25 that the app looked flat next to the [landing page](/features/landing-page.md) and didn't use desktop screens. The campaign overview (home, `/`) is the first page brought into the landing page's look; other pages follow later.

# Layout

- **Width.** Home uses up to 72 rem (`max-w-6xl`) instead of the reading column of 48 rem the other pages keep. A route opts in with `handle: { wide: true }` in `routes.tsx`, and the header and footer follow its width.
- **"Deine Kampagnen"**: a kicker, the title in Cinzel with the gold gradient and a gold rule, over the landing page's backdrop picture faded in at the top right. Below it the campaigns as cards: one column on phones, two from `sm`, three from `lg`.
- **"Beitreten oder selbst leiten"**: joining by code and creating a campaign as two panels, side by side from `md`, stacked on phones. Each has its own generated picture on top (a tavern door with a sealed letter, a blank map on a desk), a title, a line of text and the form. The buttons are the landing page's pointed buttons.

# Campaign card

Each card shows, top to bottom:

1. The campaign's **cover** (3:2), fading into the card, with the viewer's role as a label over it. Without a cover of its own, the default cover (a closed adventure tome by candlelight) stands in.
2. The **name** in Cinzel; the whole card links to the campaign.
3. The **description**, at most three lines.
4. The **characters**: every character of the campaign as its portrait in its ring colour with its name, the viewer's own first and in bold, then the rest in the order they were added. A card shows six and then "+N". Without characters: "Noch keine Charaktere".
5. The **running session**, if any: its title, date and DM; and its running fight with "Zum Kampf".

A campaign made offline and not yet synced gets a card with the default cover, its sync mark and the offline note.

# Description and cover

Decided by the project owner on 2026-10-25:

- **The description** is written by `dm` members, up to 300 characters, optional ([campaign](/domain/campaign.md)).
- **The cover** is uploaded through the crop step or generated from the campaign's name and description, like a character's portrait: versions in a gallery, one picked, generating confirmed first and paid from the shared [image budget](/decisions/image-budget.md). Only `dm` members see the gallery. Generating needs a description. Picking none brings back the default cover.
- **Characters on the card**: all of them, the viewer's own first.

`dm` members find both under "Titelbild und Beschreibung", behind the pencil on the campaign page's cover, where they can also rename the campaign ([campaign page](/features/campaign-page.md)). The campaign page shows the cover as a banner with the name over it, and the description below, to every member.

# As built

Built on `feature/campaign-overview`.

- `GET /api/campaigns` returns `description`, `coverUrl` and `characters` per campaign; `GET /api/campaigns/{id}` returns `description` and `coverUrl`. `PUT /api/campaigns/{id}` (`dm` members) changes name and description.
- Covers have their own routes (`/covers`, `/covers/upload`, `/cover`) but share the token images' contracts, job queue, one-job-at-a-time rule and image hub group ([token icons](/features/token-icons.md)). The asset is of kind `campaign-cover`, owned by the campaign ([asset](/domain/asset.md)).
- The model paints a cover at 1536 × 1024, opaque, as JPEG, at high quality, with its own style block in the landing page's key-art look (`Images:CoverStyle`, template "Campaign cover" in the `image-assets` skill). The server keeps every version, uploads included, as a 1200 × 800 WebP. The crop step for covers uses a 3:2 frame and uploads 1536 × 1024.
- The pictures (default cover, joining, a new campaign) were generated with the `image-assets` skill: three high-quality images at 1536 × 1024, about 35 s each. They are kept as WebP at 768 and 1536 px in `src/web/public/home/` and precached by the service worker, so home looks the same offline.
- The landing page's ornaments (frames, rules, kicker, pointed buttons) moved to `src/web/src/components/ornaments.tsx`, with a pointed `ChevronButton` for forms; Cinzel is now loaded for the whole app, and the header's wordmark uses it.
