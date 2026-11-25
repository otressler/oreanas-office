using System.Text.Json;
using System.Text.RegularExpressions;

namespace OreanasOffice.Server.Spells;

// The revision pass's check (knowledge/features/spell-cards.md, "Planned", step 4): from the
// model's card only the name, the description, the effects' texts, the tables' caption, titles
// and texts and the status fields are taken; everything else stays the card's own. Each of those
// texts must keep its words: with markup and spacing taken out it must read as before.
public static partial class SpellCardRevise
{
    // The card in the new form and null, or the old card and the first field whose words changed.
    public static (SpellCard Card, string? Changed) Merge(SpellCard old, SpellCard proposed)
    {
        var name = SpellCards.BreakPoints(proposed.Name);
        if (Words(name) != Words(old.Name))
        {
            return (old, "card.name");
        }

        if (Words(proposed.Description) != Words(old.Description))
        {
            return (old, "card.description");
        }

        // A model that changed the rows' number keeps the card's own rows.
        var effects = old.Effects;
        if (proposed.Effects.Count == old.Effects.Count)
        {
            for (var i = 0; i < effects.Count; i++)
            {
                if (Words(proposed.Effects[i].Text) != Words(old.Effects[i].Text))
                {
                    return (old, $"card.effects[{i}]");
                }
            }

            effects = [.. old.Effects.Select((e, i) => e with { Text = proposed.Effects[i].Text })];
        }

        var tables = old.Tables;
        if (proposed.Tables.Count == old.Tables.Count
            && proposed.Tables.Select(t => t.Rows.Count).SequenceEqual(old.Tables.Select(t => t.Rows.Count)))
        {
            for (var i = 0; i < tables.Count; i++)
            {
                if (Words(proposed.Tables[i].Caption) != Words(old.Tables[i].Caption))
                {
                    return (old, $"card.tables[{i}]");
                }

                for (var j = 0; j < tables[i].Rows.Count; j++)
                {
                    var (before, after) = (old.Tables[i].Rows[j], proposed.Tables[i].Rows[j]);
                    if (Words(after.Title) != Words(before.Title) || Words(after.Text) != Words(before.Text))
                    {
                        return (old, $"card.tables[{i}].rows[{j}]");
                    }
                }
            }

            tables = [.. old.Tables.Select((t, i) => t with
            {
                Caption = proposed.Tables[i].Caption,
                Rows = [.. t.Rows.Select((r, j) => r with { Title = proposed.Tables[i].Rows[j].Title, Text = proposed.Tables[i].Rows[j].Text })],
            })];
        }

        return (old with
        {
            Name = name,
            Description = proposed.Description,
            Effects = effects,
            Tables = tables,
            OfferStatus = proposed.OfferStatus,
            Statuses = proposed.Statuses,
        }, null);
    }

    // Whether two cards are the same as saved.
    public static bool Same(SpellCard a, SpellCard b) =>
        JsonSerializer.Serialize(a, SpellConfiguration.CardJson) == JsonSerializer.Serialize(b, SpellConfiguration.CardJson);

    // The words of a text: glossary marks as the words they show, without bold, italics, list
    // dashes at a line's start, break points and any spacing.
    public static string Words(string? text)
    {
        var words = Mark().Replace(text ?? "", "$1");
        words = ListDash().Replace(words, "");
        words = words
            .Replace(SpellCards.SoftHyphen.ToString(), "", StringComparison.Ordinal)
            .Replace("|", "", StringComparison.Ordinal)
            .Replace("*", "", StringComparison.Ordinal);
        return Spacing().Replace(words, "");
    }

    [GeneratedRegex(@"\[\[([^\]|]+?)(?:\|[^\]]+?)?\]\]")]
    private static partial Regex Mark();

    [GeneratedRegex(@"(?m)^[ \t]*-[ \t]+")]
    private static partial Regex ListDash();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spacing();
}
