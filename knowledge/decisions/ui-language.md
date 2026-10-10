---
type: Decision
title: UI language
description: The app's interface is German only; support for more languages is a backlog idea.
tags: [decision, product, i18n]
decision: accepted
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-10T21:40:00Z }
---

# Decision (set by the project owner)

The app's interface is **German**. Other languages are not supported for now. Supporting several languages is in the [backlog](/backlog.md).

# Consequences

- All interface text is German. It lives in one message catalogue rather than scattered through components, so adding languages later doesn't mean hunting for strings.
- Numbers and dates use German formatting, for example "7,5 m" ([movement distance](/rules/movement-distance.md)).
- Content the DM and players write, such as creature names, appearance, scene and vibe, stays in the language it was written in. The app doesn't translate it.
- Image prompts: the fixed style part of the prompt stays English, and the DM's German scene text is inserted as written ([AI map generation](/features/ai-map-generation.md)). The image spike should confirm that the model handles German scene text well.

# Why multi-language is harder than it looks

Translating the interface is straightforward. The hard part, as the project owner noted, is user content: a bestiary or a scene description would need a version per language, and generated images and icons are built from that text.
