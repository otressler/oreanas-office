using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Table;

// The initiative list at the table (knowledge/features/initiative.md): the session DM's own
// tool, switched on per fight. It enforces nothing; it is saved on the encounter, so it
// survives reloads, other devices and a continued session, and only the session DM's group
// hears of it. Rolls happen here, so players' devices never learn a creature's modifier.
//
// Only the session DM acts, and only from a player connection (TableFog.LoadAsync checks).
public sealed class TableInitiative(TableFog fog, AppDbContext db)
{
    private const int SaveAttempts = 5;

    // Errors: TokenNotFound, EncounterNotActive, NotSessionDm.
    public async Task<(ApiErrorCode? Error, List<InitiativeEntry>? Entries)> RollAsync(Guid userId, ConnectionMode mode, Guid encounterId)
    {
        var (error, _) = await fog.LoadAsync(userId, mode, encounterId);
        if (error is not null)
        {
            return (error, null);
        }

        // Sorted here, not in SQL, which orders Guids differently.
        var tokens = (await db.Tokens.AsNoTracking()
                .Where(t => t.EncounterId == encounterId && t.RemovedAt == null)
                .Select(t => new
                {
                    t.Id,
                    t.Kind,
                    t.CreatedAt,
                    t.InitiativeModifier,
                    t.InitiativeRollMode,
                    TypeModifier = t.CreatureType != null ? t.CreatureType.InitiativeModifier : 0,
                    TypeMode = t.CreatureType != null ? t.CreatureType.InitiativeRollMode : InitiativeRollMode.Normal,
                })
                .ToListAsync())
            .OrderBy(t => t.Kind == TokenKind.Character ? 0 : 1)
            .ThenBy(t => t.CreatedAt)
            .ThenBy(t => t.Id);
        return (null, [
            .. tokens.Select(t => t.Kind == TokenKind.Character
                ? new InitiativeEntry(t.Id, null, 0, InitiativeRollMode.Normal, [])
                : InitiativeRules.Roll(
                    t.Id, t.InitiativeModifier ?? t.TypeModifier, t.InitiativeRollMode ?? t.TypeMode, InitiativeRules.RollD20)),
        ]);
    }

    // Errors: TokenNotFound, EncounterNotActive, NotSessionDm, InitiativeInvalid (see
    // InitiativeRules.IsValid; tokens taken off the board count as the encounter's).
    public async Task<(ApiErrorCode? Error, InitiativeChangedEvent? Change)> SetAsync(
        Guid userId, ConnectionMode mode, SetInitiativeRequest? request)
    {
        if (request is null)
        {
            return (ApiErrorCode.TokenNotFound, null);
        }

        var entries = request.Entries ?? [];
        return await SaveAsync(userId, mode, request.EncounterId, async encounter =>
        {
            var ids = (await db.Tokens.Where(t => t.EncounterId == encounter.Id).Select(t => t.Id).ToListAsync()).ToHashSet();
            if (!InitiativeRules.IsValid(entries, ids))
            {
                return ApiErrorCode.InitiativeInvalid;
            }

            encounter.Initiative = new InitiativeDocument([.. entries.Select(e => e with { Rolls = e.Rolls ?? [] })]);
            return null;
        });
    }

    // Errors: TokenNotFound, EncounterNotActive, NotSessionDm. Clearing a list that is off
    // still succeeds.
    public Task<(ApiErrorCode? Error, InitiativeChangedEvent? Change)> ClearAsync(Guid userId, ConnectionMode mode, Guid encounterId) =>
        SaveAsync(userId, mode, encounterId, encounter =>
        {
            encounter.Initiative = null;
            return Task.FromResult<ApiErrorCode?>(null);
        });

    // Spawned creatures roll with their type's modifier and roll mode and join a list that is
    // on, each before the first entry with a lower value (TableSpawns, same SaveChanges). The
    // tokens must be new: a spawn has no overrides. Null while initiative is off.
    public static InitiativeChangedEvent? AddSpawned(
        Encounter encounter, IEnumerable<Token> spawned, IReadOnlyDictionary<Guid, (int Modifier, InitiativeRollMode Mode)> types, Func<int> d20)
    {
        if (encounter.Initiative is not { } initiative)
        {
            return null;
        }

        var entries = initiative.Entries;
        foreach (var token in spawned)
        {
            var (modifier, mode) = types[token.CreatureTypeId!.Value];
            entries = InitiativeRules.Insert(entries, InitiativeRules.Roll(token.Id, modifier, mode, d20));
        }

        encounter.Initiative = new InitiativeDocument(entries);
        encounter.InitiativeVersion += 1;
        return Changed(encounter);
    }

    private static InitiativeChangedEvent Changed(Encounter encounter) =>
        new(encounter.Id, new InitiativeView(encounter.InitiativeVersion, encounter.Initiative?.Entries));

    // Loads the fight, applies the change and saves it with InitiativeVersion + 1; a spawn
    // saving at the same moment makes it start over.
    private async Task<(ApiErrorCode? Error, InitiativeChangedEvent? Change)> SaveAsync(
        Guid userId, ConnectionMode mode, Guid encounterId, Func<Encounter, Task<ApiErrorCode?>> change)
    {
        for (var attempt = 1; ; attempt++)
        {
            var (error, fight) = await fog.LoadAsync(userId, mode, encounterId);
            if (error is not null)
            {
                return (error, null);
            }

            var encounter = fight!.Encounter;
            if (await change(encounter) is { } invalid)
            {
                return (invalid, null);
            }

            encounter.InitiativeVersion += 1;
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException) when (attempt < SaveAttempts)
            {
                continue;
            }

            return (null, Changed(encounter));
        }
    }
}
