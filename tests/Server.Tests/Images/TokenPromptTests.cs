using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Tests.Images;

// The token templates of .claude/skills/image-assets/references/prompts.md with the site's
// style block (knowledge/features/token-icons.md, requirement 6).
public sealed class TokenPromptTests
{
    private static readonly string Style = new ImageOptions().TokenStyle;

    [Fact]
    public void A_creature_icon_follows_the_template()
    {
        var prompt = TokenPrompt.CreatureIcon("Goblin", "small, green skin, rusty scimitar", Style);

        Assert.Equal(
            """
            Token icon for a tabletop battle map: Goblin, small, green skin, rusty scimitar.
            Seen from slightly above, centred, the creature fills the middle of the square frame, with a little space around it.
            Painterly fantasy illustration, strong silhouette, rich but not neon colours, soft rim light, readable at small size.
            Transparent background. No text, no border, no ring, no shadow on the ground.
            """.ReplaceLineEndings("\n"),
            prompt);
    }

    [Fact]
    public void Without_an_appearance_the_name_alone_describes_the_creature()
    {
        var prompt = TokenPrompt.CreatureIcon("Oger", "  ", Style);

        Assert.StartsWith("Token icon for a tabletop battle map: Oger.\n", prompt);
    }

    [Fact]
    public void A_character_portrait_follows_the_template()
    {
        var prompt = TokenPrompt.CharacterPortrait("Thorin", "Dwarf fighter, red beard, steel helmet.", Style);

        Assert.Equal(
            """
            Portrait token for a tabletop battle map: Thorin, Dwarf fighter, red beard, steel helmet.
            Head and shoulders, facing the viewer at a slight angle, centred in the square frame.
            Painterly fantasy illustration, strong silhouette, rich but not neon colours, soft rim light, readable at small size.
            Transparent background. No text, no border, no ring.
            """.ReplaceLineEndings("\n"),
            prompt);
    }

    [Fact]
    public void A_restyle_starts_with_the_reference_sentence()
    {
        var prompt = TokenPrompt.Restyle("Aria", "", Style);

        Assert.Equal(
            """
            Turn the person in this picture into a portrait token in the following style.
            Portrait token for a tabletop battle map: Aria.
            Head and shoulders, facing the viewer at a slight angle, centred in the square frame.
            Painterly fantasy illustration, strong silhouette, rich but not neon colours, soft rim light, readable at small size.
            Transparent background. No text, no border, no ring.
            """.ReplaceLineEndings("\n"),
            prompt);
        Assert.Contains("Aria, elf archer.", TokenPrompt.Restyle("Aria", "elf archer", Style));
    }

    [Fact]
    public void Line_breaks_in_the_persons_text_become_spaces()
    {
        var prompt = TokenPrompt.CharacterPortrait(" Thorin ", "red beard,\n  steel helmet\r\n", Style);

        Assert.StartsWith("Portrait token for a tabletop battle map: Thorin, red beard, steel helmet.\nHead", prompt);
    }

    [Fact]
    public void The_style_comes_from_the_setting()
    {
        var prompt = TokenPrompt.CreatureIcon("Goblin", "", "Ink drawing, black and white.");

        Assert.Contains("\nInk drawing, black and white.\n", prompt);
        Assert.DoesNotContain("Painterly", prompt);
    }

    [Fact]
    public void The_stored_prompt_fits_the_column()
    {
        var prompt = TokenPrompt.CreatureIcon("Goblin", new string('x', 5000), Style);

        Assert.Equal(Asset.PromptMaxLength, TokenPrompt.ForStorage(prompt).Length);
        Assert.Equal("short", TokenPrompt.ForStorage("short"));
    }
}
