using System.Security.Cryptography;

namespace OreanasOffice.Server.Encounters;

// knowledge/features/initiative.md: the encounter's initiative list, a tool the session DM
// switches on per fight. Entries are in turn order, and the order is the DM's: the app
// sorts only the setup screen's result and slots in creatures spawned later. Entries of
// tokens taken off the board stay, so a token brought back returns to its place.
public record InitiativeDocument(List<InitiativeEntry> Entries);

// Value: the initiative count; null for a character whose player hasn't said it yet.
// Modifier and Advantage: what a creature rolled with (0 and false for characters). Rolls:
// the d20s behind Value, two with advantage (the higher counts); empty for a typed value.
public record InitiativeEntry(Guid TokenId, int? Value, int Modifier, bool Advantage, List<int> Rolls);

public static class InitiativeRules
{
    public const int ModifierMin = -10;
    public const int ModifierMax = 20;
    public const int ValueMin = -20;
    public const int ValueMax = 99;

    // More than any board holds; keeps a request from growing the document without bound.
    public const int MaxEntries = 500;

    // One roll: a d20, or two with advantage, plus the modifier.
    public static InitiativeEntry Roll(Guid tokenId, int modifier, bool advantage, Func<int> d20)
    {
        List<int> rolls = advantage ? [d20(), d20()] : [d20()];
        return new InitiativeEntry(tokenId, rolls.Max() + modifier, modifier, advantage, rolls);
    }

    public static int RollD20() => RandomNumberGenerator.GetInt32(1, 21);

    // A creature that joins a running list goes before the first entry with a lower value
    // or none, so it follows those it ties with.
    public static List<InitiativeEntry> Insert(IReadOnlyList<InitiativeEntry> entries, InitiativeEntry entry)
    {
        var index = 0;
        while (index < entries.Count && entries[index].Value is { } value && value >= entry.Value)
        {
            index++;
        }

        return [.. entries.Take(index), entry, .. entries.Skip(index)];
    }

    // Whether a saved list is well-formed: each token of the encounter at most once, values,
    // modifiers and d20s in range, and at most two d20s, as many as advantage gives.
    public static bool IsValid(IReadOnlyList<InitiativeEntry?> entries, IReadOnlySet<Guid> encounterTokenIds)
    {
        if (entries.Count > MaxEntries)
        {
            return false;
        }

        var seen = new HashSet<Guid>();
        foreach (var entry in entries)
        {
            if (entry is null
                || !encounterTokenIds.Contains(entry.TokenId)
                || !seen.Add(entry.TokenId)
                || entry.Value is < ValueMin or > ValueMax
                || entry.Modifier is < ModifierMin or > ModifierMax)
            {
                return false;
            }

            var rolls = entry.Rolls ?? [];
            if (rolls.Count > (entry.Advantage ? 2 : 1) || rolls.Any(roll => roll is < 1 or > 20))
            {
                return false;
            }
        }

        return true;
    }
}
