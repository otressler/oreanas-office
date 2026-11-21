using OreanasOffice.Server.Api;

namespace OreanasOffice.Server.Spells;

// The limits of a card (knowledge/domain/spell.md, "The card") and its icon names, which
// must match src/web/src/spells/icons.ts. Validate trims every text and returns the card
// as it is saved, or the first field that breaks a rule as SpellInvalid.
public static class SpellCards
{
    public const int NameMax = 60;
    public const int StatMax = 40;
    public const int DescriptionMax = 1500;
    public const int EffectsMax = 6;
    public const int EffectTitleMax = 30;
    public const int EffectTagMax = 24;
    public const int EffectTextMax = 200;
    public const int ChipBigMax = 12;
    public const int ChipSmallMax = 14;
    public const int PipsMax = 2;
    public const int HigherLevelsMax = 300;
    public const int TipMax = 200;
    public const int MaterialMax = 120;
    public const int SourceMax = 60;

    public static readonly IReadOnlySet<string> Icons = new HashSet<string>(StringComparer.Ordinal)
    {
        "hourglass", "range", "spark", "clock", "shard", "burst", "snow", "up", "leaf", "flame", "drop",
        "skull", "star", "thunder", "heart", "shield", "eye", "paw", "chat", "whip", "cloud", "berry",
        "feet", "jump", "needle", "book", "wind", "spiral", "staff", "cube", "bee", "mountain", "pulse",
        "pull", "push", "d20", "bulb", "sun", "heartplus", "bird", "tree", "crown", "trap", "blade",
        "expand", "chain", "compass", "moon", "spikes", "turtle",
    };

    public static (SpellCard? Card, ApiError? Error) Validate(SpellCard? card)
    {
        if (card is null)
        {
            return Fail("card");
        }

        var name = Clean(card.Name);
        if (name.Length is 0 or > NameMax)
        {
            return Fail("card.name");
        }

        string? Text(string? value, int max, string field, ref string? error)
        {
            var text = Clean(value);
            if (text.Length > max)
            {
                error ??= field;
            }

            return text;
        }

        string? bad = null;
        var castingTime = Text(card.CastingTime, StatMax, "card.castingTime", ref bad);
        var range = Text(card.Range, StatMax, "card.range", ref bad);
        var components = Text(card.Components, StatMax, "card.components", ref bad);
        var duration = Text(card.Duration, StatMax, "card.duration", ref bad);
        var description = Text(card.Description, DescriptionMax, "card.description", ref bad);
        var higherLevels = Text(card.HigherLevels, HigherLevelsMax, "card.higherLevels", ref bad);
        var tip = Text(card.Tip, TipMax, "card.tip", ref bad);
        var material = Text(card.Material, MaterialMax, "card.material", ref bad);
        var source = Text(card.Source, SourceMax, "card.source", ref bad);
        if (bad is not null)
        {
            return Fail(bad);
        }

        if (!Icons.Contains(card.Icon ?? ""))
        {
            return Fail("card.icon");
        }

        var pips = card.Pips ?? [];
        if (pips.Count > PipsMax || pips.Any(p => !Icons.Contains(p ?? "")))
        {
            return Fail("card.pips");
        }

        var effects = card.Effects ?? [];
        if (effects.Count > EffectsMax)
        {
            return Fail("card.effects");
        }

        var cleanEffects = new List<SpellEffect>(effects.Count);
        for (var i = 0; i < effects.Count; i++)
        {
            var effect = effects[i];
            var field = $"card.effects[{i}]";
            if (effect is null || !Icons.Contains(effect.Icon ?? ""))
            {
                return Fail(field);
            }

            var title = Clean(effect.Title);
            var tag = Clean(effect.Tag);
            var text = Clean(effect.Text);
            if (title.Length is 0 or > EffectTitleMax || tag.Length > EffectTagMax || text.Length > EffectTextMax)
            {
                return Fail(field);
            }

            SpellChip? chip = null;
            if (effect.Chip is { } c)
            {
                var big = Clean(c.Big);
                var small = Clean(c.Small);
                if (big.Length is 0 or > ChipBigMax || small.Length > ChipSmallMax)
                {
                    return Fail(field);
                }

                chip = new SpellChip { Big = big, Small = small.Length > 0 ? small : null, Kind = c.Kind };
            }

            cleanEffects.Add(new SpellEffect
            {
                Icon = effect.Icon!,
                Title = title,
                Tag = tag.Length > 0 ? tag : null,
                Text = text,
                Chip = chip,
            });
        }

        return (new SpellCard
        {
            Name = name,
            CastingTime = castingTime!,
            Range = range!,
            Components = components!,
            Duration = duration!,
            Concentration = card.Concentration,
            Ritual = card.Ritual,
            Description = description!,
            Effects = cleanEffects,
            Icon = card.Icon!,
            Pips = [.. pips],
            HigherLevels = higherLevels!,
            Tip = tip!,
            Material = material!,
            Source = source!,
            WriteIns = [.. (card.WriteIns ?? []).Distinct().Where(Enum.IsDefined)],
        }, null);
    }

    // Trimmed, Windows line ends as \n, at most one blank line in a row.
    private static string Clean(string? value)
    {
        var text = (value ?? "").Replace("\r\n", "\n").Trim();
        while (text.Contains("\n\n\n", StringComparison.Ordinal))
        {
            text = text.Replace("\n\n\n", "\n\n", StringComparison.Ordinal);
        }

        return text;
    }

    private static (SpellCard?, ApiError?) Fail(string field) => (null, new ApiError(ApiErrorCode.SpellInvalid, field));
}
