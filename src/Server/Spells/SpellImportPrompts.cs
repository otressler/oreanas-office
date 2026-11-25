using System.Text.Json.Nodes;

namespace OreanasOffice.Server.Spells;

// What spell import sends to the text model (knowledge/features/spell-cards.md, "Creating a
// spell"). The two example cards are German versions of Moonbeam and Thunderwave from the
// System Reference Document 5.2 by Wizards of the Coast LLC, licensed under CC BY 4.0
// (https://creativecommons.org/licenses/by/4.0/), as written for the spell-cards app.
public static class SpellImportPrompts
{
    public const string NameSystem =
        """
        You map a spell name, typed in any language and possibly misspelled, to the official English name of the spell in the Dungeons & Dragons 2024 Player's Handbook (or another 2024 rules book).
        German names follow the 2024 German Spielerhandbuch ("Mondstrahl" = "Moonbeam", "Heilendes Wort" = "Healing Word"). Spells renamed in 2024 use the 2024 name ("Tasha's Hideous Laughter" = "Hideous Laughter").
        Answer with null when the input is not the name of a D&D spell.
        """;

    public static readonly JsonObject NameSchema = (JsonObject)JsonNode.Parse(
        """
        {
          "type": "object",
          "properties": { "nameEn": { "type": ["string", "null"] } },
          "required": ["nameEn"],
          "additionalProperties": false
        }
        """)!;

    private const string CardRules =
        """
        You write German spell cards for a Dungeons & Dragons 2024 group. A card is small (a tarot card), so the text must be complete in its rules but tight.

        Language and units:
        - Everything on the card is German, in the terms of the 2024 German Spielerhandbuch: "Aktion", "Bonusaktion", "Reaktion", "Magie-Aktion", "Rettungswurf", "Fernkampf-Zauberangriff", "Nahkampf-Zauberangriff", "Konzentration", "Trefferpunkte", "Vorteil", "Nachteil", condition names as in the German book ("Verängstigt", "Liegend", "Gelähmt" …).
        - "name" is the official German 2024 name of the spell when you know it, otherwise a faithful German translation. When a word of it is longer than 12 letters, mark the one place where it reads best broken across two lines with "|", usually between the parts of a compound ("Sonnen|explosion", "Monster|festhalten"); the card shows the mark only as a hyphen where it breaks. "nameEn" is the official English 2024 name.
        - Dice are written the German way: "2W10", "1W8 + Mod". Use "Mod" for the spellcasting ability modifier.
        - Never feet or miles: 5 ft = 1,5 m, 10 ft = 3 m, 15 ft = 4,5 m, 20 ft = 6 m, 30 ft = 9 m, 60 ft = 18 m, 90 ft = 27 m, 100 ft = 30 m, 120 ft = 36 m, 150 ft = 45 m, 300 ft = 90 m, 1 mile = 1,5 km. Decimal comma.

        Fields:
        - "castingTime": "1 Aktion", "1 Bonusaktion", "1 Reaktion", "1 Minute", "10 Minuten" …
        - "range": "Selbst", "Berührung", "18 m", "Selbst (4,5-m-Würfel)" …
        - "components": "V, G, M" (V verbal, G Gesten for somatic, M material). The material itself goes into "material" in German, without "M:", or "" when there is none.
        - "duration": "Unmittelbar", "1 Runde", "10 Minuten", "1 Stunde" …; with concentration write "bis 1 Minute" and set "concentration" to true.
        - "ritual": true when the spell has the Ritual tag.
        - "description": the full rules text in German, condensed but leaving out no rule. Aim for at most 700 characters. A long spell may take more, up to 2800: the back of the card then scrolls, so never leave out a rule to make it short. Mark the attack roll or saving throw and other key terms with **bold**. A short spell is one paragraph. A longer one is split into short paragraphs by topic, separated by a blank line, each starting with a bold lead-in that ends in a period when the spell has distinct parts ("**Wand oder Kugel.** …", "**Licht.** …"). When the caster picks one of several options, list them as lines starting with "- ". No headings.
        - "effects": 1 to 4 short rows that sum up the mechanics at a glance: "title" up to 30 characters, "tag" (up to 24) for the action it needs when that differs from casting ("Magie-Aktion", "Bonusaktion") or a condition ("immer"), else null, "text" up to 200 characters. A row with damage or healing dice gets a "chip": "big" up to 12 characters ("2W10", "1W8 + Mod"), "small" up to 14 ("Gleißend", "Heilung"), and "kind" the damage type (or "heal" for healing, null for other values such as "+1W4").
        - "tables": [] unless the rules text has a table, or parallel cases that read like one (Prismatic Wall's seven layers, Confusion's behaviour roll, Control Weather's stages). Then up to 3 tables of up to 12 rows, and their content stays out of "description" and "effects". "caption" up to 80 characters says what applies to every row ("Je Schicht RW Geschick · Erfolg: halber Schaden"), or "". Each row: "key" up to 6 characters, the roll or the order ("1", "2–4") or ""; "color" the row's colour when the rule names one (red, orange, yellow, green, blue, indigo, violet), else null; "title" up to 30 ("Rot", "Feuer"); "text" up to 300, a row's parts on lines of their own with a bold label ("**Zerstört:** 25 Kälteschaden"); and a "chip" for damage dice as in an effect row, else null.
        - "higherLevels": for a cantrip the damage by character level, "5 → 2W10 · 11 → 3W10 · 17 → 4W10"; for a levelled spell what a higher spell slot does, "+1W10 je Grad über 2"; "" when nothing changes.
        - "tip": a short practical hint for the player only when one really helps, else "".
        - "source": "" for the Player's Handbook, else the book's name.
        - "writeIns": "attack" when the spell makes a spell attack, "saveDc" when a creature makes a saving throw against it, "modifier" when the spellcasting modifier is added to something. Empty when none applies.
        - "icon": the one icon that stands for the spell; "pips": one or two icons for the card's lower corners. Each effect row has an "icon" too. Only icons from the list: hourglass (time), range (target, reach), spark (magic, generic), clock (duration), shard (piercing, ice shard), burst (explosion), snow (cold), up (increase), leaf (plants, nature), flame (fire), drop (water, poison, liquid), skull (death, necrotic), star (radiant, stars), thunder (sound, thunder), heart (healing, life), shield (protection), eye (sight, divination), paw (animals), chat (speech, message), whip (whip, vine), cloud (weather, fog), berry (food, berries), feet (walking, speed), jump (jumping), needle (repair, sewing), book (knowledge, ritual), wind (air, wind), spiral (illusion, confusion), staff (staff, club), cube (area, object), bee (insects), mountain (earth, stone), pulse (life signs), pull (pulling), push (pushing), d20 (rolls, luck), bulb (idea), sun (light, daylight), heartplus (temporary hit points), bird (birds, messenger), tree (trees, forest), crown (charm, command), trap (traps, restraint), blade (blade, weapon), expand (growing, enlarge), chain (binding), compass (finding, direction), moon (moonlight, night), spikes (spikes, thorns), turtle (shell, armour).
        - "level": 0 for a cantrip, else 1 to 9. "school": the spell's school.

        Two example cards (as JSON, the format you answer in):
        {"nameEn":"Moonbeam","name":"Mondstrahl","level":2,"school":"evocation","castingTime":"1 Aktion","range":"36 m","components":"V, G, M","duration":"bis 1 Minute","concentration":true,"ritual":false,"description":"Ein silbriger Strahl fahlen Lichts fällt als Zylinder (1,5 m Radius, 12 m hoch) um einen Punkt in Reichweite herab und füllt ihn mit dämmrigem Licht. Jede Kreatur im Zylinder legt beim Erscheinen einen **Konstitutionsrettungswurf** ab: 2W10 gleißender Schaden bei Misserfolg, halb so viel bei Erfolg. Gestaltwandler nehmen bei Misserfolg ihre wahre Gestalt an und können sich nicht verwandeln, bis sie den Zylinder verlassen. Den Rettungswurf legt eine Kreatur auch ab, wenn der Strahl in ihr Feld bewegt wird, sie den Bereich betritt oder dort ihren Zug beendet, höchstens einmal pro Zug. In späteren Zügen kannst du den Zylinder mit einer **Magie-Aktion** bis zu 18 m bewegen.","effects":[{"icon":"moon","title":"Zylinder 1,5 m","tag":null,"text":"RW Konstitution · halber Schaden bei Erfolg","chip":{"big":"2W10","small":"Gleißend","kind":"radiant"}},{"icon":"push","title":"Bewegen","tag":"Magie-Aktion","text":"in späteren Zügen bis 18 m","chip":null}],"icon":"moon","pips":["moon"],"higherLevels":"+1W10 je Grad über 2","tip":"","material":"ein Mondsamenblatt","source":"","writeIns":["saveDc"]}
        {"nameEn":"Thunderwave","name":"Donnerwoge","level":1,"school":"evocation","castingTime":"1 Aktion","range":"Selbst","components":"V, G","duration":"Unmittelbar","concentration":false,"ritual":false,"description":"Du entfesselst eine Woge donnernder Energie. Jede Kreatur in einem 4,5-m-Würfel, der von dir ausgeht, legt einen **Konstitutionsrettungswurf** ab. Bei einem Misserfolg erleidet sie 2W8 Schallschaden und wird 3 m von dir weggestoßen, bei einem Erfolg nur den halben Schaden. Ungesicherte Objekte vollständig im Würfel werden ebenfalls 3 m weggestoßen; ein Dröhnen ist 90 m weit zu hören.","effects":[{"icon":"thunder","title":"Würfel 4,5 m","tag":null,"text":"geht von dir aus · RW Konstitution","chip":{"big":"2W8","small":"Schall","kind":"thunder"}},{"icon":"push","title":"Misserfolg","tag":null,"text":"voller Schaden + 3 m weggestoßen","chip":null},{"icon":"shield","title":"Erfolg","tag":null,"text":"halber Schaden, kein Stoß","chip":null}],"icon":"thunder","pips":["thunder","push"],"higherLevels":"+1W8 Schall je Grad über 1 (Grad 2 → 3W8)","tip":"","material":"","source":"","writeIns":["saveDc"]}
        """;

    public const string WikiSystemIntro =
        "You get the English rules text of one spell from the D&D 2024 wiki and write its German card.";

    public static string WikiSystem => $"{WikiSystemIntro}\n\n{CardRules}";

    public static string WikiUser(string nameEn, string pageText) =>
        $"Spell: {nameEn}\n\nWiki page text:\n{pageText}";

    public static string PhotoSystem =>
        $"""
        You get a photo of one or two pages of a Dungeons & Dragons rules book, usually the 2024 Player's Handbook, in English or German. Read every spell whose description is complete on the photo and write a German card for each, in the order they appear. Leave out a spell that is cut off so much that its rules can't be read. Answer with an empty list when the photo shows no spell.

        {CardRules}
        """;

    public const string PhotoUser = "The book page:";

    private static readonly string[] SchoolNames =
        ["abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation"];

    private static readonly string[] ChipKinds =
        ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder", "heal"];

    private static readonly string[] RowColors = ["red", "orange", "yellow", "green", "blue", "indigo", "violet"];

    public static JsonObject CardSchema()
    {
        JsonArray Strings(IEnumerable<string> values) => [.. values.Select(v => (JsonNode)v)];
        JsonObject Text() => new() { ["type"] = "string" };
        JsonObject IconEnum() => new() { ["type"] = "string", ["enum"] = Strings(SpellCards.Icons.Order(StringComparer.Ordinal)) };

        var chip = new JsonObject
        {
            ["type"] = new JsonArray("object", "null"),
            ["properties"] = new JsonObject
            {
                ["big"] = Text(),
                ["small"] = new JsonObject { ["type"] = new JsonArray("string", "null") },
                ["kind"] = new JsonObject { ["type"] = new JsonArray("string", "null"), ["enum"] = Strings([.. ChipKinds, null!]) },
            },
            ["required"] = new JsonArray("big", "small", "kind"),
            ["additionalProperties"] = false,
        };
        var effect = new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["icon"] = IconEnum(),
                ["title"] = Text(),
                ["tag"] = new JsonObject { ["type"] = new JsonArray("string", "null") },
                ["text"] = Text(),
                ["chip"] = chip,
            },
            ["required"] = new JsonArray("icon", "title", "tag", "text", "chip"),
            ["additionalProperties"] = false,
        };
        var row = new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["key"] = Text(),
                ["color"] = new JsonObject { ["type"] = new JsonArray("string", "null"), ["enum"] = Strings([.. RowColors, null!]) },
                ["title"] = Text(),
                ["text"] = Text(),
                ["chip"] = chip.DeepClone(),
            },
            ["required"] = new JsonArray("key", "color", "title", "text", "chip"),
            ["additionalProperties"] = false,
        };
        var table = new JsonObject
        {
            ["type"] = "object",
            ["properties"] = new JsonObject
            {
                ["caption"] = Text(),
                ["rows"] = new JsonObject { ["type"] = "array", ["items"] = row },
            },
            ["required"] = new JsonArray("caption", "rows"),
            ["additionalProperties"] = false,
        };
        var properties = new JsonObject
        {
            ["nameEn"] = Text(),
            ["name"] = Text(),
            ["level"] = new JsonObject { ["type"] = "integer" },
            ["school"] = new JsonObject { ["type"] = "string", ["enum"] = Strings(SchoolNames) },
            ["castingTime"] = Text(),
            ["range"] = Text(),
            ["components"] = Text(),
            ["duration"] = Text(),
            ["concentration"] = new JsonObject { ["type"] = "boolean" },
            ["ritual"] = new JsonObject { ["type"] = "boolean" },
            ["description"] = Text(),
            ["effects"] = new JsonObject { ["type"] = "array", ["items"] = effect },
            ["tables"] = new JsonObject { ["type"] = "array", ["items"] = table },
            ["icon"] = IconEnum(),
            ["pips"] = new JsonObject { ["type"] = "array", ["items"] = IconEnum() },
            ["higherLevels"] = Text(),
            ["tip"] = Text(),
            ["material"] = Text(),
            ["source"] = Text(),
            ["writeIns"] = new JsonObject
            {
                ["type"] = "array",
                ["items"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray("attack", "saveDc", "modifier") },
            },
        };
        return new JsonObject
        {
            ["type"] = "object",
            ["properties"] = properties,
            ["required"] = Strings(properties.Select(p => p.Key)),
            ["additionalProperties"] = false,
        };
    }

    // The studio's "Vorschlagen" (knowledge/features/spell-cards.md, "Art studio"): one
    // subject for the image model. The examples are motifs of the spell-cards app; the server
    // adds the style block (ImageOptions.SpellArtStyle), so the subject leaves style and
    // layout out.
    public const string MotifSystem =
        """
        You suggest the subject of a painting for a Dungeons & Dragons spell card (a tall tarot-style card). You get the card's German rules text and the subjects the card already has. Answer with one new subject in English for an image model.

        - One or two sentences, 150 to 400 characters: what is shown, who, where, the light and the one moment of the spell taking effect. Concrete and visual; the viewer should recognise the spell from the picture.
        - Only the subject. The style (loose painterly concept art), the tall format and the empty band for the title are added by the app, so never mention art style, medium, colours of the whole picture, camera, format, borders or text.
        - Show the spell's effect as the rules describe it, translated into an image: its shape (a cylinder of light, a cone of flame, a sphere), its targets, its material component when it is a striking object.
        - The caster, when one is shown, fits the classes whose list the spell is on: a druid, a wizard, a cleric, a bard, a paladin and so on. Vary race, age and gender. No named characters from books, films or games, no real people.
        - Make it differ clearly from the subjects the card already has: a different scene, framing or setting. Good alternatives are a wide scene of the spell in action, a close view of the hands or the magic itself, or the effect on a creature in another landscape.
        - No lettering, runes that read as text, gore or cruelty; danger and battle are fine.

        Examples of good subjects:
        - a lone grey wolf howling upward in a dark forest clearing, a single tall column of pale silver moonlight pouring down from a full moon onto it, twisted tree silhouettes framing the scene.
        - close view of a druid's hand holding a glowing moonseed leaf up toward the full moon, a narrow silver beam forming between the leaf and the sky, moths and fireflies circling in the pale light.
        - a battlefield in a rocky pass where a fallen fighter lies on the ground, a druid far behind the line calling out a single word, a ribbon of warm golden-green light streaking across the battlefield to the fighter, who begins to stir.
        - close view of a druid's hands releasing a swirling ball of mist that is rapidly expanding, wisps curling between the fingers, the forest behind already blurring into white.
        """;

    public static string MotifUser(SpellMotifInput input)
    {
        var card = input.Card;
        var lines = new List<string>
        {
            $"Spell: {input.NameEn} (German: {SpellCards.WithoutBreakPoints(card.Name)}), {(input.Level == 0 ? "cantrip" : $"level {input.Level}")}, {input.School.ToString().ToLowerInvariant()}",
            $"Classes: {(input.Classes.Count == 0 ? "none listed" : string.Join(", ", input.Classes))}",
            $"Casting time: {card.CastingTime} · Range: {card.Range} · Duration: {card.Duration}",
        };
        if (card.Material.Length > 0)
        {
            lines.Add($"Material: {card.Material}");
        }

        lines.Add("");
        lines.Add("Rules text:");
        lines.Add(card.Description);
        lines.AddRange(card.Effects.Select(e => $"- {e.Title}{(e.Tag is null ? "" : $" ({e.Tag})")}: {e.Text}"));
        foreach (var table in card.Tables)
        {
            if (table.Caption.Length > 0)
            {
                lines.Add(table.Caption);
            }

            lines.AddRange(table.Rows.Select(r => $"- {string.Join(" ", new[] { r.Key, r.Title }.Where(p => p.Length > 0))}: {r.Text.Replace('\n', ' ')}"));
        }

        if (card.HigherLevels.Length > 0)
        {
            lines.Add($"Higher levels: {card.HigherLevels}");
        }

        lines.Add("");
        lines.Add(input.Motifs.Count == 0
            ? "The card has no subjects yet."
            : $"Subjects the card already has:\n{string.Join('\n', input.Motifs.Select(m => $"- {m}"))}");
        if (input.Notes.Count > 0)
        {
            lines.Add("");
            lines.Add($"The author's notes on the card's art (may be German):\n{string.Join('\n', input.Notes.Select(n => $"- {n}"))}");
        }

        return string.Join('\n', lines);
    }

    public static readonly JsonObject MotifSchema = (JsonObject)JsonNode.Parse(
        """
        {
          "type": "object",
          "properties": { "subject": { "type": "string" } },
          "required": ["subject"],
          "additionalProperties": false
        }
        """)!;

    public static JsonObject PhotoSchema() => new()
    {
        ["type"] = "object",
        ["properties"] = new JsonObject { ["spells"] = new JsonObject { ["type"] = "array", ["items"] = CardSchema() } },
        ["required"] = new JsonArray("spells"),
        ["additionalProperties"] = false,
    };
}
