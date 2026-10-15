using System.Globalization;
using System.Text.RegularExpressions;
using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Images.Guide;

// The prompt for a map background: the template in .claude/skills/image-assets/references/
// prompts.md with the map's scene, vibe and lighting, the guide's legend, a line for each
// raised feature, and for a padded guide a line asking for dead terrain or darkness in the
// padding (knowledge/decisions/image-generation-approach.md). Lane: guide and prompt.
public static partial class BackgroundPrompt
{
    private const string Opening = "Repaint this colour-coded layout as a top-down orthographic fantasy battle map for a tabletop game.";
    private const string Rules = "The colours mark where things are. Keep every region exactly where it is and the same shape:";
    // The model tends to keep the guide's signal colours as tints, glows and haze (a purple
    // mist, a magenta glow on stairs, orange doors), so the prompt says the colours are only a
    // code and names the signal colours this guide uses.
    private const string Colours = "Ignore the colours of the input image: they are only a code for where things are, not colours to paint. Take every colour from the scene, mood and lighting alone, so stone looks like stone, water like water and wood like wood.";
    private const string Camera = "Straight-down camera, no perspective, no horizon.";

    // Refining a finished version (knowledge/features/ai-map-generation.md, "Refining"): the
    // picture comes first, the guide second, so the model changes only what the DM asked for
    // and keeps to the layout.
    private const string RefineOpening = "Edit the first image, a top-down battle map for a tabletop game.";
    private const string RefineKeep = "Keep everything else exactly as it is: the same style, colours and lighting, and every region in the same place.";
    private const string RefineRules = "The second image is the colour-coded layout of the same map. The painted map must keep matching it:";
    private const string RefineColours = "Ignore the colours of the layout image: they are only a code for where things are, not colours to paint.";
    private const string NoMarks = "No grid lines, no text, no labels, no frame, no compass.";

    // Guide colours that real materials have anyway (floor, wall, water, bridge, tree); all
    // other guide colours are signal colours that must not show in the picture.
    private static readonly HashSet<string> NaturalColours = ["grey", "black", "blue", "brown", "dark brown", "dark green"];

    // "<colour> at column <span>, row <span> = <kind>[ (\"<label>\")]", as GuideRenderer writes it.
    [GeneratedRegex("""^(?<colour>[a-z ]+?) at column (?<column>[\d-]+), row (?<row>[\d-]+) = (?<what>.+)$""")]
    private static partial Regex FeatureLine();

    public static string Build(string scene, string vibe, string lighting, MapLayout layout, MapGuide guide)
    {
        var intro = new List<string> { Opening };
        var parts = new[] { ("Scene", scene), ("Mood", vibe), ("Lighting", lighting) }
            .Select(p => (p.Item1, Text: p.Item2?.Trim() ?? ""))
            .Where(p => p.Text.Length > 0)
            .Select(p => $"{p.Item1}: {p.Text}{(p.Text.EndsWith('.') ? "" : ".")}")
            .ToList();
        if (parts.Count > 0)
        {
            intro.Add(string.Join(' ', parts));
        }

        intro.Add("");
        intro.Add(Rules);
        return Assemble(intro, Colours, "guide", layout, guide);
    }

    // The prompt for refining a finished version: the DM's instruction, then the guide's
    // legend so the edit keeps to the layout. The picture and the guide go along as images.
    public static string BuildRefinement(string instruction, MapLayout layout, MapGuide guide)
    {
        var text = instruction.Trim();
        if (text.Length > 0 && !".!?".Contains(text[^1]))
        {
            text += ".";
        }

        List<string> intro = [$"{RefineOpening} Change only this: {text}", RefineKeep, "", RefineRules];
        return Assemble(intro, RefineColours, "layout", layout, guide);
    }

    // Legend, elevation and padding lines and the closing rules after `intro`, shortened to
    // fit Asset.PromptMaxLength. `source` names the guide in the signal colour line.
    private static string Assemble(List<string> intro, string colours, string source, MapLayout layout, MapGuide guide)
    {
        // Lines after the legend: elevation in words, then the note about the padding.
        var elevation = layout.Features
            .Where(f => f.Elevation > 0)
            .Select(f => $"The {f.Kind}{(!string.IsNullOrEmpty(f.Label) && f.Label != f.Kind ? $" (\"{f.Label}\")" : "")} stands "
                + $"{f.Elevation.ToString("0.#", CultureInfo.InvariantCulture)} m above the base level.")
            .ToList();

        var padding = new List<string>();
        if (guide.Padded)
        {
            // A padded frame is about 3:1, wide when the map was too wide and tall when too tall.
            var sides = guide.FrameWidth > guide.FrameHeight ? "top and bottom" : "left and right";
            padding.Add($"The dark purple band along the {sides} lies outside the map: paint it as dead terrain or darkness that fits the scene.");
        }

        var closing = new List<string> { colours };
        if (SignalColours(guide.Legend) is { Count: > 0 } signals)
        {
            closing.Add($"No {Join(signals)} from the {source} may show anywhere in the picture, not even as a tint, glow, haze, light or stain.");
        }

        closing.Add(Camera);
        closing.Add(NoMarks);

        var legend = guide.Legend.Select(l => new Entry(l)).ToList();
        var prompt = Compose(intro, legend, elevation, padding, closing);
        if (prompt.Length <= Asset.PromptMaxLength)
        {
            return prompt;
        }

        // Too long (a map full of features): one line per colour and kind with all its
        // positions, then positions cut from the longest lines.
        var grouped = Group(legend);
        prompt = Compose(intro, grouped, elevation, padding, closing);
        while (prompt.Length > Asset.PromptMaxLength)
        {
            var longest = grouped.Where(e => e.Positions is { Count: > 1 }).MaxBy(e => e.Text.Length);
            if (longest is not null)
            {
                longest.Positions!.RemoveAt(longest.Positions.Count - 1);
                longest.More = true;
            }
            else if (elevation.Count > 0)
            {
                // Last resort, so the stored prompt always fits its column.
                elevation.RemoveAt(elevation.Count - 1);
            }
            else
            {
                var last = grouped.FindLastIndex(e => e.Positions is not null);
                if (last < 0)
                {
                    break;
                }

                grouped.RemoveAt(last);
            }

            prompt = Compose(intro, grouped, elevation, padding, closing);
        }

        return prompt;
    }

    private static string Compose(
        List<string> intro, List<Entry> legend, List<string> elevation, List<string> padding, List<string> closing)
    {
        var lines = new List<string>(intro);
        lines.AddRange(legend.Select(e => $"- {e.Text}"));
        lines.AddRange(elevation);
        lines.AddRange(padding);
        lines.Add("");
        lines.AddRange(closing);
        return string.Join('\n', lines);
    }

    // The colour names the legend uses, in legend order, without the natural ones.
    private static List<string> SignalColours(IEnumerable<string> legend) =>
    [
        .. legend
            .Select(line => line.Split(" = ")[0].Split(" at column")[0].Trim())
            .Where(colour => !NaturalColours.Contains(colour))
            .Distinct(),
    ];

    // "purple", "purple or magenta", "purple, magenta or orange".
    private static string Join(List<string> items) =>
        items.Count == 1 ? items[0] : $"{string.Join(", ", items[..^1])} or {items[^1]}";

    // Features with the same colour and kind share a line; everything else stays as it is.
    private static List<Entry> Group(List<Entry> legend)
    {
        var result = new List<Entry>();
        var groups = new Dictionary<string, Entry>();
        foreach (var entry in legend)
        {
            var match = FeatureLine().Match(entry.Text);
            if (!match.Success)
            {
                result.Add(entry);
                continue;
            }

            var colour = match.Groups["colour"].Value;
            var what = match.Groups["what"].Value;
            var position = $"column {match.Groups["column"].Value}, row {match.Groups["row"].Value}";
            if (groups.TryGetValue($"{colour}|{what}", out var group))
            {
                group.Positions!.Add(position);
            }
            else
            {
                group = new Entry(colour, what, [position]);
                groups[$"{colour}|{what}"] = group;
                result.Add(group);
            }
        }

        return result;
    }

    // A legend line, or a group of feature lines that share colour and kind.
    private sealed class Entry
    {
        private readonly string _colour = "";
        private readonly string _what = "";
        private readonly string _plain = "";

        public Entry(string plain) => _plain = plain;

        public Entry(string colour, string what, List<string> positions)
        {
            _colour = colour;
            _what = what;
            Positions = positions;
        }

        public List<string>? Positions { get; }

        public bool More { get; set; }

        public string Text => Positions is null
            ? _plain
            : $"{_colour} = {_what} at {string.Join("; ", Positions)}{(More ? "; and more" : "")}";
    }
}
