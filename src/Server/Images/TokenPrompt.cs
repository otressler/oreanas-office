using System.Text.RegularExpressions;

namespace OreanasOffice.Server.Images;

// The prompts for token icons and portraits: the token templates of the image-assets skill
// (.claude/skills/image-assets/references/prompts.md), word for word, with the site's one
// style block (ImageOptions.TokenStyle) so every icon and portrait reads as one set
// (knowledge/features/token-icons.md, requirement 6). Name and appearance are the person's
// own text; line breaks and runs of spaces become one space.
public static partial class TokenPrompt
{
    private const string IconOpening = "Token icon for a tabletop battle map:";
    private const string IconFraming = "Seen from slightly above, centred, the creature fills the middle of the square frame, with a little space around it.";
    private const string IconEnding = "Transparent background. No text, no border, no ring, no shadow on the ground.";

    private const string PortraitOpening = "Portrait token for a tabletop battle map:";
    private const string PortraitFraming = "Head and shoulders, facing the viewer at a slight angle, centred in the square frame.";
    private const string PortraitEnding = "Transparent background. No text, no border, no ring.";

    // prompts.md: "With an uploaded reference picture, ... start the prompt with ...".
    private const string RestyleOpening = "Turn the person in this picture into a portrait token in the following style.";

    // A creature type's icon from its name and appearance; the name alone when the
    // appearance is empty.
    public static string CreatureIcon(string name, string? appearance, string style) =>
        Lines($"{IconOpening} {Subject(name, appearance)}", IconFraming, Clean(style), IconEnding);

    // A character's portrait from its name and appearance.
    public static string CharacterPortrait(string name, string? appearance, string style) =>
        Lines($"{PortraitOpening} {Subject(name, appearance)}", PortraitFraming, Clean(style), PortraitEnding);

    // An uploaded picture painted in the token style (requirement 4): the portrait template,
    // started with the sentence the skill gives for a reference picture. The appearance, if
    // any, tells the model about the character too.
    public static string Restyle(string name, string? appearance, string style) =>
        Lines(RestyleOpening, CharacterPortrait(name, appearance, style));

    // What is stored on the asset: the column holds Asset.PromptMaxLength characters.
    public static string ForStorage(string prompt) =>
        prompt.Length <= Asset.PromptMaxLength ? prompt : prompt[..Asset.PromptMaxLength];

    // "Goblin, small and green." or "Goblin." without an appearance.
    private static string Subject(string name, string? appearance)
    {
        var cleanName = Clean(name).TrimEnd('.', ' ');
        var cleanAppearance = Clean(appearance ?? "").TrimEnd('.', ' ');
        return cleanAppearance.Length == 0 ? $"{cleanName}." : $"{cleanName}, {cleanAppearance}.";
    }

    private static string Lines(params string[] lines) => string.Join("\n", lines);

    private static string Clean(string text) => Whitespace().Replace(text, " ").Trim();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();
}
