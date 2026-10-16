using OreanasOffice.Server.Images;
using OreanasOffice.Server.Images.Guide;
using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Tests.Images;

// The prompt template from .claude/skills/image-assets/references/prompts.md. Pure code:
// no database, no Docker.
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class BackgroundPromptTests
{
    private const string Colours =
        "\n\nIgnore the colours of the input image: they are only a code for where things are, not colours to paint. "
        + "Take every colour from the scene, mood and lighting alone, so stone looks like stone, water like water and wood like wood.\n";

    private const string Tail =
        "Straight-down camera, no perspective, no horizon.\n"
        + "No grid lines, no text, no labels, no frame, no compass.";

    private const string Opening =
        "Repaint this colour-coded layout as a top-down orthographic fantasy battle map for a tabletop game.\n";

    private const string Rules =
        "The colours mark where things are. Keep every region exactly where it is and the same shape:\n";

    [Fact]
    public void The_gorge_crossing_prompt_is_the_template_filled_in()
    {
        var sample = GuideSamples.Load("gorge-crossing");
        var guide = GuideRenderer.Render(sample.Width, sample.Height, sample.Layout);

        var prompt = BackgroundPrompt.Build(sample.Scene, sample.Vibe, sample.Lighting, sample.Layout, guide);

        Assert.Equal(
            Opening
            + "Scene: rope bridge over a misty gorge. Mood: tense, windy. Lighting: overcast morning.\n"
            + "\n"
            + Rules
            + "- grey = walkable ground (floor, path, earth, flagstones as fits the scene)\n"
            + "- ochre = difficult terrain (rubble, undergrowth, mud, shallow scree)\n"
            + "- dark purple = outside the play area, where nobody can stand: scenery that fits (cliff drop, solid bedrock, darkness, dense forest), never open water or walkable floor\n"
            + "- brown at column 9-12, row 6-7 = bridge (\"Hängebrücke\")\n"
            + "- white at column 4, row 3 = pillar (\"Menhir\")\n"
            + "- magenta = openings at the map edge, painted as the path, doorway or stairs that leads away: Waldweg"
            + Colours
            + "No ochre, dark purple, white or magenta from the guide may show anywhere in the picture, not even as a tint, glow, haze, light or stain.\n"
            + Tail,
            prompt.Replace("\r\n", "\n"));
    }

    [Fact]
    public void A_refinement_asks_to_change_only_the_instruction_and_to_keep_to_the_layout()
    {
        var sample = GuideSamples.Load("gorge-crossing");
        var guide = GuideRenderer.Render(sample.Width, sample.Height, sample.Layout);

        var prompt = BackgroundPrompt.BuildRefinement("  Die Brücke doppelt so breit  ", sample.Layout, guide);

        Assert.Equal(
            "Edit the first image, a top-down battle map for a tabletop game. Change only this: Die Brücke doppelt so breit.\n"
            + "Keep everything else exactly as it is: the same style, colours and lighting, and every region in the same place.\n"
            + "\n"
            + "The second image is the colour-coded layout of the same map. The painted map must keep matching it:\n"
            + "- grey = walkable ground (floor, path, earth, flagstones as fits the scene)\n"
            + "- ochre = difficult terrain (rubble, undergrowth, mud, shallow scree)\n"
            + "- dark purple = outside the play area, where nobody can stand: scenery that fits (cliff drop, solid bedrock, darkness, dense forest), never open water or walkable floor\n"
            + "- brown at column 9-12, row 6-7 = bridge (\"Hängebrücke\")\n"
            + "- white at column 4, row 3 = pillar (\"Menhir\")\n"
            + "- magenta = openings at the map edge, painted as the path, doorway or stairs that leads away: Waldweg\n"
            + "\n"
            + "Ignore the colours of the layout image: they are only a code for where things are, not colours to paint.\n"
            + "No ochre, dark purple, white or magenta from the layout may show anywhere in the picture, not even as a tint, glow, haze, light or stain.\n"
            + Tail,
            prompt.Replace("\r\n", "\n"));
        Assert.EndsWith("Change only this: Lauter Nebel!", BackgroundPrompt.BuildRefinement("Lauter Nebel!", sample.Layout, guide).Split('\n')[0]);
    }

    [Fact]
    public void Only_signal_colours_are_named_and_natural_ones_are_left_to_the_scene()
    {
        // Floor, walls and water are grey, black and blue, which stone and water are anyway.
        var plain = GuideSamples.Floor(4, 2);
        var plainPrompt = BackgroundPrompt.Build("a hall", "", "", plain, GuideRenderer.Render(4, 2, plain));
        Assert.DoesNotContain("from the guide may show", plainPrompt);
        Assert.Contains(Colours.TrimStart('\n'), plainPrompt);

        var crypt = GuideSamples.Load("crypt");
        var cryptPrompt = BackgroundPrompt.Build(
            crypt.Scene, crypt.Vibe, crypt.Lighting, crypt.Layout, GuideRenderer.Render(crypt.Width, crypt.Height, crypt.Layout));
        Assert.Contains(
            "\nNo ochre, dark purple, orange, white, red or magenta from the guide may show anywhere in the picture, not even as a tint, glow, haze, light or stain.\n",
            cryptPrompt);
    }

    [Fact]
    public void Raised_features_get_a_line_with_their_elevation()
    {
        var sample = GuideSamples.Load("river-ford");
        var guide = GuideRenderer.Render(sample.Width, sample.Height, sample.Layout);

        var prompt = BackgroundPrompt.Build(sample.Scene, sample.Vibe, sample.Lighting, sample.Layout, guide);

        Assert.Contains("\nThe wagon (\"Umgestürzter Wagen\") stands 1 m above the base level.\n", prompt);
    }

    [Fact]
    public void Elevation_uses_the_invariant_culture_and_drops_trailing_zeros()
    {
        var layout = GuideSamples.Floor(4, 2) with
        {
            Features =
            [
                new LayoutFeature("f1", "stairs", "stairs", 0, 0, 1, 1, 1.5m, false),
                new LayoutFeature("f2", "table", "Tisch", 2, 0, 1, 1, 3.0m, true),
                new LayoutFeature("f3", "tree", "Baum", 3, 1, 1, 1, 0m, true),
            ],
        };
        var guide = GuideRenderer.Render(4, 2, layout);
        var previous = Thread.CurrentThread.CurrentCulture;
        Thread.CurrentThread.CurrentCulture = new System.Globalization.CultureInfo("de-DE");
        try
        {
            var prompt = BackgroundPrompt.Build("s", "v", "l", layout, guide);

            Assert.Contains("\nThe stairs stands 1.5 m above the base level.\n", prompt);
            Assert.Contains("\nThe table (\"Tisch\") stands 3 m above the base level.\n", prompt);
            Assert.DoesNotContain("The tree", prompt);
        }
        finally
        {
            Thread.CurrentThread.CurrentCulture = previous;
        }
    }

    [Fact]
    public void Empty_texts_leave_out_their_part_and_all_empty_leaves_out_the_line()
    {
        var layout = GuideSamples.Floor(3, 2);
        var guide = GuideRenderer.Render(3, 2, layout);

        Assert.StartsWith(Opening + "Scene: a cave. Lighting: dim.\n\n" + Rules,
            BackgroundPrompt.Build(" a cave ", "  ", "dim", layout, guide));
        Assert.StartsWith(Opening + "Mood: calm.\n\n" + Rules,
            BackgroundPrompt.Build("", "calm", "", layout, guide));
        Assert.StartsWith(Opening + "\n" + Rules,
            BackgroundPrompt.Build("", " ", "\t", layout, guide));
    }

    [Fact]
    public void A_final_full_stop_is_not_doubled()
    {
        var layout = GuideSamples.Floor(3, 2);
        var guide = GuideRenderer.Render(3, 2, layout);

        var prompt = BackgroundPrompt.Build("A cave.", "grim.", "dim.", layout, guide);

        Assert.Contains("\nScene: A cave. Mood: grim. Lighting: dim.\n", prompt);
    }

    [Fact]
    public void A_wide_map_asks_for_dead_terrain_along_the_top_and_bottom()
    {
        var layout = GuideSamples.Floor(40, 10);
        var guide = GuideRenderer.Render(40, 10, layout);

        var prompt = BackgroundPrompt.Build("s", "v", "l", layout, guide);

        Assert.Contains(
            "\nThe dark purple band along the top and bottom lies outside the map: paint it as dead terrain or darkness that fits the scene.\n",
            prompt);
    }

    [Fact]
    public void A_tall_map_asks_for_dead_terrain_along_the_left_and_right()
    {
        var layout = GuideSamples.Floor(10, 40);
        var guide = GuideRenderer.Render(10, 40, layout);

        var prompt = BackgroundPrompt.Build("s", "v", "l", layout, guide);

        Assert.Contains(
            "\nThe dark purple band along the left and right lies outside the map: paint it as dead terrain or darkness that fits the scene.\n",
            prompt);
    }

    [Fact]
    public void An_unpadded_map_has_no_padding_line()
    {
        var layout = GuideSamples.Floor(10, 10);
        var guide = GuideRenderer.Render(10, 10, layout);

        Assert.DoesNotContain("outside the map", BackgroundPrompt.Build("s", "v", "l", layout, guide));
    }

    [Fact]
    public void A_map_full_of_features_is_grouped_and_fits_the_column()
    {
        var kinds = new[] { "tree", "pillar", "table", "barrel", "crate" };
        var features = Enumerable.Range(0, 40 * 40)
            .Select(i => new LayoutFeature($"f{i}", kinds[i % kinds.Length], i % 2 == 0 ? "Eiche" : "", i % 40, i / 40, 1, 1, 0m, true))
            .ToList();
        var layout = GuideSamples.Floor(40, 40) with { Features = features };
        var guide = GuideRenderer.Render(40, 40, layout);
        Assert.True(string.Join('\n', guide.Legend).Length > Asset.PromptMaxLength);

        var prompt = BackgroundPrompt.Build("ein Wald", "still", "Mittag", layout, guide);

        Assert.True(prompt.Length <= Asset.PromptMaxLength, $"{prompt.Length} characters");
        Assert.EndsWith(Tail, prompt);
        Assert.Contains("\n- dark green = tree (\"Eiche\") at column 1, row 1; ", prompt);
        Assert.Contains("; and more\n", prompt);
        // One line per colour, kind and label now: the pillars have two labels.
        Assert.Equal(2, prompt.Split('\n').Count(l => l.StartsWith("- white = pillar", StringComparison.Ordinal)));
    }

    [Fact]
    public void A_moderately_long_legend_is_grouped_without_cutting_positions()
    {
        // 40 rows of 1 tree each take about 55 characters a line when ungrouped.
        var features = Enumerable.Range(0, 80)
            .Select(i => new LayoutFeature($"f{i}", "tree", "Eiche", i % 40, i / 40, 1, 1, 0m, true))
            .ToList();
        var layout = GuideSamples.Floor(40, 40) with { Features = features };
        var guide = GuideRenderer.Render(40, 40, layout);

        var prompt = BackgroundPrompt.Build("s", "v", "l", layout, guide);

        Assert.True(prompt.Length <= Asset.PromptMaxLength);
        Assert.DoesNotContain("and more", prompt);
        Assert.Contains("- dark green = tree (\"Eiche\") at column 1, row 1; column 2, row 1;", prompt);
    }
}
