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

Paint real materials, not the flat guide colours: no trace of the purple or magenta may remain. Straight-down camera, no perspective, no horizon.
No grid lines, no text, no labels, no frame, no compass.
```

Notes:
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

## Texture or fallback tile

```
Seamless tileable texture of <material>, viewed straight down, even flat lighting, no objects, no shadows, no text.
```

Use 1024x1024, opaque background.
