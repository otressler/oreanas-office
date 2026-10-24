---
type: Feature
title: Landing page
description: A public page at /willkommen, in the style of a fantasy game's website, that shows what the app does; home sends devices nobody has signed in on there instead of waking the server.
tags: [feature, public, onboarding]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T11:40:00Z }
---

# Goal

The project owner asked on 2026-10-24 for a landing page in the spirit of the Baldur's Gate 3 website, in the app's own colours, with generated hero images. It shows invited players and curious friends what the app does before they sign in.

# Where it lives

- **`/willkommen`**, open to everyone. Like the [roadmap page](/roadmap.md), it is static: it makes no API request and never wakes the server ([hosting](/decisions/hosting.md)).
- **Home (`/`) on a device nobody has signed in on** redirects there, so a first visit no longer wakes the server just to show the sign-in page. "Nobody has signed in" means the device has no remembered user (`oreana.lastUser`, the same value the offline pages trust, [offline prep](/decisions/offline-prep-pwa.md)). Signing out clears it, so home shows the landing page again after a sign-out. A device with a remembered user goes to home as before. Every other path is unchanged.
- Registration stays invite-only ([auth](/decisions/auth.md)): the page offers "Anmelden" and says that registering needs an invite link from the DM. It has no sign-up button.

# Content

All text is German ([UI language](/decisions/ui-language.md)), and it only claims features that are built.

1. **Hero**: a generated picture of a candlelit study with a battle map, title, "Skizzieren. Malen lassen. Losspielen.", "Anmelden" and "So geht's", and a "Läuft auf" strip.
2. **Drei Schritte**: framed tabs for sketch, paint and play, each with a generated emblem and what belongs to it.
3. **Die Karte**: a before/after slider between the crypt sample as the app draws it and the background painted from it with the real guide pipeline ([AI map generation](/features/ai-map-generation.md)). The note under it repeats that the image is only decoration.
4. **Bestiarium**: three generated creatures (goblin boss, owlbear, lich) with size in squares, speed in squares and meters ([movement distance](/rules/movement-distance.md), [creature size](/rules/creature-size.md)), and their token in the red creature ring.
5. **Am Tisch**: a row of medallions for the table features.
6. **"Die Runde wartet!"**: a closing call to sign in, over a generated campfire scene.

The footer links to the roadmap, the sign-in page and the Impressum ([legal notice](/decisions/legal-notice.md)).

# Look

The app's palette (table, panel, parchment, candle gold) with ornaments drawn in SVG and CSS: double gold frames with fanned corners, rules with a diamond, and buttons with pointed ends. Headings use Cinzel, self-hosted from `@fontsource-variable/cinzel` (Google's font CDN would send visitors' addresses to Google). The page is laid out for phones first, and drifting embers and smoke stop with reduced motion.

# Pictures

Generated with the `image-assets` skill (Sunburst, high quality for the scenes and creatures, medium for the backdrop and emblems; about $0.35 for all ten) and kept as WebP at several widths in `src/web/public/landing/`. The board side of the slider is a screenshot of the board lab's crypt fixture. The service worker doesn't precache these pictures, so offline the page shows without them.

The creature cut-outs came with a faint haze (alpha below about 50) across their "transparent" background, which showed as a dark rectangle over the backdrop. The conversion clears alpha below 48 and stretches the rest.

# Update Log

## 2026-10-24
- **Landing page**: Built on `feature/landing-page` at the project owner's request, with the pictures and the redirect from home described above.
