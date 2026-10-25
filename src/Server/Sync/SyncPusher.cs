using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Bestiary;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Sync;

// POST /api/sync/push (knowledge/decisions/offline-prep-pwa.md, "Sync protocol"). Items
// are handled in request order, each in its own transaction, and one never stops the
// others. Versions are the concurrency tokens of the entities, so two pushes on the same
// base version can't both save: the loser gets the server copy as a conflict.
internal sealed class SyncPusher(AppDbContext db, Guid userId, TimeProvider time)
{
    // A race on a unique index (the same new id pushed twice at once, the same creature
    // type name, a join code) is settled by running the item again: the second run sees
    // what the other push saved and answers Conflict, CreatureTypeNameTaken or Saved.
    private const int Attempts = 3;

    // Items rejected so far in this push, for the items that need them.
    private readonly HashSet<Guid> _rejected = [];

    public async Task<SyncPushResponse> RunAsync(IEnumerable<SyncPushItem?> items, CancellationToken cancellationToken)
    {
        var results = new List<SyncItemResult>();
        foreach (var item in items)
        {
            var result = item is null
                ? new SyncItemResult(Guid.Empty, SyncItemKind.Campaign, SyncOutcome.Rejected, null, new ApiError(ApiErrorCode.NameInvalid), null, null, null)
                : await HandleAsync(item, cancellationToken);
            if (result.Outcome == SyncOutcome.Rejected && result.Id != Guid.Empty)
            {
                _rejected.Add(result.Id);
            }

            results.Add(result);
        }

        return new SyncPushResponse(results);
    }

    private async Task<SyncItemResult> HandleAsync(SyncPushItem item, CancellationToken cancellationToken)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                var strategy = db.Database.CreateExecutionStrategy();
                return await strategy.ExecuteAsync(() => AttemptAsync(item, cancellationToken));
            }
            catch (Exception ex) when (UniqueIndex.IsViolation(ex))
            {
                if (attempt >= Attempts)
                {
                    return Reject(item, new ApiError(ApiErrorCode.IdTaken));
                }
            }
        }
    }

    private async Task<SyncItemResult> AttemptAsync(SyncPushItem item, CancellationToken cancellationToken)
    {
        db.ChangeTracker.Clear();
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        var (result, changed) = await ProcessAsync(item, transaction, cancellationToken);
        if (!changed)
        {
            return result;
        }

        await transaction.CommitAsync(cancellationToken);

        // The copy as stored, so a device that retries sees exactly what it pushed.
        db.ChangeTracker.Clear();
        var campaignId = item.Kind == SyncItemKind.Campaign ? item.Id : item.CampaignId;
        return result with { Server = await ServerCopyAsync(item.Kind, campaignId, item.Id, cancellationToken) };
    }

    // Changed: something was written and the transaction must commit; the result then
    // only lacks its server copy.
    private async Task<(SyncItemResult Result, bool Changed)> ProcessAsync(
        SyncPushItem item, IDbContextTransaction transaction, CancellationToken cancellationToken)
    {
        if (!HasData(item))
        {
            return (Reject(item, new ApiError(ApiErrorCode.NameInvalid, item.Kind.ToString().ToLowerInvariant())), false);
        }

        if (item.Kind == SyncItemKind.Campaign)
        {
            return await CampaignAsync(item, cancellationToken);
        }

        if (_rejected.Contains(item.CampaignId))
        {
            return (DependsOn(item, item.CampaignId), false);
        }

        if (!await db.IsCampaignDmAsync(item.CampaignId, userId, cancellationToken))
        {
            return (Reject(item, new ApiError(ApiErrorCode.NotADm)), false);
        }

        var dependency = Dependencies(item).FirstOrDefault(_rejected.Contains);
        if (dependency != Guid.Empty)
        {
            return (DependsOn(item, dependency), false);
        }

        try
        {
            return item.Kind switch
            {
                SyncItemKind.CreatureType => await CreatureTypeAsync(item, cancellationToken),
                SyncItemKind.BattleMap => await MapAsync(item, cancellationToken),
                _ => await EncounterAsync(item, cancellationToken),
            };
        }
        catch (DbUpdateConcurrencyException)
        {
            // Another push saved the item first. Roll back everything this one wrote
            // (token changes included) before reading the server copy.
            await transaction.RollbackAsync(cancellationToken);
            db.ChangeTracker.Clear();
            return (await ConflictAsync(item, cancellationToken), false);
        }
    }

    // The items a device must have pushed (and the server accepted) before this one.
    private static IEnumerable<Guid> Dependencies(SyncPushItem item) => item.Kind == SyncItemKind.Encounter
        ? [item.Encounter!.BattleMapId, .. (item.Encounter.Tokens ?? []).Where(t => t is not null).Select(t => t.CreatureTypeId)]
        : [];

    private static bool HasData(SyncPushItem item) => item.Kind switch
    {
        SyncItemKind.Campaign => item.Campaign is not null,
        SyncItemKind.CreatureType => item.CreatureType is not null,
        SyncItemKind.BattleMap => item.Map is not null,
        _ => item.Encounter is not null,
    };

    // Campaigns have no versions: a new id creates the campaign with its creator as `dm`
    // member and default DM; a known id of a campaign the pusher belongs to is a retry.
    private async Task<(SyncItemResult, bool)> CampaignAsync(SyncPushItem item, CancellationToken cancellationToken)
    {
        var existing = await db.Campaigns.AsNoTracking().SingleOrDefaultAsync(c => c.Id == item.Id, cancellationToken);
        if (existing is not null)
        {
            if (!await db.CampaignMembers.AnyAsync(m => m.CampaignId == item.Id && m.UserId == userId, cancellationToken))
            {
                return (Reject(item, new ApiError(ApiErrorCode.IdTaken)), false);
            }

            return (new SyncItemResult(item.Id, item.Kind, SyncOutcome.Saved, await CampaignItemAsync(existing, cancellationToken), null, null, null, null), false);
        }

        if (await IdExistsAsync(item.Id, SyncItemKind.Campaign, cancellationToken))
        {
            return (Reject(item, new ApiError(ApiErrorCode.IdTaken)), false);
        }

        if (item.BaseVersion != 0)
        {
            return (Reject(item, new ApiError(ApiErrorCode.ItemNotFound)), false);
        }

        var name = (item.Campaign!.Name ?? "").Trim();
        if (name.Length is 0 or > Campaign.NameMaxLength)
        {
            return (Reject(item, new ApiError(ApiErrorCode.NameInvalid, "name")), false);
        }

        var now = time.GetUtcNow();
        var campaign = new Campaign
        {
            Id = item.Id,
            Name = name,
            DefaultDmUserId = userId,
            JoinCode = JoinCodes.Create(),
            CreatedAt = now,
        };
        campaign.Members.Add(new CampaignMember { CampaignId = item.Id, UserId = userId, Role = CampaignRole.Dm, JoinedAt = now });
        db.Campaigns.Add(campaign);
        await db.SaveChangesAsync(cancellationToken);
        return (Done(item, created: true), true);
    }

    private async Task<SyncServerItem> CampaignItemAsync(Campaign campaign, CancellationToken cancellationToken) => new(
        campaign.Id,
        SyncItemKind.Campaign,
        campaign.Id,
        1,
        campaign.CreatedAt,
        await db.Users.Where(u => u.Id == campaign.DefaultDmUserId).Select(u => u.DisplayName).SingleOrDefaultAsync(cancellationToken),
        new SyncCampaignData(campaign.Name),
        null,
        null,
        null);

    private async Task<(SyncItemResult, bool)> CreatureTypeAsync(SyncPushItem item, CancellationToken cancellationToken)
    {
        var data = item.CreatureType!;
        var existing = await db.CreatureTypes.SingleOrDefaultAsync(t => t.Id == item.Id, cancellationToken);
        if (await CheckKnownAsync(item, existing?.CampaignId, existing?.Version, SyncItemKind.CreatureType, cancellationToken) is { } early)
        {
            return (early, false);
        }

        var name = (data.Name ?? "").Trim();
        if (name.Length is 0 or > CreatureType.NameMaxLength)
        {
            return (Reject(item, new ApiError(ApiErrorCode.NameInvalid, "name")), false);
        }

        var appearance = data.Appearance ?? "";
        if (appearance.Length > CreatureType.AppearanceMaxLength)
        {
            return (Reject(item, new ApiError(ApiErrorCode.TextTooLong, "appearance")), false);
        }

        var notes = data.Notes ?? "";
        if (notes.Length > CreatureType.NotesMaxLength)
        {
            return (Reject(item, new ApiError(ApiErrorCode.TextTooLong, "notes")), false);
        }

        if (!Enum.IsDefined(data.Size))
        {
            return (Reject(item, new ApiError(ApiErrorCode.CreatureTypeInvalid, "size")), false);
        }

        if (!Enum.IsDefined(data.InitiativeRollMode))
        {
            return (Reject(item, new ApiError(ApiErrorCode.CreatureTypeInvalid, "initiativeRollMode")), false);
        }

        if (data.InitiativeModifier is < InitiativeRules.ModifierMin or > InitiativeRules.ModifierMax)
        {
            return (Reject(item, new ApiError(ApiErrorCode.CreatureTypeInvalid, "initiativeModifier")), false);
        }

        // The database collation ignores case, which is what makes names unique per campaign.
        var taken = await db.CreatureTypes
            .Where(t => t.CampaignId == item.CampaignId && t.Name == name && t.Id != item.Id)
            .Select(t => (Guid?)t.Id)
            .FirstOrDefaultAsync(cancellationToken);
        if (taken is { } takenId)
        {
            return (Reject(item, new ApiError(ApiErrorCode.CreatureTypeNameTaken, "name")) with { ExistingCreatureTypeId = takenId }, false);
        }

        var now = time.GetUtcNow();
        var type = existing ?? db.CreatureTypes.Add(new CreatureType
        {
            Id = item.Id,
            CampaignId = item.CampaignId,
            Name = name,
            CreatedAt = now,
        }).Entity;
        type.Name = name;
        type.Size = data.Size;
        type.Appearance = appearance;
        type.Notes = notes;
        type.InitiativeModifier = data.InitiativeModifier;
        type.InitiativeRollMode = data.InitiativeRollMode;
        type.ArchivedAt = data.ArchivedAt;
        type.UpdatedAt = now;
        type.UpdatedByUserId = userId;
        if (existing is not null)
        {
            type.Version = existing.Version + 1;
        }

        await db.SaveChangesAsync(cancellationToken);
        return (Done(item, existing is null), true);
    }

    private async Task<(SyncItemResult, bool)> MapAsync(SyncPushItem item, CancellationToken cancellationToken)
    {
        var data = item.Map!;
        var existing = await db.BattleMaps.SingleOrDefaultAsync(m => m.Id == item.Id, cancellationToken);
        if (await CheckKnownAsync(item, existing?.CampaignId, existing?.Version, SyncItemKind.BattleMap, cancellationToken) is { } early)
        {
            return (early, false);
        }

        if (MapChecks.Check(data.Name, data.Width, data.Height, data.Layout, data.Scene, data.Vibe, data.Lighting) is { Count: > 0 } problems)
        {
            return (Reject(item, new ApiError(ApiErrorCode.LayoutInvalid)) with { Problems = problems }, false);
        }

        var now = time.GetUtcNow();
        var map = existing ?? db.BattleMaps.Add(new BattleMap
        {
            Id = item.Id,
            CampaignId = item.CampaignId,
            Name = "",
            Layout = data.Layout,
            CreatedAt = now,
            // Set once, never changed.
            CopiedFromMapId = data.CopiedFromMapId,
        }).Entity;

        // Texts are stored trimmed, as the checks measure them.
        map.Name = data.Name.Trim();
        map.Width = data.Width;
        map.Height = data.Height;
        map.Layout = data.Layout;
        map.Scene = (data.Scene ?? "").Trim();
        map.Vibe = (data.Vibe ?? "").Trim();
        map.Lighting = (data.Lighting ?? "").Trim();
        map.ArchivedAt = data.ArchivedAt;
        map.UpdatedAt = now;
        map.UpdatedByUserId = userId;
        if (existing is not null)
        {
            map.Version = existing.Version + 1;
        }

        await db.SaveChangesAsync(cancellationToken);
        return (Done(item, existing is null), true);
    }

    private async Task<(SyncItemResult, bool)> EncounterAsync(SyncPushItem item, CancellationToken cancellationToken)
    {
        var data = item.Encounter!;
        var existing = await db.Encounters.Include(e => e.Tokens).SingleOrDefaultAsync(e => e.Id == item.Id, cancellationToken);
        if (existing is { Status: EncounterStatus.Active or EncounterStatus.Ended } && existing.CampaignId == item.CampaignId)
        {
            // Started on the server: it belongs to the server now, whatever the base version.
            return (await ConflictAsync(item, cancellationToken), false);
        }

        if (await CheckKnownAsync(item, existing?.CampaignId, existing?.Version, SyncItemKind.Encounter, cancellationToken) is { } early)
        {
            return (early, false);
        }

        var name = (data.Name ?? "").Trim();
        if (name.Length is 0 or > Encounter.NameMaxLength)
        {
            return (Reject(item, new ApiError(ApiErrorCode.NameInvalid, "name")), false);
        }

        if (data.Status is not (EncounterStatus.Draft or EncounterStatus.Ready))
        {
            return (Reject(item, new ApiError(ApiErrorCode.StatusInvalid, "status")), false);
        }

        if (await CheckSessionAsync(item, data.SessionId, existing?.SessionId, cancellationToken) is { } sessionError)
        {
            return (sessionError, false);
        }

        // Archived maps and types are accepted: archiving only stops offering them.
        var map = await db.BattleMaps.AsNoTracking()
            .Where(m => m.Id == data.BattleMapId && m.CampaignId == item.CampaignId)
            .Select(m => new { m.Width, m.Height, m.Layout })
            .SingleOrDefaultAsync(cancellationToken);
        if (map is null)
        {
            return (Reject(item, new ApiError(ApiErrorCode.MapInvalid, "battleMapId")), false);
        }

        var tokens = data.Tokens ?? [];
        if (await CheckTokensAsync(item, tokens, cancellationToken) is { } tokenError)
        {
            return (tokenError, false);
        }

        // The server takes each creature's elevation from the map's current layout. Ready
        // needs every creature on free walkable cells; a draft may be unfinished, and a
        // creature that doesn't stand validly yet has elevation 0.
        var placement = new TokenPlacement(new MapGrid(map.Width, map.Height, map.Layout));
        var elevations = new List<decimal>();
        for (var i = 0; i < tokens.Count; i++)
        {
            var placed = placement.TryPlace(tokens[i].Size, tokens[i].X, tokens[i].Y, out var elevation);
            if (!placed && data.Status == EncounterStatus.Ready)
            {
                return (Reject(item, new ApiError(ApiErrorCode.CreaturesMisplaced, $"tokens[{i}]")), false);
            }

            elevations.Add(elevation);
        }

        if (data.Fog is { } pushedFog && FogCells.Check(pushedFog, map.Width, map.Height) is { } fogField)
        {
            return (Reject(item, new ApiError(ApiErrorCode.FogInvalid, fogField)), false);
        }

        var typeNames = await db.CreatureTypes.AsNoTracking()
            .Where(t => t.CampaignId == item.CampaignId)
            .ToDictionaryAsync(t => t.Id, t => t.Name, cancellationToken);

        var now = time.GetUtcNow();
        var encounter = existing ?? db.Encounters.Add(new Encounter
        {
            Id = item.Id,
            CampaignId = item.CampaignId,
            SessionId = data.SessionId,
            BattleMapId = data.BattleMapId,
            Name = name,
            CreatedAt = now,
        }).Entity;
        encounter.Name = name;
        encounter.SessionId = data.SessionId;
        encounter.BattleMapId = data.BattleMapId;
        encounter.Status = data.Status;
        encounter.ArchivedAt = data.ArchivedAt;
        encounter.Fog = data.Fog is { } fog ? FogCells.Normalize(fog) : null;
        encounter.UpdatedAt = now;
        encounter.UpdatedByUserId = userId;
        if (existing is not null)
        {
            encounter.Version = existing.Version + 1;
        }

        // The token set is replaced: missing ones go, the others keep their ids. CreatedAt
        // carries the pushed order (the server sends tokens back in that order).
        var kept = existing?.Tokens.ToDictionary(t => t.Id) ?? [];
        foreach (var gone in kept.Values.Where(t => t.Kind == TokenKind.Creature && tokens.All(pushed => pushed.Id != t.Id)))
        {
            db.Tokens.Remove(gone);
        }

        for (var i = 0; i < tokens.Count; i++)
        {
            var pushed = tokens[i];
            if (!kept.TryGetValue(pushed.Id, out var token))
            {
                token = db.Tokens.Add(new Token { Id = pushed.Id, EncounterId = item.Id, Kind = TokenKind.Creature }).Entity;
            }

            token.CreatureTypeId = pushed.CreatureTypeId;
            (token.Number, token.Label) = CreatureLabels.Split(typeNames[pushed.CreatureTypeId], pushed.Label);
            token.Hidden = pushed.Hidden;
            token.InitiativeModifier = pushed.InitiativeModifier;
            token.InitiativeRollMode = pushed.InitiativeRollMode;
            token.Size = pushed.Size;
            token.X = pushed.X;
            token.Y = pushed.Y;
            token.Elevation = elevations[i];
            token.CreatedAt = now.AddTicks(i);
        }

        await db.SaveChangesAsync(cancellationToken);
        return (Done(item, existing is null), true);
    }

    // Only the session's DM plans its fights, and only in a session that hasn't ended. A
    // fight moving to another session needs the DM of the old one too
    // (knowledge/decisions/offline-prep-pwa.md, "Server checks"). Field is "sessionId".
    private async Task<SyncItemResult?> CheckSessionAsync(
        SyncPushItem item, Guid sessionId, Guid? previousSessionId, CancellationToken cancellationToken)
    {
        var session = await db.Sessions
            .Where(s => s.Id == sessionId && s.CampaignId == item.CampaignId)
            .Select(s => new { s.DmUserId, s.Status })
            .SingleOrDefaultAsync(cancellationToken);
        if (session is null)
        {
            return Reject(item, new ApiError(ApiErrorCode.SessionInvalid, "sessionId"));
        }

        if (session.DmUserId != userId
            || (previousSessionId is { } previous && previous != sessionId
                && !await db.Sessions.AnyAsync(s => s.Id == previous && s.DmUserId == userId, cancellationToken)))
        {
            return Reject(item, new ApiError(ApiErrorCode.NotSessionDm, "sessionId"));
        }

        return session.Status == SessionStatus.Ended ? Reject(item, new ApiError(ApiErrorCode.SessionEnded, "sessionId")) : null;
    }

    // Tokens are malformed (TokenInvalid), or use a creature type outside the campaign
    // (CreatureTypeInvalid); Field is "tokens[i]".
    private async Task<SyncItemResult?> CheckTokensAsync(SyncPushItem item, List<SyncCreatureToken> tokens, CancellationToken cancellationToken)
    {
        var typeIds = tokens.Where(t => t is not null).Select(t => t.CreatureTypeId).Distinct().ToList();
        var campaignTypes = (await db.CreatureTypes
            .Where(t => t.CampaignId == item.CampaignId && typeIds.Contains(t.Id))
            .Select(t => t.Id)
            .ToListAsync(cancellationToken)).ToHashSet();

        var tokenIds = tokens.Where(t => t is not null).Select(t => t.Id).ToList();
        var usedElsewhere = (await db.Tokens
            .Where(t => tokenIds.Contains(t.Id) && !(t.EncounterId == item.Id && t.Kind == TokenKind.Creature))
            .Select(t => t.Id)
            .ToListAsync(cancellationToken)).ToHashSet();

        var seen = new HashSet<Guid>();
        for (var i = 0; i < tokens.Count; i++)
        {
            var field = $"tokens[{i}]";
            var token = tokens[i];
            if (token is null
                || token.Id == Guid.Empty
                || !seen.Add(token.Id)
                || usedElsewhere.Contains(token.Id)
                || (token.Label ?? "").Trim().Length is 0 or > Token.LabelMaxLength
                || !Enum.IsDefined(token.Size)
                || token.InitiativeModifier is < InitiativeRules.ModifierMin or > InitiativeRules.ModifierMax
                || token.InitiativeRollMode is { } mode && !Enum.IsDefined(mode))
            {
                return Reject(item, new ApiError(ApiErrorCode.TokenInvalid, field));
            }

            if (!campaignTypes.Contains(token.CreatureTypeId))
            {
                return Reject(item, new ApiError(ApiErrorCode.CreatureTypeInvalid, field));
            }
        }

        return null;
    }

    // The id and version rules of every item kind except campaigns. Null means: go on and
    // validate. `existingCampaignId` and `existingVersion` are null when the id is new.
    private async Task<SyncItemResult?> CheckKnownAsync(
        SyncPushItem item, Guid? existingCampaignId, int? existingVersion, SyncItemKind kind, CancellationToken cancellationToken)
    {
        if (existingCampaignId is null)
        {
            if (await IdExistsAsync(item.Id, kind, cancellationToken))
            {
                return Reject(item, new ApiError(ApiErrorCode.IdTaken));
            }

            return item.BaseVersion == 0 ? null : Reject(item, new ApiError(ApiErrorCode.ItemNotFound));
        }

        if (existingCampaignId != item.CampaignId)
        {
            return Reject(item, new ApiError(ApiErrorCode.IdTaken));
        }

        return existingVersion == item.BaseVersion ? null : await ConflictAsync(item, cancellationToken);
    }

    // The id belongs to an item of another kind (the kind's own table is checked by the caller).
    private async Task<bool> IdExistsAsync(Guid id, SyncItemKind except, CancellationToken cancellationToken) =>
        (except != SyncItemKind.Campaign && await db.Campaigns.AnyAsync(c => c.Id == id, cancellationToken))
        || (except != SyncItemKind.CreatureType && await db.CreatureTypes.AnyAsync(t => t.Id == id, cancellationToken))
        || (except != SyncItemKind.BattleMap && await db.BattleMaps.AnyAsync(m => m.Id == id, cancellationToken))
        || (except != SyncItemKind.Encounter && await db.Encounters.AnyAsync(e => e.Id == id, cancellationToken));

    private async Task<SyncItemResult> ConflictAsync(SyncPushItem item, CancellationToken cancellationToken)
    {
        db.ChangeTracker.Clear();
        var server = await ServerCopyAsync(item.Kind, item.CampaignId, item.Id, cancellationToken);
        return new SyncItemResult(item.Id, item.Kind, SyncOutcome.Conflict, server, null, null, null, null);
    }

    private async Task<SyncServerItem?> ServerCopyAsync(SyncItemKind kind, Guid campaignId, Guid id, CancellationToken cancellationToken)
    {
        if (kind != SyncItemKind.Campaign)
        {
            return await SyncItems.LoadOneAsync(db, campaignId, id, cancellationToken);
        }

        var campaign = await db.Campaigns.AsNoTracking().SingleOrDefaultAsync(c => c.Id == id, cancellationToken);
        return campaign is null ? null : await CampaignItemAsync(campaign, cancellationToken);
    }

    private static SyncItemResult Done(SyncPushItem item, bool created) =>
        new(item.Id, item.Kind, created ? SyncOutcome.Created : SyncOutcome.Saved, null, null, null, null, null);

    private static SyncItemResult Reject(SyncPushItem item, ApiError error) =>
        new(item.Id, item.Kind, SyncOutcome.Rejected, null, error, null, null, null);

    private static SyncItemResult DependsOn(SyncPushItem item, Guid dependency) =>
        new(item.Id, item.Kind, SyncOutcome.Rejected, null, new ApiError(ApiErrorCode.DependencyRejected), dependency, null, null);
}
