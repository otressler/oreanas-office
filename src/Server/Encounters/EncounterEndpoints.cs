using System.Linq.Expressions;
using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sessions;
using OreanasOffice.Server.Statuses;
using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Encounters;

// knowledge/domain/encounter.md and battle-map.md: the session DM imports maps into
// their session and starts and ends its encounters; `dm` members see the prepared ones
// (in the session list, SessionEndpoints). Every member sees the board of the active
// encounter.
public static class EncounterEndpoints
{
    // A new creature type can collide with one another import creates at the same
    // moment; the second try then finds it.
    private const int ImportAttempts = 2;

    public static IEndpointRouteBuilder MapEncounterEndpoints(this IEndpointRouteBuilder app)
    {
        var encounters = app.MapGroup("/api/campaigns/{campaignId:guid}/encounters").WithTags("Encounters");

        encounters.MapGet("/{encounterId:guid}/board", GetBoard).RequireAuthorization(Policies.CampaignMember);

        var session = app.MapGroup("/api/campaigns/{campaignId:guid}/sessions/{sessionId:guid}/encounters")
            .WithTags("Encounters")
            .RequireAuthorization(Policies.SessionDm);
        session.MapPost("/import", ImportMap);
        session.MapPost("/{encounterId:guid}/start", StartEncounter);
        session.MapPost("/{encounterId:guid}/end", EndEncounter);

        return app;
    }

    // Creates the battle map, an encounter of the same name in this session in status Ready,
    // its creature tokens and any missing creature types, all or nothing. See MapFile.cs
    // for the rules and their error codes. SessionEnded for an ended session: fights are
    // added only to planned and running ones (knowledge/domain/session.md).
    private static async Task<Results<Created<EncounterSummaryResponse>, BadRequest<ApiError>, Conflict<ApiError>>> ImportMap(
        Guid campaignId,
        Guid sessionId,
        ImportMapRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        // The SessionDm policy has checked that the session belongs to the campaign.
        if (await db.Sessions.AnyAsync(s => s.Id == sessionId && s.Status == SessionStatus.Ended, cancellationToken))
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.SessionEnded));
        }

        for (var attempt = 1; ; attempt++)
        {
            var campaignTypes = await db.CreatureTypes.Where(t => t.CampaignId == campaignId).ToListAsync(cancellationToken);
            if (MapImport.Build(request, campaignId, sessionId, campaignTypes, time.GetUtcNow(), user.GetUserId(), out var import) is { } error)
            {
                return TypedResults.BadRequest(error);
            }

            db.Encounters.Add(import!.Encounter);
            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException ex) when (UniqueIndex.IsViolation(ex) && attempt < ImportAttempts)
            {
                db.ChangeTracker.Clear();
                continue;
            }

            var encounterId = import.Encounter.Id;
            var summary = await Summaries(db.Encounters.Where(e => e.Id == encounterId)).SingleAsync(cancellationToken);
            return TypedResults.Created($"/api/campaigns/{campaignId}/encounters/{encounterId}/board", summary);
        }
    }

    // Any member for the active encounter of the campaign's active session; `dm`
    // members for any encounter (the setup screen draws a Ready one). 404 otherwise, so
    // players can't tell a prepared encounter exists.
    private static async Task<Results<Ok<BoardStateResponse>, NotFound>> GetBoard(
        Guid campaignId,
        Guid encounterId,
        ClaimsPrincipal user,
        AppDbContext db,
        TablePresence presence,
        CancellationToken cancellationToken,
        [FromQuery] string? view = null)
    {
        var userId = user.GetUserId();
        var encounter = await db.Encounters
            .Where(e => e.Id == encounterId && e.CampaignId == campaignId)
            .Select(e => new
            {
                e.Id,
                e.SessionId,
                e.Name,
                e.Status,
                SessionDmUserId = (Guid?)e.Session.DmUserId,
                e.Session.PlayMode,
                e.Fog,
                e.FogVersion,
                e.MapCopy,
                SavedBackgroundAssetId = e.BackgroundAssetId,
                MapBackgroundAssetId = e.BattleMap.BackgroundAssetId,
                Map = new BoardMap(e.BattleMap.Id, e.BattleMap.Name, e.BattleMap.Width, e.BattleMap.Height, e.BattleMap.Layout, null),
            })
            .SingleOrDefaultAsync(cancellationToken);

        // An active encounter always belongs to the active session: starting needs an
        // active session, and ending the session ends its encounter.
        if (encounter is null
            || (encounter.Status != EncounterStatus.Active && !await db.IsCampaignDmAsync(campaignId, userId, cancellationToken)))
        {
            return TypedResults.NotFound();
        }

        // Removed tokens stay off the board; only the session DM of the running fight gets
        // them, newest first, for "Vom Feld genommen" (knowledge/features/removing-tokens.md).
        // ?view=player asks for the players' board whoever is signed in: spectator and shared
        // screens do, so the session DM's tablet never gets hidden things
        // (knowledge/features/spectator-view.md). Asking for less is always allowed.
        var asPlayer = string.Equals(view, "player", StringComparison.OrdinalIgnoreCase);
        var isSessionDm = encounter.Status == EncounterStatus.Active && encounter.SessionDmUserId == userId;
        var (tokens, characters) = await BoardTokens.LoadAsync(db, campaignId, db.Tokens.Where(t => t.EncounterId == encounterId), cancellationToken);
        var onBoard = tokens.Where(t => t.RemovedAt is null).ToList();
        List<BoardToken> removed = isSessionDm
            ? [.. tokens.Where(t => t.RemovedAt is not null).OrderByDescending(t => t.RemovedAt).ThenBy(t => t.Id)]
            : [];
        var statuses = await StatusViews.ForIdsAsync(
            db, onBoard.Concat(removed).SelectMany(t => t.Statuses).Select(s => s.StatusId), cancellationToken);
        var people = await TablePeople.LoadAsync(db, campaignId, encounter.SessionDmUserId, characters, cancellationToken);
        var undoable = encounter.Status == EncounterStatus.Active
            ? await TableMoves.UndoableMoveAsync(db, encounterId, userId, encounter.SessionDmUserId, cancellationToken)
            : null;

        // The map as it was when the fight started, once it has; the battle map itself
        // may have been edited since.
        // Likewise the background saved at the start; before that the map's picked one,
        // while it fits the map's size (knowledge/domain/battle-map.md, "Background image").
        var map = encounter.MapCopy is { } copy
            ? encounter.Map with
            {
                Width = copy.Width,
                Height = copy.Height,
                Layout = copy.Layout,
                Background = await MapBackgrounds.BoardAsync(db, encounter.SavedBackgroundAssetId, null, cancellationToken),
            }
            : encounter.Map with
            {
                Background = await MapBackgrounds.BoardAsync(
                    db, encounter.MapBackgroundAssetId, (encounter.Map.Width, encounter.Map.Height), cancellationToken),
            };
        var board = new BoardStateResponse(
            encounter.Id,
            campaignId,
            encounter.SessionId,
            encounter.Name,
            encounter.Status,
            map,
            onBoard,
            isSessionDm,
            undoable,
            removed,
            statuses,
            people,
            BoardViewer.Dm,
            encounter.Fog is { } fog
                ? new FogView(
                    encounter.FogVersion,
                    [.. fog.HiddenCells.Select(c => new BoardCell(c[0], c[1]))],
                    fog.Areas)
                : null,
            encounter.PlayMode,
            presence.Snapshot(encounterId, people.Select(p => p.UserId)));

        // Players, and anyone who asked for the players' view, get the filtered board.
        return TypedResults.Ok(isSessionDm && !asPlayer ? board : TableVisibility.ForPlayers(board with { UndoableMove = asPlayer ? null : board.UndoableMove }));
    }

    // Ready → active in its session, creating one character token per placement in the
    // same transaction. 404 for an encounter of another session. Conflicts:
    // SessionNotActive, EncounterNotReady (draft, active or ended), AnotherEncounterActive.
    // Bad requests: CharacterInvalid (not in the campaign, or listed twice) and
    // PlacementInvalid (knowledge/domain/encounter.md, placement rule), with Field
    // "characters[i]".
    private static async Task<Results<Ok<EncounterSummaryResponse>, BadRequest<ApiError>, NotFound, Conflict<ApiError>>> StartEncounter(
        Guid campaignId,
        Guid sessionId,
        Guid encounterId,
        StartEncounterRequest request,
        AppDbContext db,
        TimeProvider time,
        [FromServices] TableBroadcaster table,
        CancellationToken cancellationToken)
    {
        var encounter = await db.Encounters
            .Where(e => e.Id == encounterId && e.CampaignId == campaignId && e.SessionId == sessionId)
            .Select(e => new { e.Status, e.ArchivedAt, e.Version, e.BattleMap.Width, e.BattleMap.Height, e.BattleMap.Layout, e.BattleMap.BackgroundAssetId })
            .SingleOrDefaultAsync(cancellationToken);
        if (encounter is null)
        {
            return TypedResults.NotFound();
        }

        // The SessionDm policy has checked that the session belongs to the campaign.
        if (await ConflictAsync(db, sessionId, encounter.Status, cancellationToken) is { } conflict)
        {
            return TypedResults.Conflict(conflict);
        }

        if (encounter.ArchivedAt is not null)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.EncounterArchived));
        }

        // Nobody can join the board later in stage 3, so a fight starts with at least one character.
        var placements = request.Characters ?? [];
        if (placements.Count == 0)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.CharacterInvalid, "characters"));
        }

        var ids = placements.Select(p => p?.CharacterId ?? Guid.Empty).ToList();
        var sizes = await db.Characters
            .Where(c => c.CampaignId == campaignId && ids.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.Size, cancellationToken);

        // The creatures stand first, on the map as it is now: a push may have been
        // accepted before the map changed. Each character must then find free walkable cells.
        var board = new TokenPlacement(new MapGrid(encounter.Width, encounter.Height, encounter.Layout));
        // In the order a push lists them (SyncItems), so Field names the token the device
        // shows. Sorted here, not in SQL, which orders Guids differently.
        var standing = (await db.Tokens
                .Where(t => t.EncounterId == encounterId)
                .Select(t => new { t.Id, t.CreatedAt, t.Size, t.X, t.Y })
                .ToListAsync(cancellationToken))
            .OrderBy(t => t.CreatedAt)
            .ThenBy(t => t.Id)
            .ToList();
        // The elevation is taken from the map as it is now (knowledge/domain/token.md), not from
        // the push: the map may have been raised under a creature since.
        var creatureElevations = new Dictionary<Guid, decimal>();
        for (var i = 0; i < standing.Count; i++)
        {
            if (!board.TryPlace(standing[i].Size, standing[i].X, standing[i].Y, out var standingElevation))
            {
                return TypedResults.Conflict(new ApiError(ApiErrorCode.CreaturesMisplaced, $"tokens[{i}]"));
            }

            creatureElevations[standing[i].Id] = standingElevation;
        }

        // The fight keeps the map's picked background with its copy of the layout, when it
        // can be shown on this size.
        var background = await MapBackgrounds.UsableAsync(
            db, encounter.BackgroundAssetId, (encounter.Width, encounter.Height), cancellationToken);

        var now = time.GetUtcNow();
        var tokens = new List<Token>();
        var seen = new HashSet<Guid>();
        for (var i = 0; i < placements.Count; i++)
        {
            var field = $"characters[{i}]";
            var placement = placements[i];
            if (placement is null || !sizes.TryGetValue(placement.CharacterId, out var size) || !seen.Add(placement.CharacterId))
            {
                return TypedResults.BadRequest(new ApiError(ApiErrorCode.CharacterInvalid, field));
            }

            if (!board.TryPlace(size, placement.X, placement.Y, out var elevation))
            {
                return TypedResults.BadRequest(new ApiError(ApiErrorCode.PlacementInvalid, field));
            }

            tokens.Add(new Token
            {
                EncounterId = encounterId,
                Kind = TokenKind.Character,
                CharacterId = placement.CharacterId,
                Size = size,
                X = placement.X,
                Y = placement.Y,
                Elevation = elevation,
                CreatedAt = now,
            });
        }

        // The switch to active and the character tokens land together, so players never
        // see half-placed tokens. Like ActivateSession, the switch is a conditional
        // update; here it also requires the session to be still active.
        var strategy = db.Database.CreateExecutionStrategy();
        var raced = await strategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            try
            {
                var updated = await db.Encounters
                    .Where(e => e.Id == encounterId
                        && e.Status == EncounterStatus.Ready
                        && e.Version == encounter.Version
                        && e.ArchivedAt == null
                        && db.Sessions.Any(s => s.Id == sessionId && s.Status == SessionStatus.Active))
                    .ExecuteUpdateAsync(
                        set => set
                            .SetProperty(e => e.Status, EncounterStatus.Active)
                            .SetProperty(e => e.StartedAt, now)
                            .SetProperty(e => e.MapCopy, new EncounterMapCopy(encounter.Width, encounter.Height, encounter.Layout))
                            .SetProperty(e => e.BackgroundAssetId, background == null ? null : background.Id)
                            .SetProperty(e => e.Version, e => e.Version + 1)
                            .SetProperty(e => e.UpdatedAt, now),
                        cancellationToken);
                if (updated == 0)
                {
                    // The session ended or the encounter started in the meantime.
                    var current = await db.Encounters.Where(e => e.Id == encounterId).Select(e => new { e.Status, e.ArchivedAt }).SingleAsync(cancellationToken);
                    return await ConflictAsync(db, sessionId, current.Status, cancellationToken)
                        ?? (current.ArchivedAt is not null ? new ApiError(ApiErrorCode.EncounterArchived) : null)
                        ?? new ApiError(ApiErrorCode.EncounterNotReady);
                }
            }
            catch (Exception ex) when (UniqueIndex.IsViolation(ex))
            {
                // Another encounter of this session started between the check and the
                // update; the filtered unique index IX_Encounters_SessionId_Active let
                // only one win.
                return new ApiError(ApiErrorCode.AnotherEncounterActive);
            }

            var creatures = await db.Tokens.Where(t => t.EncounterId == encounterId).ToListAsync(cancellationToken);
            foreach (var creature in creatures)
            {
                if (creatureElevations.TryGetValue(creature.Id, out var elevation))
                {
                    creature.Elevation = elevation;
                }
            }

            db.Tokens.AddRange(tokens);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return null;
        });
        if (raced is not null)
        {
            return TypedResults.Conflict(raced);
        }

        await table.EncounterStartedAsync(sessionId, encounterId);
        return TypedResults.Ok(await Summaries(db.Encounters.Where(e => e.Id == encounterId)).SingleAsync(cancellationToken));
    }

    // Active → ended. Already ended: unchanged. 404 unless the encounter belongs to this
    // session; EncounterNotActive for one that hasn't started. The devices at the table
    // hear EncounterEnded once the fight has actually ended.
    private static async Task<Results<Ok<EncounterSummaryResponse>, NotFound, Conflict<ApiError>>> EndEncounter(
        Guid campaignId,
        Guid sessionId,
        Guid encounterId,
        AppDbContext db,
        TimeProvider time,
        [FromServices] TableBroadcaster table,
        CancellationToken cancellationToken)
    {
        var status = await db.Encounters
            .Where(e => e.Id == encounterId && e.CampaignId == campaignId && e.SessionId == sessionId)
            .Select(e => (EncounterStatus?)e.Status)
            .SingleOrDefaultAsync(cancellationToken);
        if (status is null)
        {
            return TypedResults.NotFound();
        }

        if (status is EncounterStatus.Draft or EncounterStatus.Ready)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.EncounterNotActive));
        }

        if (status == EncounterStatus.Active
            && await EndActiveAsync(db.Encounters.Where(e => e.Id == encounterId), time.GetUtcNow(), cancellationToken) > 0)
        {
            await table.EncounterEndedAsync(sessionId, encounterId);
        }

        return TypedResults.Ok(await Summaries(db.Encounters.Where(e => e.Id == encounterId)).SingleAsync(cancellationToken));
    }

    // Active → ended for the given encounters, as a conditional update. Ending a session
    // ends its active encounter this way too.
    public static Task<int> EndActiveAsync(IQueryable<Encounter> encounters, DateTimeOffset now, CancellationToken cancellationToken) =>
        encounters
            .Where(e => e.Status == EncounterStatus.Active)
            .ExecuteUpdateAsync(
                set => set
                    .SetProperty(e => e.Status, EncounterStatus.Ended)
                    .SetProperty(e => e.EndedAt, now)
                    .SetProperty(e => e.Version, e => e.Version + 1)
                    .SetProperty(e => e.UpdatedAt, now),
                cancellationToken);

    // Why this encounter can't start in this session, in the order the setup screen
    // would fix it.
    private static async Task<ApiError?> ConflictAsync(
        AppDbContext db, Guid sessionId, EncounterStatus status, CancellationToken cancellationToken)
    {
        if (!await db.Sessions.AnyAsync(s => s.Id == sessionId && s.Status == SessionStatus.Active, cancellationToken))
        {
            return new ApiError(ApiErrorCode.SessionNotActive);
        }

        if (status != EncounterStatus.Ready)
        {
            return new ApiError(ApiErrorCode.EncounterNotReady);
        }

        if (await db.Encounters.AnyAsync(e => e.SessionId == sessionId && e.Status == EncounterStatus.Active, cancellationToken))
        {
            return new ApiError(ApiErrorCode.AnotherEncounterActive);
        }

        return null;
    }

    // Constructor projections can't be filtered or sorted afterwards, so callers
    // narrow and order the encounters first.
    private static IQueryable<EncounterSummaryResponse> Summaries(IQueryable<Encounter> encounters) =>
        encounters.Select(SummaryOf);

    // Also used inside the session list's projection (SessionEndpoints).
    public static readonly Expression<Func<Encounter, EncounterSummaryResponse>> SummaryOf =
        e => new EncounterSummaryResponse(
            e.Id,
            e.Name,
            e.Status,
            e.BattleMapId,
            e.BattleMap.Name,
            e.BattleMap.Width,
            e.BattleMap.Height,
            e.Tokens.Count(t => t.Kind == TokenKind.Creature),
            e.SessionId,
            e.CreatedAt,
            e.Version,
            e.ArchivedAt);
}
