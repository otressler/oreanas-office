---
type: Decision
title: Legal notice
description: The public site has an Impressum at /impressum whose details are baked in from CI build variables, so the owner's address never enters the public repository.
tags: [decision, legal, public]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-24T14:10:00Z }
---

# Decision (set by the project owner)

The app has an **Impressum** at `/impressum`. Its details (name, postal address, email) come from **GitHub repository variables** that are baked into the frontend when the image is built. They are never written into the repository, which is public on GitHub. The project owner chose this on 2026-10-24 over keeping the text in `de.ts` (the address would stay in the public git history for good) and over serving it from the server's configuration (opening the Impressum would wake a sleeping server, [hosting](/decisions/hosting.md)).

# Why an Impressum

The project is a private, non-commercial hobby for a group of friends, so § 5 DDG (the full provider notice for business services) probably doesn't apply. But § 18 Abs. 1 MStV requires a name and an address that can receive legal papers for any site that isn't only for personal or family use, and the [landing page](/features/landing-page.md) is open to anyone. A notice saying "private project" doesn't change that, since what counts is what the site does. The page cites both laws, so it also holds if § 5 DDG applies. This is the project owner's assessment with Claude's help, not legal advice.

# How it works

- **Page:** `/impressum`, static like the [roadmap](/roadmap.md): it makes no API request. It is linked from the footer of the landing page and of every page in the app shell, including the sign-in page. The spectator screen has no footer, but nobody reaches it without signing in.
- **Content:** provider (name, street, postal code and city), email as a `mailto:` link, a note that this is a private hobby project without commercial intent that is open only by invitation, and a note that it isn't an official Wizards of the Coast product (Dungeons & Dragons and D&D are their trademarks). The text is in `de.imprint` in `src/web/src/text/de.ts`.
- **Values:** `IMPRINT_NAME`, `IMPRINT_STREET`, `IMPRINT_CITY`, `IMPRINT_EMAIL`. `src/web/vite.config.ts` reads them from the environment or the repository root's `.env` and defines them as `import.meta.env.VITE_IMPRINT_*`. Unit tests leave them out and stub them where needed.
  - Production: repository variables (Settings → Secrets and variables → Actions → Variables), passed as Docker build args by the deploy job. They aren't secret, since the page shows them publicly.
  - Phone tests and `docker compose --profile app`: from `.env`, passed as build args.
  - `scripts/dev.ps1`: Vite reads the root `.env` itself.
- **Guard:** the deploy job in `.github/workflows/ci.yml` stops before building if any of the four variables is empty, so the public site never goes out without its Impressum. A local build without them shows "In dieser Version der App fehlen die Angaben zum Anbieter."

# Consequences

- Changing the address means changing the repository variable and deploying again (a push to `main` or a rerun of the deploy job).
- If the owner prefers not to publish their home address, a "c/o" address service can be used in `IMPRINT_STREET` and `IMPRINT_CITY`. Whether that satisfies the law isn't fully settled.
- Still open: a privacy policy (Datenschutzerklärung, GDPR Art. 13) covering the server logs, accounts, Google sign-in, Azure as processor and image prompts sent to Microsoft Foundry.
- The app needs no cookie banner while it stores only what it needs to work (§ 25 TDDDG): the sign-in cookie and the offline and per-device data in local storage and IndexedDB. Analytics, embedded third-party content, fonts from Google's CDN or Google's One Tap script would change that, so check this decision before adding any of them.
