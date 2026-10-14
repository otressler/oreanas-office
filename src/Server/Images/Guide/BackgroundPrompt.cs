using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Images.Guide;

// The prompt for a map background: the template in .claude/skills/image-assets/references/
// prompts.md with the map's scene, vibe and lighting, the guide's legend, a line for each
// raised feature, and for a padded guide a line asking for dead terrain or darkness in the
// padding (knowledge/decisions/image-generation-approach.md). Lane: guide and prompt.
public static class BackgroundPrompt
{
    // Contract stub: the scene line only, until the guide and prompt lane writes the template.
    public static string Build(string scene, string vibe, string lighting, MapLayout layout, MapGuide guide) =>
        $"Repaint this colour-coded layout as a top-down battle map. Scene: {scene}. Mood: {vibe}. Lighting: {lighting}.";
}
