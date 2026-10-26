using System.Security.Cryptography;

namespace OreanasOffice.Server.Encounters;

// knowledge/features/initiative.md: the encounter's initiative list, a tool the session DM
// switches on per fight. Entries are in turn order, and the order is the DM's: the app
// sorts only the setup screen's result and slots in creatures spawned later. Entries of
// tokens taken off the board stay, so a token brought back returns to its place.
public record InitiativeDocument(List<InitiativeEntry> Entries);

// Value: the initiative count; null for a character whose player hasn't said it yet.
// Modifier and Mode: what a creature rolled with (0 and Normal for characters). Rolls: the
// d20s behind Value, two with advantage (the higher counts) or disadvantage (the lower);
// empty for a typed value.
public record InitiativeEntry(Guid TokenId, int? Value, int Modifier, InitiativeRollMode Mode, List<int> Rolls);

// How a creature rolls initiative: one d20, or two keeping the higher or the lower.
public enum InitiativeRollMode
{
    Normal,
    Advantage,
    Disadvantage,
}

public static class InitiativeRules
{
    public const int ModifierMin = -10;
    public const int ModifierMax = 20;
    public const int ValueMin = -20;
    public const int ValueMax = 99;

    // More than any board holds; keeps a request from growing the document without bound.
    public const int MaxEntries = 500;

    // One roll: a d20, or two with advantage or disadvantage, plus the modifier.
    public static InitiativeEntry Roll(Guid tokenId, int modifier, InitiativeRollMode mode, Func<int> d20)
    {
        List<int> rolls = mode == InitiativeRollMode.Normal ? [d20()] : [d20(), d20()];
        return new InitiativeEntry(tokenId, Counting(rolls, mode) + modifier, modifier, mode, rolls);
    }

    // The d20 that counts: the lower one with disadvantage, else the higher.
    public static int Counting(IReadOnlyList<int> rolls, InitiativeRollMode mode) =>
        mode == InitiativeRollMode.Disadvantage ? rolls.Min() : rolls.Max();

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
    // modifiers and d20s in range, and at most as many d20s as the mode gives.
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
                || !Enum.IsDefined(entry.Mode)
                || entry.Value is < ValueMin or > ValueMax
                || entry.Modifier is < ModifierMin or > ModifierMax)
            {
                return false;
            }

            var rolls = entry.Rolls ?? [];
            if (rolls.Count > (entry.Mode == InitiativeRollMode.Normal ? 1 : 2) || rolls.Any(roll => roll is < 1 or > 20))
            {
                return false;
            }
        }

        return true;
    }
}
