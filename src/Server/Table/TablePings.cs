using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Table;

// Pings and arrows (knowledge/features/pings-and-arrows.md): checked against the database
// in one query, never saved. The hub sends what these return to the others in the
// encounter, with the colour the server sets, so a device can't ping as someone else.
public sealed class TablePings(AppDbContext db)
{
    // Checks in this order: the encounter exists and the caller is a member of its campaign
    // (TokenNotFound), it is active (EncounterNotActive), exactly one of Cell and TokenId,
    // a cell inside the map (TargetInvalid), a token on its board, not removed (TokenNotFound).
    // `mode` is the connection's: a shared screen in local mode pings in white (it is "Tisch",
    // not the signed-in person); a spectator screen, or a shared screen outside local mode,
    // gets ReadOnlyConnection after the membership and active checks.
    public async Task<(ApiErrorCode? Error, PingedEvent? Ping)> PingAsync(
        Guid userId, PingRequest? request, ConnectionMode mode = ConnectionMode.Player)
    {
        if (request is null)
        {
            return (ApiErrorCode.TokenNotFound, null);
        }

        var (error, color, shared) = await CheckAsync(userId, mode, request.EncounterId, request.TokenId, (request.Cell is null) == (request.TokenId is null), [request.Cell]);
        return error is null
            ? (null, new PingedEvent(request.EncounterId, userId, color!, request.Cell, request.TokenId, shared))
            : (error, null);
    }

    // As PingAsync, for the arrow's start (FromCell or FromTokenId) and its end (To).
    public async Task<(ApiErrorCode? Error, ArrowDrawnEvent? Arrow)> ArrowAsync(
        Guid userId, DrawArrowRequest? request, ConnectionMode mode = ConnectionMode.Player)
    {
        if (request is null)
        {
            return (ApiErrorCode.TokenNotFound, null);
        }

        var malformed = (request.FromCell is null) == (request.FromTokenId is null) || request.To is null;
        var (error, color, shared) = await CheckAsync(userId, mode, request.EncounterId, request.FromTokenId, malformed, [request.FromCell, request.To]);
        return error is null
            ? (null, new ArrowDrawnEvent(request.EncounterId, userId, color!, request.FromCell, request.FromTokenId, request.To!, shared))
            : (error, null);
    }

    private async Task<(ApiErrorCode? Error, string? Color, bool FromSharedScreen)> CheckAsync(
        Guid userId, ConnectionMode mode, Guid encounterId, Guid? tokenId, bool malformed, BoardCell?[] cells)
    {
        var found = await db.Encounters.AsNoTracking()
            .Where(e => e.Id == encounterId)
            .Select(e => new
            {
                IsMember = db.CampaignMembers.Any(m => m.CampaignId == e.CampaignId && m.UserId == userId),
                e.Status,
                SessionDmUserId = (Guid?)e.Session.DmUserId,
                e.Session.PlayMode,
                e.MapCopy,
                e.BattleMap.Width,
                e.BattleMap.Height,
                TokenOnBoard = tokenId != null && e.Tokens.Any(t => t.Id == tokenId && t.RemovedAt == null),
                // In the order characters were added to the campaign, for their ring colours.
                Characters = db.Characters
                    .Where(c => c.CampaignId == e.CampaignId)
                    .OrderBy(c => c.CreatedAt)
                    .ThenBy(c => c.Id)
                    // Who plays the character in this session (CharacterPlayers).
                    .Select(c => new
                    {
                        OwnerUserId = c.SessionPlayers.Where(p => p.SessionId == e.SessionId).Select(p => (Guid?)p.UserId).FirstOrDefault()
                            ?? c.OwnerUserId,
                        c.Color,
                        InFight = e.Tokens.Any(t => t.CharacterId == c.Id),
                    })
                    .ToList(),
            })
            .SingleOrDefaultAsync();
        if (found is null || !found.IsMember)
        {
            return (ApiErrorCode.TokenNotFound, null, false);
        }

        if (found.Status != EncounterStatus.Active)
        {
            return (ApiErrorCode.EncounterNotActive, null, false);
        }

        var effective = TablePermissions.Effective(mode, found.PlayMode);
        if (!TablePermissions.MayPoint(effective))
        {
            return (ApiErrorCode.ReadOnlyConnection, null, false);
        }

        // The fight's map as it was at the start.
        var (width, height) = found.MapCopy is { } copy ? (copy.Width, copy.Height) : (found.Width, found.Height);
        if (malformed || cells.Any(cell => cell is not null && (cell.X < 0 || cell.Y < 0 || cell.X >= width || cell.Y >= height)))
        {
            return (ApiErrorCode.TargetInvalid, null, false);
        }

        if (tokenId is not null && !found.TokenOnBoard)
        {
            return (ApiErrorCode.TokenNotFound, null, false);
        }

        if (effective == ConnectionMode.SharedScreen)
        {
            return (null, TablePeople.NoCharacterColor, true);
        }

        var characters = found.Characters
            .Select((c, index) => (c.InFight, Character: new TablePeople.FightCharacter(c.OwnerUserId, index, c.Color)))
            .Where(c => c.InFight)
            .Select(c => c.Character);
        return (null, TablePeople.PingColor(userId, found.SessionDmUserId, characters), false);
    }
}

// At most MaxPerWindow pings and arrows per person and encounter in any Window
// (knowledge/features/pings-and-arrows.md, "Rate limit"). In memory only: after a restart
// nobody has pinged yet anyway. Calls over the limit are dropped and don't count.
public sealed class TablePingLimiter(TimeProvider time)
{
    public const int MaxPerWindow = 3;

    public static readonly TimeSpan Window = TimeSpan.FromSeconds(2);

    // Above this many people and encounters, the ones quiet for a whole window are let go.
    private const int PruneAbove = 1000;

    private readonly ConcurrentDictionary<(Guid UserId, Guid EncounterId), Queue<DateTimeOffset>> _recent = new();

    // True when the ping or arrow may go out now; it then counts.
    public bool TryTake(Guid userId, Guid encounterId)
    {
        var now = time.GetUtcNow();
        if (_recent.Count > PruneAbove)
        {
            Prune(now);
        }

        var recent = _recent.GetOrAdd((userId, encounterId), _ => new Queue<DateTimeOffset>());
        lock (recent)
        {
            while (recent.TryPeek(out var oldest) && now - oldest >= Window)
            {
                recent.Dequeue();
            }

            if (recent.Count >= MaxPerWindow)
            {
                return false;
            }

            recent.Enqueue(now);
            return true;
        }
    }

    private void Prune(DateTimeOffset now)
    {
        foreach (var entry in _recent)
        {
            bool quiet;
            lock (entry.Value)
            {
                quiet = !entry.Value.TryPeek(out _) || now - entry.Value.Last() >= Window;
            }

            if (quiet)
            {
                _recent.TryRemove(entry);
            }
        }
    }
}
