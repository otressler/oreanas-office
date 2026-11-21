---
type: Decision
title: Text model
description: Spell import uses the gpt-6-luna deployment on the existing Foundry resource, signed in like the image model, and its cost counts against the site's monthly AI budget.
tags: [decision, ai, cost, spells]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-21T15:30:00Z }
---

# Question

[Spell cards](/features/spell-cards.md) need a text and vision model: to turn a German spell name into the English one, to write a German card from a dnd2024.wikidot.com page, and to read a photographed book page. Which model, and who pays?

# Decision

Decided by the project owner on 2026-11-21:

- **`gpt-6-luna`** on the Foundry resource `ot-mf-privateai` that already serves the image model. Same OpenAI-compatible v1 endpoint, same sign-in (managed identity in production, `az login` locally), so no new Azure resource and no new key. Chosen over `gpt-5.6-luna` and over Claude through Anthropic's API (a new key, secret and bill).
- **One budget.** Its cost counts against the existing $20 a month ([image budget](/decisions/image-budget.md)), which now covers all AI use on the site.

# How the app uses it

- `Images:TextDeployment` names the deployment, next to the image deployment on the same endpoint (`ImageOptions`); without it "Nach Name" and "Aus Foto" answer `textModelUnavailable`, and making cards by hand still works.
- Reasoning effort `medium` (`Images:TextReasoningEffort`), set by the project owner on 2026-11-21 instead of `low`. Reasoning tokens are billed as output, so a card takes longer and costs a little more, still well under a cent.
- Chat completions with a strict JSON schema, so the answer is always a card the server can check. A photo goes as an image part.
- Every call is recorded with its tokens and cost (`TextModelCall`). Rates: `TextModelInputUsdPerMillion` 0.10 and `TextModelOutputUsdPerMillion` 0.50 (third-party price lists, 2026-11-21; the Azure invoice should confirm them).
- Calls run while the user waits (a few seconds), not in the image queue: nothing is saved until the user saves the draft, so a cut-off call loses nothing.

# Consequences

- The [privacy policy](/decisions/legal-notice.md) names the text model: spell names, wiki pages and book photos go to the same Foundry resource.
- The server fetches pages from dnd2024.wikidot.com, a fan wiki of the 2024 rules. Its texts follow the Player's Handbook, so the cards stay inside this invitation-only site.
