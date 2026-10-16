# Prompt templates

Fill the `<...>` parts. Keep the fixed sentences as they are: they are what keeps results consistent across maps and across a bestiary. Write prompts in plain descriptive sentences; the model follows sentences better than tag lists.

## Map background (image to image from a guide)

```
Repaint this colour-coded layout as a top-down orthographic fantasy battle map for a tabletop game.
Scene: <scene>. Mood: <vibe>. Lighting: <lighting>.

The colours mark where things are. Keep every region exactly where it is and the same shape:
- <legend line 1>
- <legend line 2>
- ...
<Elevation in words, if it matters: "The bridge hangs high above a deep gorge.">
<Edge notes, if any: "The whole bottom row is a solid stone wall.">

Ignore the colours of the input image: they are only a code for where things are, not colours to paint. Take every colour from the scene, mood and lighting alone, so stone looks like stone, water like water and wood like wood.
No <signal colours of this guide, e.g. ochre, dark purple, white or magenta> from the guide may show anywhere in the picture, not even as a tint, glow, haze, light or stain.
Straight-down camera, no perspective, no horizon.
No grid lines, no text, no labels, no frame, no compass.
```

Notes:
- The signal colours are every colour in the legend except the ones real materials have anyway: grey, black, blue, brown, dark brown and dark green. Naming them stops the model from keeping them as a purple haze, a magenta glow on stairs or orange doors (the app's `BackgroundPrompt` does the same).
- The legend comes straight from `render_guide.py`. Rewrite a line when the scene calls for a specific material ("grey = mossy flagstones of a ruined keep").
- Small props (barrels, torches, rubble) are fine and add life, but only on walkable cells, and nothing big enough to look like it blocks movement where the layout says floor.
- For a dark scene, still ask for readable floor: "dark but every floor cell clearly visible".

## Token icon (creature type)

```
Token icon for a tabletop battle map: <name>, <appearance>.
Seen from slightly above, centred, the creature fills the middle of the square frame, with a little space around it.
<STYLE BLOCK>
Transparent background. No text, no border, no ring, no shadow on the ground.
```

Default style block, used word for word for every icon in a campaign unless the user picks another:

```
Painterly fantasy illustration, strong silhouette, rich but not neon colours, soft rim light, readable at small size.
```

Use `--background transparent --size 1024x1024`. Medium quality is enough: icons are shown at about 64 px.

## Character portrait

```
Portrait token for a tabletop battle map: <character name>, <short description: ancestry, class look, notable gear, colours>.
Head and shoulders, facing the viewer at a slight angle, centred in the square frame.
<STYLE BLOCK>
Transparent background. No text, no border, no ring.
```

With an uploaded reference picture, add `--image <file>` and start the prompt with "Turn the person in this picture into a portrait token in the following style".

## Status icon (condition or custom status)

```
Status icon for a tabletop battle map: <status name>, shown as <motif, e.g. "a figure lying flat on the ground">, drawn as a simple bold emblem rather than a detailed scene.
One bold symbol, centred in the square frame, with a little space around it, readable at 20 pixels.
<STYLE BLOCK>
Transparent background. No text, no letters, no numbers, no border, no ring, no badge shape.
```

Use the token style block word for word, so statuses sit with creature icons and portraits as one set. Use `--background transparent --size 1024x1024`. The app draws each icon on a small dark disc on the token's edge, so a symbol needs a clear silhouette and a light or saturated colour against dark grey. Check every result at 20 px before generating the next. Learned in T1 (2026-10-16): without "simple bold emblem" the model paints whole people (a blindfolded elf, a cowering halfling) that turn to mush at 20 px; light, saturated subjects and one large shape read best, dark brown wood and thin horizontal shapes don't ("prone" needed a big arrow above the figure). The 15 conditions and their motifs are in `knowledge/features/statuses.md`.

## Texture or fallback tile

```
Seamless tileable texture of <material>, viewed straight down, even flat lighting, no objects, no shadows, no text.
```

Use 1024x1024, opaque background.
