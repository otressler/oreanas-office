using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Spells;

namespace OreanasOffice.Server.Rules;

// Copies handbook.json into the database once per version (knowledge/rules/handbook-classes.md):
// the classes and subclasses, a Spell row per Handbook spell (matched by English name, so
// existing spells keep their id and variants) and every spell list entry. Spells that aren't
// in the Handbook stay with their variants but leave the library (InHandbook false). Runs after
// the migrations, under a lock, so several apps starting on one database copy it once.
public static class HandbookSync
{
    public const string Key = "handbook";

    public static async Task SyncAsync(AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var hash = Handbook.Hash;
        if (await IsCurrentAsync(db, hash, cancellationToken))
        {
            return;
        }

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            await db.Database.ExecuteSqlAsync(
                $"EXEC sp_getapplock @Resource = 'reference-data:handbook', @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 60000",
                cancellationToken);
            if (await IsCurrentAsync(db, hash, cancellationToken))
            {
                return;
            }

            await CopyAsync(db, Handbook.Data, time.GetUtcNow(), cancellationToken);
            var version = await db.ReferenceDataVersions.SingleOrDefaultAsync(v => v.Key == Key, cancellationToken);
            if (version is null)
            {
                db.ReferenceDataVersions.Add(new ReferenceDataVersion { Key = Key, Hash = hash, UpdatedAt = time.GetUtcNow() });
            }
            else
            {
                version.Hash = hash;
                version.UpdatedAt = time.GetUtcNow();
            }

            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
        });
        db.ChangeTracker.Clear();
    }

    private static Task<bool> IsCurrentAsync(AppDbContext db, string hash, CancellationToken cancellationToken) =>
        db.ReferenceDataVersions.AnyAsync(v => v.Key == Key && v.Hash == hash, cancellationToken);

    private static async Task CopyAsync(AppDbContext db, HandbookData data, DateTimeOffset now, CancellationToken cancellationToken)
    {
        // Classes first: subclasses point at them, also as a spell list (SpellListClassId).
        var classes = await db.CharacterClasses.ToDictionaryAsync(c => c.Id, cancellationToken);
        foreach (var (entry, position) in data.Classes.Select((c, i) => (c, i)))
        {
            if (!classes.TryGetValue(entry.Id, out var row))
            {
                row = new CharacterClass { Id = entry.Id, NameEn = entry.NameEn, NameDe = entry.NameDe };
                db.CharacterClasses.Add(row);
            }

            row.NameEn = entry.NameEn;
            row.NameDe = entry.NameDe;
            row.Caster = entry.Caster;
            row.Position = position;
        }

        await db.SaveChangesAsync(cancellationToken);

        var subclasses = await db.CharacterSubclasses.ToDictionaryAsync(s => s.Id, cancellationToken);
        foreach (var entry in data.Classes)
        {
            foreach (var (sub, position) in entry.Subclasses.Select((s, i) => (s, i)))
            {
                if (!subclasses.TryGetValue(sub.Id, out var row))
                {
                    row = new CharacterSubclass { Id = sub.Id, ClassId = entry.Id, NameEn = sub.NameEn, NameDe = sub.NameDe };
                    db.CharacterSubclasses.Add(row);
                }

                row.ClassId = entry.Id;
                row.NameEn = sub.NameEn;
                row.NameDe = sub.NameDe;
                row.SpellListClassId = sub.SpellListClass;
                row.Position = position;
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        var spells = await db.Spells.ToDictionaryAsync(s => s.NameKey, cancellationToken);
        var handbookKeys = new HashSet<string>();
        foreach (var entry in data.Spells)
        {
            var key = Spell.KeyOf(entry.NameEn);
            handbookKeys.Add(key);
            if (!spells.TryGetValue(key, out var row))
            {
                row = new Spell { Id = Guid.NewGuid(), NameEn = entry.NameEn, NameKey = key, CreatedAt = now };
                db.Spells.Add(row);
                spells[key] = row;
            }

            row.NameEn = entry.NameEn;
            row.NameDe = entry.NameDe;
            row.Slug = entry.Slug;
            row.Level = entry.Level;
            row.School = entry.School;
            row.InHandbook = true;
        }

        foreach (var (key, row) in spells)
        {
            if (!handbookKeys.Contains(key))
            {
                row.InHandbook = false;
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        // The lists are rewritten whole: nothing points at their rows.
        await db.SpellListEntries.ExecuteDeleteAsync(cancellationToken);
        foreach (var entry in data.Spells)
        {
            var spellId = spells[Spell.KeyOf(entry.NameEn)].Id;
            db.SpellListEntries.AddRange(entry.Classes.Select(classId => new SpellListEntry { SpellId = spellId, ClassId = classId }));
        }

        foreach (var entry in data.Classes)
        {
            foreach (var sub in entry.Subclasses)
            {
                // A spell a subclass grants twice (Circle of the Land's lands) counts from the lowest level.
                var granted = (sub.Spells ?? [])
                    .SelectMany(level => level.Value.Select(name => (Key: Spell.KeyOf(name), Level: level.Key)))
                    .GroupBy(g => g.Key)
                    .Select(g => (g.Key, Level: g.Min(x => x.Level)));
                db.SpellListEntries.AddRange(granted.Select(g => new SpellListEntry
                {
                    SpellId = spells[g.Key].Id,
                    ClassId = entry.Id,
                    SubclassId = sub.Id,
                    ClassLevel = g.Level,
                }));
            }
        }

        await db.SaveChangesAsync(cancellationToken);
    }
}
