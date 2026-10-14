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
    private const string Materials = "Paint real materials, not the flat guide colours: no trace of the purple or magenta may remain. Straight-down camera, no perspective, no horizon.";
    private const string NoMarks = "No grid lines, no text, no labels, no frame, no compass.";

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

        var legend = guide.Legend.Select(l => new Entry(l)).ToList();
        var prompt = Compose(intro, legend, elevation, padding);
        if (prompt.Length <= Asset.PromptMaxLength)
        {
            return prompt;
        }

        // Too long (a map full of features): one line per colour and kind with all its
        // positions, then positions cut from the longest lines.
        var grouped = Group(legend);
        prompt = Compose(intro, grouped, elevation, padding);
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

            prompt = Compose(intro, grouped, elevation, padding);
        }

        return prompt;
    }

    private static string Compose(List<string> intro, List<Entry> legend, List<string> elevation, List<string> padding)
    {
        var lines = new List<string>(intro) { "", Rules };
        lines.AddRange(legend.Select(e => $"- {e.Text}"));
        lines.AddRange(elevation);
        lines.AddRange(padding);
        lines.Add("");
        lines.Add(Materials);
        lines.Add(NoMarks);
        return string.Join('\n', lines);
    }

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
