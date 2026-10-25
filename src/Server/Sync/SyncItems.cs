using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Bestiary;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Sync;

// Reads items the way devices get them: the pushed fields exactly as stored, so a device
// that pushed an item and lost the answer sees its own data in the conflict that follows
// and takes it as saved (knowledge/decisions/offline-prep-pwa.md, "Push").
internal static class SyncItems
{
    // The items of the campaign with these ids, whatever their kind; unknown ids and ids
    // of other campaigns are left out.
    public static async Task<List<SyncServerItem>> LoadAsync(
        AppDbContext db, Guid campaignId, IReadOnlyCollection<Guid> ids, CancellationToken cancellationToken)
    {
        var types = await db.CreatureTypes.AsNoTracking()
            .Where(t => t.CampaignId == campaignId && ids.Contains(t.Id))
            .ToListAsync(cancellationToken);
        var maps = await db.BattleMaps.AsNoTracking()
            .Where(m => m.CampaignId == campaignId && ids.Contains(m.Id))
            .ToListAsync(cancellationToken);
        var encounters = await db.Encounters.AsNoTracking()
            .Where(e => e.CampaignId == campaignId && ids.Contains(e.Id))
            .Include(e => e.Tokens.Where(t => t.Kind == TokenKind.Creature)).ThenInclude(t => t.CreatureType)
            .ToListAsync(cancellationToken);

        var userIds = types.Select(t => t.UpdatedByUserId)
            .Concat(maps.Select(m => m.UpdatedByUserId))
            .Concat(encounters.Select(e => e.UpdatedByUserId))
            .OfType<Guid>()
            .Distinct()
            .ToList();
        var names = await db.Users
            .Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => u.DisplayName, cancellationToken);
        string? NameOf(Guid? userId) => userId is { } id && names.TryGetValue(id, out var name) ? name : null;

        return
        [
            .. types.Select(t => ToItem(t, NameOf(t.UpdatedByUserId))),
            .. maps.Select(m => ToItem(m, NameOf(m.UpdatedByUserId))),
            .. encounters.Select(e => ToItem(e, NameOf(e.UpdatedByUserId))),
        ];
    }

    public static async Task<SyncServerItem?> LoadOneAsync(
        AppDbContext db, Guid campaignId, Guid id, CancellationToken cancellationToken) =>
        (await LoadAsync(db, campaignId, [id], cancellationToken)).SingleOrDefault();

    public static SyncServerItem ToItem(CreatureType type, string? updatedBy) => new(
        type.Id,
        SyncItemKind.CreatureType,
        type.CampaignId,
        type.Version,
        type.UpdatedAt,
        updatedBy,
        null,
        new SyncCreatureTypeData(
            type.Name, type.Size, type.Appearance, type.Notes, type.ArchivedAt, type.InitiativeModifier, type.InitiativeAdvantage),
        null,
        null);

    public static SyncServerItem ToItem(BattleMap map, string? updatedBy) => new(
        map.Id,
        SyncItemKind.BattleMap,
        map.CampaignId,
        map.Version,
        map.UpdatedAt,
        updatedBy,
        null,
        null,
        new SyncMapData(
            map.Name, map.Width, map.Height, map.Layout, map.Scene, map.Vibe, map.Lighting, map.ArchivedAt, map.CopiedFromMapId,
            map.BackgroundPlacement, map.GridStyle),
        null);

    // Creature tokens only: character tokens exist once the encounter has started, and a
    // started encounter belongs to the server. The order is the order they were pushed in.
    public static SyncServerItem ToItem(Encounter encounter, string? updatedBy) => new(
        encounter.Id,
        SyncItemKind.Encounter,
        encounter.CampaignId,
        encounter.Version,
        encounter.UpdatedAt,
        updatedBy,
        null,
        null,
        null,
        new SyncEncounterServerData(
            encounter.Name,
            encounter.BattleMapId,
            encounter.Status,
            encounter.ArchivedAt,
            [
                .. encounter.Tokens
                    .Where(t => t.Kind == TokenKind.Creature)
                    .OrderBy(t => t.CreatedAt)
                    .ThenBy(t => t.Id)
                    .Select(t => new SyncCreatureToken(
                        t.Id,
                        t.CreatureTypeId!.Value,
                        CreatureLabels.Display(t.CreatureType!.Name, t.Number, t.Label),
                        t.X,
                        t.Y,
                        t.Size,
                        t.Hidden,
                        t.InitiativeModifier,
                        t.InitiativeAdvantage)),
            ],
            encounter.SessionId,
            encounter.MapCopy,
            encounter.Fog));
}
