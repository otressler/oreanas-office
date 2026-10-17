using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Table;

// The live table's rules (knowledge/decisions/realtime-sync.md, domain/token.md): who
// may join and move, where a token may stand, and undo. The hub calls these and
// broadcasts what they return. Every call reads the roles from the database, so a new
// session DM applies at once.
//
// Moves and undos aren't cancelled when the caller's connection drops: a move that
// reached the database must still be broadcast.
public sealed class TableMoves(AppDbContext db, TimeProvider time)
{
    // Token.Version is a concurrency token: a save that lost the race to another move
    // of the same token reads the token again and repeats the checks. Two moves never
    // interleave, and the last one saved wins.
    private const int SaveAttempts = 5;

    // Where the token of the last MoveAsync or UndoAsync stood before it, for the hub's
    // fan-out (TableFanOut.MovedAsync): whether players see it before and after.
    public MovedFrom? LastFrom { get; private set; }

    // Any campaign member, while the encounter is active; or a spectator of its session
    // (knowledge/features/spectator-view.md). SessionDmUserId decides which group the
    // connection joins.
    public async Task<(ApiErrorCode? Error, Guid? SessionDmUserId)> JoinAsync(
        Guid userId, Guid encounterId, CancellationToken cancellationToken)
    {
        var encounter = await db.Encounters
            .Where(e => e.Id == encounterId)
            .Select(e => new
            {
                IsMember = db.CampaignMembers.Any(m => m.CampaignId == e.CampaignId && m.UserId == userId)
                    || db.SessionSpectators.Any(s => s.SessionId == e.SessionId && s.UserId == userId),
                e.Status,
                SessionDmUserId = (Guid?)e.Session.DmUserId,
            })
            .SingleOrDefaultAsync(cancellationToken);
        return encounter switch
        {
            null or { IsMember: false } => (ApiErrorCode.TokenNotFound, null),
            { Status: not EncounterStatus.Active } => (ApiErrorCode.EncounterNotActive, null),
            _ => (null, encounter.SessionDmUserId),
        };
    }

    // Checks in this order: the token exists in a campaign of the caller (TokenNotFound),
    // its encounter is active (EncounterNotActive), it is on the board and not removed
    // (TokenNotFound), the caller may move it (NotYourToken),
    // the footprint stands on walkable cells inside the map (TargetInvalid). Tokens may
    // overlap; there are no distance or turn checks.
    public async Task<MoveResult> MoveAsync(Guid userId, MoveTokenRequest? request)
    {
        if (request is null)
        {
            return new MoveResult(ApiErrorCode.TokenNotFound, null);
        }

        for (var attempt = 1; ; attempt++)
        {
            db.ChangeTracker.Clear();
            var check = await CheckMoveAsync(userId, request);
            if (check.Error is { } error)
            {
                return new MoveResult(error, null);
            }

            var (token, grid, size) = (check.Token!, check.Grid!, check.Size);
            var from = new MovedFrom(token.X, token.Y);

            var move = new TokenMove
            {
                EncounterId = token.EncounterId,
                TokenId = token.Id,
                ByUserId = userId,
                FromX = token.X,
                FromY = token.Y,
                FromElevation = token.Elevation,
                ToX = request.X,
                ToY = request.Y,
                ToElevation = grid.PlacementElevation(size, request.X, request.Y),
                Version = token.Version + 1,
                At = time.GetUtcNow(),
            };
            token.X = move.ToX;
            token.Y = move.ToY;
            token.Elevation = move.ToElevation;
            token.Version = move.Version;
            db.TokenMoves.Add(move);

            // A creature that players see for the first time gets its number in this save.
            await CreatureNumbers.OnMovedAsync(db, token, from.X, from.Y);

            // The token and its history row land in one SaveChanges, so in one transaction.
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException) when (attempt < SaveAttempts)
            {
                continue;
            }

            LastFrom = from;
            return new MoveResult(null, Event(token, userId, undo: false));
        }
    }

    // MoveAsync's checks without saving anything: the preview the others see. The
    // event is null with an error.
    public async Task<(ApiErrorCode? Error, MovePreviewEvent? Preview)> PreviewAsync(Guid userId, MoveTokenRequest? request)
    {
        if (request is null)
        {
            return (ApiErrorCode.TokenNotFound, null);
        }

        var check = await CheckMoveAsync(userId, request);
        return check.Error is { } error
            ? (error, null)
            : (null, new MovePreviewEvent(check.Token!.EncounterId, request.TokenId, request.X, request.Y, userId));
    }

    private async Task<MoveCheck> CheckMoveAsync(Guid userId, MoveTokenRequest request)
    {
        var found = await db.Tokens
            .Where(t => t.Id == request.TokenId)
            .Select(t => new
            {
                Token = t,
                IsMember = db.CampaignMembers.Any(m => m.CampaignId == t.Encounter.CampaignId && m.UserId == userId),
                t.Encounter.Status,
                SessionDmUserId = (Guid?)t.Encounter.Session.DmUserId,
                OwnerUserId = (Guid?)t.Character!.OwnerUserId,
                t.Encounter.MapCopy,
                t.Encounter.BattleMap.Width,
                t.Encounter.BattleMap.Height,
                t.Encounter.BattleMap.Layout,
                t.Encounter.Fog,
            })
            .SingleOrDefaultAsync();
        if (found is null || !found.IsMember)
        {
            return MoveCheck.Failed(ApiErrorCode.TokenNotFound);
        }

        if (found.Status != EncounterStatus.Active)
        {
            return MoveCheck.Failed(ApiErrorCode.EncounterNotActive);
        }

        // A token taken off the board isn't on it (knowledge/features/removing-tokens.md).
        if (found.Token.RemovedAt is not null)
        {
            return MoveCheck.Failed(ApiErrorCode.TokenNotFound);
        }

        if (!MayMove(userId, found.SessionDmUserId, found.Token.Kind, found.OwnerUserId))
        {
            return MoveCheck.Failed(ApiErrorCode.NotYourToken);
        }

        var size = found.Token.Size;
        // The fight uses the map as it was at the start, not the battle map's current state.
        var grid = found.MapCopy is { } copy
            ? new MapGrid(copy.Width, copy.Height, copy.Layout)
            : new MapGrid(found.Width, found.Height, found.Layout);
        if (!MapGrid.FootprintCells(size, request.X, request.Y).All(cell => grid.Walkable(cell.X, cell.Y)))
        {
            return MoveCheck.Failed(ApiErrorCode.TargetInvalid);
        }

        // Players cannot choose a target that touches the fog, moving out of it is fine
        // (knowledge/features/fog-of-war.md, "Moving in and out of the fog"). The answer is
        // the same as for a wall, so a rejected move does not say what the cell holds.
        // TODO(shared table lane): the session DM on a shared screen is a player here; pass
        // the connection's mode and use TablePermissions.ActsAsSessionDm instead of this id check.
        if (userId != found.SessionDmUserId
            && !TableVisibility.FootprintRevealed(FogCells.Set(found.Fog), size, request.X, request.Y))
        {
            return MoveCheck.Failed(ApiErrorCode.TargetInvalid);
        }

        return new MoveCheck(null, found.Token, grid, size);
    }

    // Puts the caller's latest move in the encounter back, while it isn't undone and the
    // token still has the move's version. Only that one move: an undone move stays the
    // caller's latest, so a second undo finds nothing. The session DM undoes only their
    // own moves, as the query only looks at the caller's.
    public async Task<MoveResult> UndoAsync(Guid userId, Guid encounterId)
    {
        for (var attempt = 1; ; attempt++)
        {
            db.ChangeTracker.Clear();
            var encounter = await Encounter(encounterId, userId).SingleOrDefaultAsync();
            if (encounter is null || !encounter.IsMember)
            {
                return new MoveResult(ApiErrorCode.TokenNotFound, null);
            }

            if (encounter.Status != EncounterStatus.Active)
            {
                return new MoveResult(ApiErrorCode.EncounterNotActive, null);
            }

            var latest = await LatestMove(db.TokenMoves, encounterId, userId).FirstOrDefaultAsync();
            if (UndoError(latest, userId, encounter.SessionDmUserId) is { } error)
            {
                return new MoveResult(error, null);
            }

            var (move, token) = (latest!.Move, latest.Token);
            var from = new MovedFrom(token.X, token.Y);
            token.X = move.FromX;
            token.Y = move.FromY;
            token.Elevation = move.FromElevation;
            token.Version++;
            move.UndoneAt = time.GetUtcNow();
            await CreatureNumbers.OnMovedAsync(db, token, from.X, from.Y);

            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException) when (attempt < SaveAttempts)
            {
                continue;
            }

            LastFrom = from;
            return new MoveResult(null, Event(token, userId, undo: true));
        }
    }

    // The board's UndoableMove: the move UndoAsync would put back now, or null. Only
    // asked for an active encounter.
    public static async Task<UndoableMove?> UndoableMoveAsync(
        AppDbContext db, Guid encounterId, Guid userId, Guid? sessionDmUserId, CancellationToken cancellationToken)
    {
        var latest = await LatestMove(db.TokenMoves.AsNoTracking(), encounterId, userId).FirstOrDefaultAsync(cancellationToken);
        return UndoError(latest, userId, sessionDmUserId) is null
            ? new UndoableMove(latest!.Move.TokenId, latest.Move.Version)
            : null;
    }

    // The session DM moves any token; everyone else, other `dm` members and the
    // campaign's default DM included, only characters they own (knowledge/domain/session.md).
    private static bool MayMove(Guid userId, Guid? sessionDmUserId, TokenKind kind, Guid? ownerUserId) =>
        userId == sessionDmUserId || (kind == TokenKind.Character && ownerUserId == userId);

    private static ApiErrorCode? UndoError(LatestTokenMove? latest, Guid userId, Guid? sessionDmUserId)
    {
        // Removing a token raises its version too, so the undo of a move of a removed token
        // stays gone once the token is back (knowledge/features/removing-tokens.md).
        if (latest is null
            || latest.Move.UndoneAt is not null
            || latest.Token.Version != latest.Move.Version
            || latest.Token.RemovedAt is not null)
        {
            return ApiErrorCode.NothingToUndo;
        }

        // The caller may have lost the right since, e.g. the session went to another DM.
        return MayMove(userId, sessionDmUserId, latest.Token.Kind, latest.OwnerUserId) ? null : ApiErrorCode.NotYourToken;
    }

    // The caller's move with the highest id in the encounter, with its token.
    private static IQueryable<LatestTokenMove> LatestMove(IQueryable<TokenMove> moves, Guid encounterId, Guid userId) =>
        moves
            .Where(m => m.EncounterId == encounterId && m.ByUserId == userId)
            .OrderByDescending(m => m.Id)
            .Select(m => new LatestTokenMove(m, m.Token, (Guid?)m.Token.Character!.OwnerUserId));

    private IQueryable<EncounterAccess> Encounter(Guid encounterId, Guid userId) =>
        db.Encounters
            .Where(e => e.Id == encounterId)
            .Select(e => new EncounterAccess(
                db.CampaignMembers.Any(m => m.CampaignId == e.CampaignId && m.UserId == userId),
                e.Status,
                (Guid?)e.Session.DmUserId));

    private static TokenMovedEvent Event(Token token, Guid userId, bool undo) =>
        new(token.EncounterId, token.Id, token.X, token.Y, token.Elevation, token.Version, userId, undo);

    private sealed record EncounterAccess(bool IsMember, EncounterStatus Status, Guid? SessionDmUserId);

    // The token as read (tracked, for MoveAsync to save), its map and size; or an error.
    private sealed record MoveCheck(ApiErrorCode? Error, Token? Token, MapGrid? Grid, CreatureSize Size)
    {
        public static MoveCheck Failed(ApiErrorCode error) => new(error, null, null, default);
    }

    private sealed record LatestTokenMove(TokenMove Move, Token Token, Guid? OwnerUserId);
}
