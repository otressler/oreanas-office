using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Statuses;

// Status lists (knowledge/features/statuses.md, "Status lists"): one per character and one
// per `dm` member of a campaign, made with all 15 conditions the first time they're read.
public static class StatusLists
{
    private const int SaveAttempts = 3;

    // The id of a character's list (characterId set) or a DM's own (userId set), made now if
    // it doesn't exist yet. Two first reads at once: the unique index lets one in and the
    // other reads that one. Call it before tracking anything else: a lost race clears the
    // change tracker.
    public static async Task<Guid> EnsureAsync(
        AppDbContext db, Guid campaignId, Guid? characterId, Guid? userId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            var lists = characterId is { } character
                ? db.StatusLists.Where(l => l.CharacterId == character)
                : db.StatusLists.Where(l => l.CampaignId == campaignId && l.UserId == userId && l.CharacterId == null);
            if (await lists.Select(l => (Guid?)l.Id).SingleOrDefaultAsync(cancellationToken) is { } existing)
            {
                return existing;
            }

            var list = new StatusList
            {
                Id = Guid.NewGuid(),
                CampaignId = campaignId,
                CharacterId = characterId,
                UserId = characterId is null ? userId : null,
                CreatedAt = now,
                Entries = [.. StatusLibrary.Conditions.Select((condition, index) => new StatusListEntry { StatusId = condition.Id, Position = index })],
            };
            db.StatusLists.Add(list);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
                return list.Id;
            }
            catch (DbUpdateException ex) when (UniqueIndex.IsViolation(ex) && attempt < SaveAttempts)
            {
                db.ChangeTracker.Clear();
            }
        }
    }

    // Each list's statuses in its owner's order.
    public static async Task<Dictionary<Guid, List<StatusDefinitionView>>> StatusesAsync(
        AppDbContext db, IReadOnlyCollection<Guid> listIds, CancellationToken cancellationToken)
    {
        var ids = listIds.Distinct().ToList();
        var rows = await db.StatusListEntries.AsNoTracking()
            .Where(e => ids.Contains(e.StatusListId))
            .OrderBy(e => e.Position)
            .ThenBy(e => e.StatusId)
            .Select(e => new { e.StatusListId, e.Status })
            .ToListAsync(cancellationToken);
        return ids.ToDictionary(
            id => id,
            id => rows.Where(r => r.StatusListId == id).Select(r => StatusViews.ToView(r.Status)).ToList());
    }

    // Replaces the list's statuses with these, in this order. The ids are checked already.
    // Two changes at once: the last one saved wins.
    public static async Task ReplaceAsync(AppDbContext db, Guid listId, IReadOnlyList<Guid> statusIds, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            db.ChangeTracker.Clear();
            var entries = (await db.StatusListEntries.Where(e => e.StatusListId == listId).ToListAsync(cancellationToken))
                .ToDictionary(e => e.StatusId);
            foreach (var gone in entries.Values.Where(e => !statusIds.Contains(e.StatusId)))
            {
                db.StatusListEntries.Remove(gone);
            }

            for (var i = 0; i < statusIds.Count; i++)
            {
                if (entries.TryGetValue(statusIds[i], out var entry))
                {
                    entry.Position = i;
                }
                else
                {
                    db.StatusListEntries.Add(new StatusListEntry { StatusListId = listId, StatusId = statusIds[i], Position = i });
                }
            }

            try
            {
                await db.SaveChangesAsync(cancellationToken);
                return;
            }
            catch (DbUpdateException ex) when ((ex is DbUpdateConcurrencyException || UniqueIndex.IsViolation(ex)) && attempt < SaveAttempts)
            {
            }
        }
    }

    // Adds a status at the end of the list (tracked; the caller saves).
    public static async Task AppendAsync(AppDbContext db, Guid listId, Guid statusId, CancellationToken cancellationToken)
    {
        var last = await db.StatusListEntries.Where(e => e.StatusListId == listId).MaxAsync(e => (int?)e.Position, cancellationToken);
        db.StatusListEntries.Add(new StatusListEntry { StatusListId = listId, StatusId = statusId, Position = (last ?? -1) + 1 });
    }
}

// Who may generate and pick a custom status's icon (knowledge/features/statuses.md, "Custom
// statuses"): whoever may edit the character it was made for (its owner and `dm` members),
// or any `dm` member for one made in a DM status list.
public static class StatusIcons
{
    // The campaign's custom status (null for a library status or another campaign's), and
    // whether the user may change its icon.
    public static async Task<(StatusDefinition? Status, bool Allowed)> AccessAsync(
        AppDbContext db, Guid campaignId, Guid statusId, Guid userId, CancellationToken cancellationToken)
    {
        var status = await db.StatusDefinitions.AsNoTracking()
            .SingleOrDefaultAsync(s => s.Id == statusId && s.CampaignId == campaignId, cancellationToken);
        if (status is null)
        {
            return (null, false);
        }

        var role = await db.CampaignMembers
            .Where(m => m.CampaignId == campaignId && m.UserId == userId)
            .Select(m => (CampaignRole?)m.Role)
            .SingleOrDefaultAsync(cancellationToken);
        var allowed = role == CampaignRole.Dm
            || (role is not null
                && status.CharacterId is { } characterId
                && await db.Characters.AnyAsync(c => c.Id == characterId && c.OwnerUserId == userId, cancellationToken));
        return (status, allowed);
    }
}
