---
type: Decision
title: Legal notice
description: The public site has an Impressum at /impressum and a privacy policy at /datenschutz; the owner's details are baked in from CI build variables, so their address never enters the public repository.
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

# Privacy policy

Added on 2026-10-24 at the project owner's request: `/datenschutz` ("Datenschutz" in the footers), static like the Impressum. It names the same person as controller from the same build variables and links to the Impressum. The text is `de.privacy` in `src/web/src/text/de.ts`, with sections as data. It states:

- **Hosting:** Microsoft Azure as processor (Art. 28 GDPR): the app in West Europe, the database, files and logs in Germany West Central. The app writes no access logs, only warnings and errors, kept 30 days (`retentionInDays` in `infra/modules/logging.bicep`). Checked against Azure on 2026-10-24: the regions of all resources in `rg-ot-oreanasoffice-prod-001`, the workspace's 30-day retention, the environment's logs going to that workspace, and that the logs of the past 30 days held no public IP address (only two internal Kubernetes addresses).
- **Accounts:** email address, display name, password hash, registration time and whether Google is linked. Art. 6 (1)(b) GDPR, kept until the account is deleted.
- **Google sign-in:** what Google sends (email, whether it's verified, name, account ID). No profile picture. Google is certified under the EU-US Data Privacy Framework, and signing in with Google is optional.
- **Content:** visible only to campaign members. Uploads are saved again without metadata. The app never deletes image files from Blob Storage, so the policy says images are kept as versions and deleted on request.
- **AI images:** descriptions, the map sketch and, for restyling, the uploaded portrait go to Microsoft Foundry (resource `ot-mf-privateai` in Sweden Central). Microsoft doesn't train on them. The Sunburst deployment is `GlobalStandard` (checked with `az rest` on 2026-10-24), so per Microsoft's data privacy page (dated 2026-05-18) a request may be processed in any geography where the model runs, including outside the EU, while anything stored at rest, including abuse monitoring data, stays in the resource's geography. Abuse monitoring is on (no `ContentLogging: false` capability on the resource): flagged prompts may be stored and reviewed by Microsoft employees in the EEA. Microsoft's current pages give no retention period, so the policy names none. A `DataZoneStandard` deployment in the EU would keep processing inside the EU; the policy text would then need changing.
- **Browser storage:** the `oreana.auth` cookie (180 days, sliding), short-lived Google sign-in cookies, and local storage, IndexedDB and the service worker cache for offline use. All of it is strictly necessary (§ 25 Abs. 2 Nr. 2 TDDDG).
- **Rights:** Art. 15–18, 20 and 21 GDPR by email, and complaints to a supervisory authority (Art. 77).

Keep the policy in step with the app: a new kind of data, a new service or a change to log retention means changing `de.privacy` and its "Stand" date. The Google OAuth consent screen's privacy policy URL is `https://oreanas-office.otressler.de/datenschutz`.

# Trademark note

Besides the Impressum's "Marken" section, the landing page's footer says that the app is an unofficial fan project, not connected to Wizards of the Coast, and that Dungeons & Dragons and D&D are their trademarks (`de.landing.unofficial`). The app uses no Wizards of the Coast logos.

# Consequences

- Changing the address means changing the repository variable and deploying again (a push to `main` or a rerun of the deploy job).
- If the owner prefers not to publish their home address, a "c/o" address service can be used in `IMPRINT_STREET` and `IMPRINT_CITY`. Whether that satisfies the law isn't fully settled.
- The app needs no cookie banner while it stores only what it needs to work (§ 25 TDDDG): the sign-in cookie and the offline and per-device data in local storage and IndexedDB. Analytics, embedded third-party content, fonts from Google's CDN or Google's One Tap script would change that, so check this decision before adding any of them.
