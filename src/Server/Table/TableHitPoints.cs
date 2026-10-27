using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Table;

// Hit points and the dead mark at the table (knowledge/features/hit-points.md): the session
// DM's notes on creatures on the board. Neither touches the token's Version, which counts
// moves: noting hit points never makes a move fail. A move saved in between only makes the
// save read the token again.
public sealed class TableHitPoints(AppDbContext db)
{
    private const int SaveAttempts = 5;

    // Errors: TokenNotFound, EncounterNotActive, NotSessionDm, HitPointsInvalid.
    public async Task<(ApiErrorCode? Error, TokenHitPointsChangedEvent? Change)> SetHitPointsAsync(
        Guid userId, SetHitPointsRequest? request)
    {
        if (request is null)
        {
            return (ApiErrorCode.TokenNotFound, null);
        }

        for (var attempt = 1; ; attempt++)
        {
            db.ChangeTracker.Clear();
            var (error, token) = await CreatureAsync(userId, request.TokenId);
            if (error is not null)
            {
                return (error, null);
            }

            if (!HitPointRules.Valid(request.HitPoints, request.MaxHitPoints))
            {
                return (ApiErrorCode.HitPointsInvalid, null);
            }

            token!.MaxHitPoints = request.MaxHitPoints;
            token.HitPoints = request.HitPoints;
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException) when (attempt < SaveAttempts)
            {
                continue;
            }

            return (null, new TokenHitPointsChangedEvent(token.EncounterId, token.Id, request.HitPoints, request.MaxHitPoints));
        }
    }

    // Marking a dead creature dead again, or a living one alive, still succeeds.
    // Errors: TokenNotFound, EncounterNotActive, NotSessionDm.
    public async Task<(ApiErrorCode? Error, TokenDeadChangedEvent? Change)> SetDeadAsync(Guid userId, SetTokenDeadRequest? request)
    {
        if (request is null)
        {
            return (ApiErrorCode.TokenNotFound, null);
        }

        for (var attempt = 1; ; attempt++)
        {
            db.ChangeTracker.Clear();
            var (error, token) = await CreatureAsync(userId, request.TokenId);
            if (error is not null)
            {
                return (error, null);
            }

            token!.Dead = request.Dead;
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException) when (attempt < SaveAttempts)
            {
                continue;
            }

            return (null, new TokenDeadChangedEvent(token.EncounterId, token.Id, request.Dead));
        }
    }

    // The creature (tracked), when the caller runs the session of its active encounter and it
    // is on the board. Characters and removed tokens are TokenNotFound.
    private async Task<(ApiErrorCode? Error, Token? Token)> CreatureAsync(Guid userId, Guid tokenId)
    {
        var found = await db.Tokens
            .Where(t => t.Id == tokenId)
            .Select(t => new
            {
                Token = t,
                IsMember = db.CampaignMembers.Any(m => m.CampaignId == t.Encounter.CampaignId && m.UserId == userId),
                t.Encounter.Status,
                SessionDmUserId = (Guid?)t.Encounter.Session.DmUserId,
            })
            .SingleOrDefaultAsync();
        if (found is null || !found.IsMember)
        {
            return (ApiErrorCode.TokenNotFound, null);
        }

        if (found.Status != EncounterStatus.Active)
        {
            return (ApiErrorCode.EncounterNotActive, null);
        }

        if (found.SessionDmUserId != userId)
        {
            return (ApiErrorCode.NotSessionDm, null);
        }

        return found.Token is { Kind: TokenKind.Creature, RemovedAt: null } ? (null, found.Token) : (ApiErrorCode.TokenNotFound, null);
    }
}
