---
type: Feature
title: Token icons
description: One generated icon per creature type, plus generated or uploaded portraits for characters.
tags: [feature, ai, images, tokens]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T19:13:07Z }
sources:
  - id: brief
    resource: /references/original-brief.md
    title: Original project brief
---

# Goal

Every enemy type has its own recognisable icon.[^brief] All goblins share one icon and are told apart by their label.

# Requirements

1. Generate one icon per [creature type](/domain/creature-type.md) from its `name` and `appearance`.
2. Use a fixed style template so all icons look like one set: centred subject, top-down or portrait framing, transparent background.
3. The app crops icons to a circle and adds a coloured ring: one colour for creatures, another for characters.
4. Characters can use a generated portrait or an uploaded picture ([character](/domain/character.md)).
5. Icons are stored as [assets](/domain/asset.md) and reused in every encounter.
6. Without an icon, the token shows the first letter of the name, so it's still playable.

[^brief]: Original project brief
