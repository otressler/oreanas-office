using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Statuses;

// How status definitions and token statuses look to the app (StatusDefinitionView,
// BoardTokenStatus), shared by the board, the table hub and the status endpoints.
public static class StatusViews
{
    private static readonly Dictionary<Guid, int> LibraryOrder =
        StatusLibrary.Conditions.Select((condition, index) => (condition.Id, index)).ToDictionary(p => p.Id, p => p.index);

    // Library statuses show their static icon; a custom status its picked version, or none.
    public static StatusDefinitionView ToView(StatusDefinition status) => new(
        status.Id,
        status.LibraryKey,
        status.Name,
        status.HasLevels,
        status.LibraryKey is { } key ? StatusLibrary.IconUrl(key) : status.IconAssetId is { } assetId ? MapBackgrounds.Url(assetId) : null,
        status.IconDescription,
        status.CharacterId);

    // The 15 conditions in library order, then custom statuses by name.
    public static IEnumerable<StatusDefinition> InLibraryOrder(IEnumerable<StatusDefinition> statuses) =>
        statuses
            .OrderBy(s => LibraryOrder.TryGetValue(s.Id, out var index) ? index : int.MaxValue)
            .ThenBy(s => s.Name, StringComparer.CurrentCultureIgnoreCase)
            .ThenBy(s => s.Id);

    // The definitions with these ids, in library order.
    public static async Task<List<StatusDefinitionView>> ForIdsAsync(
        AppDbContext db, IEnumerable<Guid> ids, CancellationToken cancellationToken)
    {
        var wanted = ids.Distinct().ToList();
        if (wanted.Count == 0)
        {
            return [];
        }

        var statuses = await db.StatusDefinitions.AsNoTracking().Where(s => wanted.Contains(s.Id)).ToListAsync(cancellationToken);
        return [.. InLibraryOrder(statuses).Select(ToView)];
    }

    // The statuses on each of the tokens, in the order they were put on.
    public static async Task<ILookup<Guid, BoardTokenStatus>> OnTokensAsync(
        AppDbContext db, IQueryable<Guid> tokenIds, CancellationToken cancellationToken)
    {
        var rows = await db.TokenStatuses.AsNoTracking()
            .Where(s => tokenIds.Contains(s.TokenId))
            .OrderBy(s => s.AppliedAt)
            .ThenBy(s => s.StatusId)
            .Select(s => new { s.TokenId, Status = new BoardTokenStatus(s.StatusId, s.Level, s.AppliedByUserId, s.AppliedAt) })
            .ToListAsync(cancellationToken);
        return rows.ToLookup(r => r.TokenId, r => r.Status);
    }
}
