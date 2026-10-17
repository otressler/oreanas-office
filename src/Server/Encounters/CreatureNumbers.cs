using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Encounters;

// Creature numbers at first sight (knowledge/features/fog-of-war.md, "Creature numbers"):
// a creature gets Token.Number the first time it becomes visible to players, the next one
// after the highest number of its type in the encounter. Numbers are never reused, so
// removed tokens count. Renamed creatures (Token.Label set) take none. Callers set the
// numbers in the same save that makes the creatures visible.
public static class CreatureNumbers
{
    // A creature that still needs a number when it becomes visible.
    public record Candidate(Guid Id, Guid TypeId, DateTimeOffset CreatedAt);

    // The numbers for the candidates: per type the next number after `highest`, in
    // placement order (CreatedAt, then Id). `highest` holds a type's highest number so far.
    public static Dictionary<Guid, int> Assign(IReadOnlyDictionary<Guid, int> highest, IEnumerable<Candidate> candidates)
    {
        var next = highest.ToDictionary(h => h.Key, h => h.Value);
        var numbers = new Dictionary<Guid, int>();
        foreach (var candidate in candidates.OrderBy(c => c.CreatedAt).ThenBy(c => c.Id))
        {
            next[candidate.TypeId] = next.GetValueOrDefault(candidate.TypeId) + 1;
            numbers[candidate.Id] = next[candidate.TypeId];
        }

        return numbers;
    }

    // Whether the creature may still be numbered: unnumbered and not renamed.
    public static bool Needs(Token token) =>
        token.Kind == TokenKind.Creature && token.Number is null && string.IsNullOrEmpty(token.Label);

    // Numbers the tokens that need it (tracked, saved by the caller) after the highest
    // number of each type in the encounter, removed tokens included. Returns the numbered ones.
    public static async Task<List<Token>> NumberAsync(AppDbContext db, Guid encounterId, IEnumerable<Token> becomingVisible)
    {
        var candidates = becomingVisible.Where(Needs).ToList();
        if (candidates.Count == 0)
        {
            return [];
        }

        var typeIds = candidates.Select(t => t.CreatureTypeId!.Value).Distinct().ToList();
        var highest = await db.Tokens
            .Where(t => t.EncounterId == encounterId && t.Number != null && typeIds.Contains(t.CreatureTypeId!.Value))
            .GroupBy(t => t.CreatureTypeId!.Value)
            .Select(g => new { TypeId = g.Key, Max = g.Max(t => t.Number!.Value) })
            .ToDictionaryAsync(g => g.TypeId, g => g.Max);
        var numbers = Assign(highest, candidates.Select(t => new Candidate(t.Id, t.CreatureTypeId!.Value, t.CreatedAt)));
        foreach (var token in candidates)
        {
            token.Number = numbers[token.Id];
        }

        return candidates;
    }

    // A creature just moved (tracked, at its new cell; not saved yet): if that made it
    // visible to players for the first time, it gets its number in the move's save.
    public static async Task OnMovedAsync(AppDbContext db, Token token, int fromX, int fromY)
    {
        if (!Needs(token))
        {
            return;
        }

        var fog = FogCells.Set(await db.Encounters.Where(e => e.Id == token.EncounterId).Select(e => e.Fog).SingleAsync());
        if (!TableVisibility.TokenVisible(fog, token.Kind, token.Hidden, token.Size, fromX, fromY)
            && TableVisibility.TokenVisible(fog, token.Kind, token.Hidden, token.Size, token.X, token.Y))
        {
            await NumberAsync(db, token.EncounterId, [token]);
        }
    }

    // A fight starts with fog (knowledge/features/fog-of-war.md, "Creature numbers"): nobody
    // has seen anything yet, so numbers go to the creatures players see at the start, in
    // placement order, and the others lose theirs. Without fog nothing changes.
    public static void NumberAtStart(IEnumerable<Token> creatures, FogDocument? fog)
    {
        if (fog is null)
        {
            return;
        }

        var hidden = FogCells.Set(fog);
        var all = creatures.Where(t => t.Kind == TokenKind.Creature).ToList();
        foreach (var creature in all)
        {
            creature.Number = null;
        }

        var visible = all.Where(t => Needs(t) && TableVisibility.TokenVisible(hidden, t.Kind, t.Hidden, t.Size, t.X, t.Y)).ToList();
        var numbers = Assign(new Dictionary<Guid, int>(), visible.Select(t => new Candidate(t.Id, t.CreatureTypeId!.Value, t.CreatedAt)));
        foreach (var creature in visible)
        {
            creature.Number = numbers[creature.Id];
        }
    }
}
