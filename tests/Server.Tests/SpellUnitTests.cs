using System.Text.Json.Nodes;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Spells;

namespace OreanasOffice.Server.Tests;

[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class SpellUnitTests
{
    [Theory]
    [InlineData("Moonbeam", "moonbeam")]
    [InlineData("Hunter's Mark", "hunters-mark")]
    [InlineData("Enlarge/Reduce", "enlarge-reduce")]
    [InlineData("  Protection from Evil and Good ", "protection-from-evil-and-good")]
    public void Wiki_slugs_follow_the_wikis_page_names(string nameEn, string slug) => Assert.Equal(slug, SpellImport.Slug(nameEn));

    [Fact]
    public void Page_text_keeps_the_content_as_lines_and_drops_the_rest()
    {
        var text = SpellImport.PageText(
            """
            <div id="menu">Menü</div><div id="page-content">
            <p><strong>Range:</strong> 120 feet<br />Duration: 1 minute</p>
            <table><tr><th>Level</th><th>Damage</th></tr><tr><td>1</td><td>2d6</td></tr></table>
            <p>can&#8217;t &amp; won't</p></div><div class="page-tags">druid</div>
            """);

        Assert.Equal("Range: 120 feet\nDuration: 1 minute\n\nLevel | Damage |\n1 | 2d6 |\n\ncan’t & won't", text);
        Assert.Equal("", SpellImport.PageText("<html>no content</html>"));
    }

    [Fact]
    public void The_art_prompt_puts_the_subject_after_the_styles_first_line()
    {
        var prompt = SpellArt.FullPrompt("Painterly.\r\nTall card.\nPrint.", "  a druid in moonlight ");
        Assert.Equal("Painterly.\nSubject: a druid in moonlight\nTall card.\nPrint.", prompt);
        Assert.StartsWith("Digital fantasy concept art", SpellArt.FullPrompt(new ImageOptions().SpellArtStyle, "x"));
    }

    [Fact]
    public void The_card_schema_requires_every_property_as_strict_mode_needs()
    {
        static void Check(JsonObject schema)
        {
            if (schema["properties"] is JsonObject properties)
            {
                Assert.Equal(properties.Select(p => p.Key).Order(), schema["required"]!.AsArray().Select(r => r!.GetValue<string>()).Order());
                Assert.False(schema["additionalProperties"]!.GetValue<bool>());
                foreach (var (_, value) in properties)
                {
                    Check(value!.AsObject());
                }
            }

            if (schema["items"] is JsonObject items)
            {
                Check(items);
            }
        }

        Check(SpellImportPrompts.CardSchema());
        Check(SpellImportPrompts.PhotoSchema());
        var icons = SpellImportPrompts.CardSchema()["properties"]!["icon"]!["enum"]!.AsArray().Select(i => i!.GetValue<string>());
        Assert.Equal(SpellCards.Icons.Order(), icons.Order());
    }

    [Fact]
    public void Every_icon_is_described_to_the_model()
    {
        var system = SpellImportPrompts.WikiSystem;
        Assert.All(SpellCards.Icons, icon => Assert.Contains($" {icon} (", system));
    }
}
