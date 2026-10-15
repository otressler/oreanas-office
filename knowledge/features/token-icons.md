---
type: Feature
title: Token icons
description: Generated icons for creature types, and generated, uploaded or restyled portraits for characters, kept as versions to pick from.
tags: [feature, ai, images, tokens]
status: draft
generated: { by: claude-code/claude-opus-5-5, at: 2026-10-15T06:28:25Z }
sources:
  - id: brief
    resource: /references/original-brief.md
    title: Original project brief
---

# Goal

Every enemy type has its own recognisable icon.[^brief] All goblins share one icon and are told apart by their label. Every character can have a portrait.

# Requirements

1. Generate an icon for a [creature type](/domain/creature-type.md) from its `name` and `appearance`. Only `dm` members generate creature icons.
2. Generate a portrait for a [character](/domain/character.md) from its `name` and `appearance`. The character's owner and every `dm` member of the campaign can do this. Generating is offered once `appearance` is filled in.
3. Upload a picture as a character's portrait, from a phone's photo library or a computer. A crop step comes first: the person drags and zooms the picture inside the token circle, and only the chosen square is uploaded. The server checks the type and size, and saves it as a square WebP, which also turns it the right way up and drops the photo's metadata, including where it was taken.
4. Restyle an uploaded portrait: the uploaded picture goes to the model as a reference, which paints a portrait of that person or figure in the shared token style. The result is a new version, and the uploaded one stays.
5. Every generation, restyling included, is started by a person and confirmed first, never automatic. All of them count against the site-wide monthly limit ([image budget](/decisions/image-budget.md)).
6. Use a fixed style template so all icons and portraits look like one set: centred subject, top-down or portrait framing, transparent background, nothing important in the corners, no frame or ring painted in. The template is the token template of the `image-assets` skill.
7. **Versions.** Generating again adds a version instead of replacing the image, as with map backgrounds ([AI map generation](/features/ai-map-generation.md)). A creature type and a character each have a gallery of their versions (generated, uploaded and restyled) and one picked version: `iconAssetId` on the creature type, `tokenAssetId` on the character.
8. The app crops icons to a circle and adds a coloured ring: creatures share one red ring, and each character has its own colour ([token](/domain/token.md)).
9. Icons are stored as [assets](/domain/asset.md) and reused in every encounter. The board always shows the creature type's or character's currently picked image, also in running fights: unlike a map's background, encounters don't keep a copy. A changed image isn't pushed to open boards; it shows the next time a board loads.
10. Without an image, the token shows the first letter of its label, so it's still playable.
11. Generating, uploading and picking need a connection; offline, the app says so. Picking syncs at once, like backgrounds ([offline prep](/decisions/offline-prep-pwa.md)).

# Decisions

Decided by the project owner on 2026-10-14, before stage 8 ([implementation plan](/implementation-plan.md), question 19):

- Players may generate portraits for their own characters and spend from the shared budget; the site is for a group of friends.
- Characters get an `appearance` field. Restyling an uploaded picture was the project owner's idea.
- Uploads get a crop step rather than a server-side middle crop.
- Creature icons keep versions in a gallery. Portraits follow the same pattern.
- Changed icons and portraits need no live notification; a reload shows them.

Confirmed by the project owner on 2026-10-15, at the start of stage 8:

- Icons and portraits are generated at high quality, like backgrounds ([image budget](/decisions/image-budget.md)).
- One style for the whole site: the same style block in every icon and portrait prompt, kept as a server setting. There is no style per campaign or per map.
- When a new version finishes, it becomes the picked one; the earlier ones stay in the gallery to switch back to.

# As built (stage 8)

Built on `stage/8-token-icons`.

- **Where.** The bestiary's edit form has an "Symbol" section, and its rows show the picked icon. The character form has the "Aussehen" field and, for the owner and `dm` members, a "Porträt" section; the characters panel shows each portrait. The board, the setup screen, the editor's preview and the encounter editor's canvas draw the picked image, cropped to a circle inside the ring. With an image, a creature's number ("G1") becomes a small badge on the token's lower-right edge.
- **A creature type the server doesn't have yet** gets no gallery, only a note and "Jetzt synchronisieren". Generating first saves the form, syncs the type and sends its server version (`itemVersion`), because the server paints from its own copy.
- **Saving before a portrait job.** A changed name, size or appearance of a character is saved before its portrait is generated. Restyling doesn't save the form.
- **One job at a time per owner.** While an icon or portrait is queued or being painted, generating and restyling wait; uploading still works.
- **A finished job is always picked**, also when someone picked another version by hand while it was running.
- **Uploads.** The crop step sends the chosen square as a 1024 × 1024 JPEG, so a transparent PNG gets the board's dark background behind it. The server keeps every version, uploads included, as a 512 × 512 WebP.
- **Archived creature types** keep their icons and can still switch versions; only generating is refused.
- **First real batch** (2026-10-15, through the app against the Foundry deployment): icons for a goblin, an ogre and a giant spider, and a portrait of a half-elf ranger, high quality, about $0.05 each. They read as one set, with clean transparent backgrounds. A weapon held out to the side (the goblin's sabre, the ogre's club) can reach the frame's edge, so the circle cuts its tip.

[^brief]: Original project brief
