using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Statuses;

namespace OreanasOffice.Server.Table;

// Taking tokens off the board and bringing them back (knowledge/features/removing-tokens.md):
// the session DM only. A removed token keeps its moves and statuses. Removing and restoring
// raise the token's Version, like a move: a move or undo racing them reads the token again,
// and a player's undo of the last move of a removed token stays gone after it's back.
public sealed class TableRemovals(AppDbContext db, TimeProvider time)
{
    private const int SaveAttempts = 5;

    // Errors: TokenNotFound (not a member, no such token, or already removed),
    // EncounterNotActive, NotSessionDm (any other member).
    public async Task<(ApiErrorCode? Error, TokenRemovedEvent? Removed)> RemoveAsync(Guid userId, Guid tokenId)
    {
        for (var attempt = 1; ; attempt++)
        {
            db.ChangeTracker.Clear();
            var (error, token) = await TokenAsync(userId, tokenId, removed: false);
            if (error is not null)
            {
                return (error, null);
            }

            token!.RemovedAt = time.GetUtcNow();
            token.RemovedByUserId = userId;
            token.Version++;
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException) when (attempt < SaveAttempts)
            {
                continue;
            }

            return (null, new TokenRemovedEvent(token.EncounterId, token.Id, userId, token.RemovedAt.Value));
        }
    }

    // Puts the token back on the cell it left. Errors: TokenNotFound (also when it isn't
    // removed), EncounterNotActive, NotSessionDm.
    public async Task<(ApiErrorCode? Error, TokenRestoredEvent? Restored)> RestoreAsync(Guid userId, Guid tokenId)
    {
        for (var attempt = 1; ; attempt++)
        {
            db.ChangeTracker.Clear();
            var (error, token) = await TokenAsync(userId, tokenId, removed: true);
            if (error is not null)
            {
                return (error, null);
            }

            token!.RemovedAt = null;
            token.RemovedByUserId = null;
            token.Version++;
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException) when (attempt < SaveAttempts)
            {
                continue;
            }

            var campaignId = await db.Encounters.Where(e => e.Id == token.EncounterId).Select(e => e.CampaignId).SingleAsync();
            var (tokens, _) = await BoardTokens.LoadAsync(db, campaignId, db.Tokens.Where(t => t.Id == tokenId), CancellationToken.None);
            var restored = tokens.Single();
            var definitions = await StatusViews.ForIdsAsync(db, restored.Statuses.Select(s => s.StatusId), CancellationToken.None);
            return (null, new TokenRestoredEvent(token.EncounterId, restored, definitions));
        }
    }

    // The token (tracked), when the caller runs the session of its active encounter and it
    // is removed or on the board as asked.
    private async Task<(ApiErrorCode? Error, Token? Token)> TokenAsync(Guid userId, Guid tokenId, bool removed)
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

        return (found.Token.RemovedAt is not null) == removed ? (null, found.Token) : (ApiErrorCode.TokenNotFound, null);
    }
}
