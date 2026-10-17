using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Statuses;

namespace OreanasOffice.Server.Table;

// Statuses on tokens at the table (knowledge/features/statuses.md, "Who puts statuses on
// which token"): the session DM on any token and removes any; everyone else, other `dm`
// members included, puts them on their own characters and on creatures, and removes or
// changes only the ones they put on. Saved before the hub broadcasts the token's whole list.
public sealed class TableStatuses(AppDbContext db, TimeProvider time)
{
    // Errors in this order: TokenNotFound, EncounterNotActive, TokenNotFound (removed),
    // NotYourToken, StatusNotFound, LevelInvalid, StatusAlreadySet. Two people putting on
    // the same status at once: one wins, the other gets StatusAlreadySet.
    public async Task<StatusResult> AddAsync(Guid userId, AddStatusRequest? request)
    {
        if (request is null)
        {
            return Failed(ApiErrorCode.TokenNotFound);
        }

        var (error, token) = await TokenAsync(userId, request.TokenId);
        if (error is not null)
        {
            return Failed(error.Value);
        }

        if (!token!.IsSessionDm(userId) && !(token.Kind == TokenKind.Creature || token.OwnerUserId == userId))
        {
            return Failed(ApiErrorCode.NotYourToken);
        }

        var status = await db.StatusDefinitions.AsNoTracking()
            .Where(s => s.Id == request.StatusId && (s.CampaignId == null || s.CampaignId == token.CampaignId))
            .Select(s => new { s.HasLevels })
            .SingleOrDefaultAsync();
        if (status is null)
        {
            return Failed(ApiErrorCode.StatusNotFound);
        }

        int? level = status.HasLevels ? request.Level ?? 1 : request.Level;
        if (level is not null && (!status.HasLevels || !ValidLevel(level.Value)))
        {
            return Failed(ApiErrorCode.LevelInvalid);
        }

        if (await db.TokenStatuses.AnyAsync(s => s.TokenId == request.TokenId && s.StatusId == request.StatusId))
        {
            return Failed(ApiErrorCode.StatusAlreadySet);
        }

        db.TokenStatuses.Add(new TokenStatus
        {
            TokenId = request.TokenId,
            StatusId = request.StatusId,
            Level = level,
            AppliedByUserId = userId,
            AppliedAt = time.GetUtcNow(),
        });
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (UniqueIndex.IsViolation(ex))
        {
            return Failed(ApiErrorCode.StatusAlreadySet);
        }

        return await ChangedAsync(token);
    }

    // Errors: TokenNotFound, EncounterNotActive, StatusNotFound (not on the token, also
    // when someone else took it off first), NotYourStatus.
    public async Task<StatusResult> RemoveAsync(Guid userId, RemoveStatusRequest? request)
    {
        if (request is null)
        {
            return Failed(ApiErrorCode.TokenNotFound);
        }

        var (error, token, applied) = await OwnStatusAsync(userId, request.TokenId, request.StatusId);
        if (error is not null)
        {
            return Failed(error.Value);
        }

        // Only the status as it was checked: if it was taken off and put on again by
        // someone else meanwhile, it stays.
        var deleted = await db.TokenStatuses
            .Where(s => s.TokenId == request.TokenId && s.StatusId == request.StatusId && s.AppliedByUserId == applied!.AppliedByUserId)
            .ExecuteDeleteAsync();
        return deleted == 0 ? Failed(ApiErrorCode.StatusNotFound) : await ChangedAsync(token!);
    }

    // As RemoveAsync, then LevelInvalid for a status without levels or a level outside 1-6.
    public async Task<StatusResult> SetLevelAsync(Guid userId, SetStatusLevelRequest? request)
    {
        if (request is null)
        {
            return Failed(ApiErrorCode.TokenNotFound);
        }

        var (error, token, applied) = await OwnStatusAsync(userId, request.TokenId, request.StatusId);
        if (error is not null)
        {
            return Failed(error.Value);
        }

        if (!applied!.HasLevels || !ValidLevel(request.Level))
        {
            return Failed(ApiErrorCode.LevelInvalid);
        }

        var updated = await db.TokenStatuses
            .Where(s => s.TokenId == request.TokenId && s.StatusId == request.StatusId && s.AppliedByUserId == applied.AppliedByUserId)
            .ExecuteUpdateAsync(set => set.SetProperty(s => s.Level, request.Level));
        return updated == 0 ? Failed(ApiErrorCode.StatusNotFound) : await ChangedAsync(token!);
    }

    private static bool ValidLevel(int level) => level is >= 1 and <= StatusDefinition.MaxLevel;

    private static StatusResult Failed(ApiErrorCode error) => new(error, null);

    // The token and the status on it, if the caller may take it off or change it.
    private async Task<(ApiErrorCode? Error, TokenAccess? Token, AppliedStatus? Applied)> OwnStatusAsync(
        Guid userId, Guid tokenId, Guid statusId)
    {
        var (error, token) = await TokenAsync(userId, tokenId);
        if (error is not null)
        {
            return (error, null, null);
        }

        var applied = await db.TokenStatuses.AsNoTracking()
            .Where(s => s.TokenId == tokenId && s.StatusId == statusId)
            .Select(s => new AppliedStatus(s.AppliedByUserId, s.Status.HasLevels))
            .SingleOrDefaultAsync();
        if (applied is null)
        {
            return (ApiErrorCode.StatusNotFound, null, null);
        }

        return token!.IsSessionDm(userId) || applied.AppliedByUserId == userId
            ? (null, token, applied)
            : (ApiErrorCode.NotYourStatus, null, null);
    }

    // A token on the board of an active encounter of the caller's campaign.
    private async Task<(ApiErrorCode? Error, TokenAccess? Token)> TokenAsync(Guid userId, Guid tokenId)
    {
        var token = await db.Tokens.AsNoTracking()
            .Where(t => t.Id == tokenId)
            .Select(t => new
            {
                Access = new TokenAccess(
                    t.Id,
                    t.EncounterId,
                    t.Encounter.CampaignId,
                    (Guid?)t.Encounter.Session.DmUserId,
                    t.Kind,
                    (Guid?)t.Character!.OwnerUserId),
                IsMember = db.CampaignMembers.Any(m => m.CampaignId == t.Encounter.CampaignId && m.UserId == userId),
                t.Encounter.Status,
                t.RemovedAt,
            })
            .SingleOrDefaultAsync();
        if (token is null || !token.IsMember)
        {
            return (ApiErrorCode.TokenNotFound, null);
        }

        if (token.Status != EncounterStatus.Active)
        {
            return (ApiErrorCode.EncounterNotActive, null);
        }

        return token.RemovedAt is null ? (null, token.Access) : (ApiErrorCode.TokenNotFound, null);
    }

    // The token's whole list as saved now, with the definitions it uses.
    private async Task<StatusResult> ChangedAsync(TokenAccess token)
    {
        var statuses = (await StatusViews.OnTokensAsync(db, db.Tokens.Where(t => t.Id == token.Id).Select(t => t.Id), CancellationToken.None))[token.Id].ToList();
        var definitions = await StatusViews.ForIdsAsync(db, statuses.Select(s => s.StatusId), CancellationToken.None);
        return new StatusResult(null, new TokenStatusesChangedEvent(token.EncounterId, token.Id, statuses, definitions));
    }

    private sealed record TokenAccess(Guid Id, Guid EncounterId, Guid CampaignId, Guid? SessionDmUserId, TokenKind Kind, Guid? OwnerUserId)
    {
        public bool IsSessionDm(Guid userId) => SessionDmUserId == userId;
    }

    private sealed record AppliedStatus(Guid AppliedByUserId, bool HasLevels);
}
