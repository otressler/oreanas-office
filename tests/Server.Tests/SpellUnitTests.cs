using System.Text.Json.Nodes;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Spells;

namespace OreanasOffice.Server.Tests;

[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class SpellUnitTests
{
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

    private static SpellTableRow Row(string title, string text = "") => new() { Key = "1", Title = title, Text = text };

    [Fact]
    public void Tables_are_trimmed_and_their_limits_checked()
    {
        var table = new SpellTable
        {
            Caption = "  Je Schicht RW Geschick  ",
            Rows =
            [
                new SpellTableRow
                {
                    Key = " 1 ",
                    Color = SpellRowColor.Red,
                    Title = " Rot ",
                    Text = "Fernkampf kommt nicht durch.\r\n**Zerstört:** 25 Kälteschaden",
                    Chip = new SpellChip { Big = " 12W6 ", Small = " ", Kind = SpellChipKind.Fire },
                },
                new SpellTableRow { Text = "nur Text" },
            ],
        };
        var (card, error) = SpellCards.Validate(SpellTestApi.Card() with { Tables = [table] });
        Assert.Null(error);
        var saved = Assert.Single(card!.Tables);
        Assert.Equal("Je Schicht RW Geschick", saved.Caption);
        Assert.Equal(
            ("1", SpellRowColor.Red, "Rot", "Fernkampf kommt nicht durch.\n**Zerstört:** 25 Kälteschaden"),
            (saved.Rows[0].Key, saved.Rows[0].Color, saved.Rows[0].Title, saved.Rows[0].Text));
        Assert.Equal(("12W6", null), (saved.Rows[0].Chip!.Big, saved.Rows[0].Chip!.Small));
        Assert.Equal(("", "nur Text"), (saved.Rows[1].Title, saved.Rows[1].Text));

        string? Field(SpellCard c) => SpellCards.Validate(c).Error?.Field;
        var plain = SpellTestApi.Card();
        Assert.Equal("card.tables", Field(plain with { Tables = [.. Enumerable.Repeat(table, SpellCards.TablesMax + 1)] }));
        Assert.Equal("card.tables[0]", Field(plain with { Tables = [new SpellTable()] }));
        Assert.Equal("card.tables[0]", Field(plain with { Tables = [new SpellTable { Rows = [.. Enumerable.Repeat(Row("x"), SpellCards.TableRowsMax + 1)] }] }));
        Assert.Equal("card.tables[0]", Field(plain with { Tables = [new SpellTable { Caption = new string('x', SpellCards.TableCaptionMax + 1), Rows = [Row("x")] }] }));
        Assert.Equal("card.tables[1].rows[1]", Field(plain with { Tables = [table, new SpellTable { Rows = [Row("x"), Row(" ", " ")] }] }));
        Assert.Equal("card.tables[0].rows[0]", Field(plain with { Tables = [new SpellTable { Rows = [Row("x") with { Key = "1234567" }] }] }));
        Assert.Equal("card.tables[0].rows[0]", Field(plain with { Tables = [new SpellTable { Rows = [Row("x", new string('x', SpellCards.TableTextMax + 1))] }] }));
        Assert.Equal("card.tables[0].rows[0]", Field(plain with { Tables = [new SpellTable { Rows = [Row("x") with { Chip = new SpellChip { Big = " " } }] }] }));
        Assert.Equal("card.tables[0].rows[0]", Field(plain with { Tables = [new SpellTable { Rows = [Row("x") with { Color = (SpellRowColor)99 }] }] }));
    }

    [Fact]
    public void A_break_point_in_the_name_is_saved_as_a_soft_hyphen()
    {
        var (card, _) = SpellCards.Validate(SpellTestApi.Card(" Sonnen|explosion "));
        Assert.Equal("Sonnen­explosion", card!.Name);
        Assert.Equal("Sonnenexplosion", SpellCards.WithoutBreakPoints(card.Name));
        // A name of break points only is no name.
        Assert.Equal("card.name", SpellCards.Validate(SpellTestApi.Card("||")).Error?.Field);
    }

    // knowledge/features/spell-cards.md, "Planned", step 4: the revision keeps the words.
    [Fact]
    public void The_revision_check_ignores_markup_and_spacing_but_not_words()
    {
        Assert.Equal(
            SpellCardRevise.Words("Ein Strahl. Das Ziel ist festgesetzt und kann wählen: Lauf oder Sprung"),
            SpellCardRevise.Words("Ein Strahl.\n\n**Das Ziel** ist [[festgesetzt]] und kann *wählen*:\n- Lauf oder\n- Sprung"));
        Assert.Equal(SpellCardRevise.Words("im Vorteil"), SpellCardRevise.Words("[[im Vorteil|Vorteil]]"));
        Assert.NotEqual(SpellCardRevise.Words("Das Ziel ist festgesetzt."), SpellCardRevise.Words("Das Ziel wird festgesetzt."));
        Assert.NotEqual(SpellCardRevise.Words("A, B"), SpellCardRevise.Words("- A\n- B"));
    }

    [Fact]
    public void The_revision_takes_only_the_texts_form_and_the_status_fields()
    {
        var old = SpellTestApi.Card("Sonnenexplosion") with { Description = "Licht. Es blendet." };
        var proposed = old with
        {
            Name = "Sonnen|explosion",
            Description = "**Licht.** Es [[blendet]].",
            CastingTime = "1 Bonusaktion",
            Effects = [old.Effects[0] with { Title = "Anders", Text = "RW [[Konstitution]]" }],
            OfferStatus = true,
            Statuses = ["blinded"],
        };

        var (card, changed) = SpellCardRevise.Merge(old, proposed);
        Assert.Null(changed);
        Assert.Equal(("Sonnen" + SpellCards.SoftHyphen + "explosion", "**Licht.** Es [[blendet]].", "1 Aktion"), (card.Name, card.Description, card.CastingTime));
        Assert.Equal(("Zylinder 1,5 m", "RW [[Konstitution]]"), (card.Effects[0].Title, card.Effects[0].Text));
        Assert.True(card.OfferStatus);
        Assert.Equal(["blinded"], card.Statuses);

        Assert.Equal("card.effects[0]", SpellCardRevise.Merge(old, proposed with { Effects = [old.Effects[0] with { Text = "RW Stärke" }] }).Changed);
        Assert.Equal("card.name", SpellCardRevise.Merge(old, proposed with { Name = "Sonnenstrahl" }).Changed);
        // Another number of rows: the card keeps its own.
        Assert.Equal(old.Effects, SpellCardRevise.Merge(old, proposed with { Effects = [] }).Card.Effects);
    }

    // knowledge/domain/spell.md, "The card": the conditions a card offers are condition keys,
    // each once, kept in the conditions' order; Konzentration comes from "concentration".
    [Fact]
    public void A_cards_statuses_are_condition_keys()
    {
        var (card, _) = SpellCards.Validate(SpellTestApi.Card() with { OfferStatus = true, Statuses = ["restrained", "prone"] });
        Assert.True(card!.OfferStatus);
        Assert.Equal(["prone", "restrained"], card.Statuses);
        Assert.Equal("card.statuses", SpellCards.Validate(SpellTestApi.Card() with { Statuses = ["concentration"] }).Error?.Field);
        Assert.Equal("card.statuses", SpellCards.Validate(SpellTestApi.Card() with { Statuses = ["prone", "prone"] }).Error?.Field);
        Assert.Equal("card.statuses", SpellCards.Validate(SpellTestApi.Card() with { Statuses = [null!] }).Error?.Field);
    }

    [Fact]
    public void A_long_description_is_allowed_up_to_its_limit()
    {
        Assert.Null(SpellCards.Validate(SpellTestApi.Card() with { Description = new string('x', SpellCards.DescriptionMax) }).Error);
        Assert.Equal(
            "card.description",
            SpellCards.Validate(SpellTestApi.Card() with { Description = new string('x', SpellCards.DescriptionMax + 1) }).Error?.Field);
    }

    [Fact]
    public void The_motif_prompt_reads_the_tables()
    {
        var card = SpellTestApi.Card() with { Tables = [new SpellTable { Caption = "Sieben Schichten", Rows = [Row("Rot", "Feuer\n**Zerstört:** Kälte")] }] };
        var prompt = SpellImportPrompts.MotifUser(new SpellMotifInput("Prismatic Wall", 9, SpellSchool.Abjuration, card, ["Wizard"], [], []));
        Assert.Contains("Sieben Schichten\n- 1 Rot: Feuer **Zerstört:** Kälte", prompt);
    }
}
