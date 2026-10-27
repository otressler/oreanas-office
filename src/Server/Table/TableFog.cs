using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Table;

// What a fog change, a reveal or an undo leaves for the hub to send: the messages per group
// and the tokens that left the board (their move previews go).
public sealed record ChangeOutcome(Guid EncounterId, Delivery Delivery, List<Guid> RemovedTokenIds);

// Fog of war at the table (knowledge/features/fog-of-war.md): the session DM changes the
// fog and the hidden flags of creatures, and undoes the latest change, spawns included
// (creature-spawn.md). Everything is saved first, in one SaveChanges together with the
// EncounterChange that makes the undo possible and the creature numbers given at first
// sight; the hub then sends each group its own events (Delivery).
//
// Only the session DM acts, and only from a player connection (TablePermissions.ActsAsSessionDm).
public sealed class TableFog(AppDbContext db, TimeProvider time)
{
    private const int SaveAttempts = 5;

    // What an EncounterChange keeps for its undo (EncounterChange.Payload).
    public record FogPayload(List<int[]> Cells, bool Reveal);

    // TokenIds: the creatures changed. Hidden: the flag they had before.
    public record RevealPayload(List<Guid> TokenIds, bool Hidden);

    public record SpawnPayload(List<Guid> TokenIds);

    // Errors: TokenNotFound, EncounterNotActive, NotSessionDm, FogInvalid (cells outside the
    // map, an empty list, or the encounter has no fog). A change that changes no cell
    // succeeds and sends nothing.
    public Task<(ApiErrorCode? Error, ChangeOutcome? Outcome)> ChangeFogAsync(Guid userId, ConnectionMode mode, ChangeFogRequest? request) =>
        RetryAsync(async () =>
        {
            if (request is null)
            {
                return (ApiErrorCode.TokenNotFound, null);
            }

            var (error, fight) = await LoadAsync(userId, mode, request.EncounterId);
            if (error is not null)
            {
                return (error, null);
            }

            var cells = request.Cells ?? [];
            if (fight!.Encounter.Fog is null
                || cells.Count == 0
                || cells.Any(c => c is null || !fight.Grid.Inside(c.X, c.Y)))
            {
                return (ApiErrorCode.FogInvalid, null);
            }

            return (null, await ApplyFogAsync(fight, userId, cells.Select(c => (c.X, c.Y)), request.Reveal, undoing: null));
        });

    // Errors: TokenNotFound (also for an id that is no creature on the board), EncounterNotActive,
    // NotSessionDm. Creatures that already have the flag stay as they are.
    public Task<(ApiErrorCode? Error, ChangeOutcome? Outcome)> SetTokensHiddenAsync(
        Guid userId, ConnectionMode mode, SetTokensHiddenRequest? request) =>
        RetryAsync(async () =>
        {
            if (request is null)
            {
                return (ApiErrorCode.TokenNotFound, null);
            }

            var (error, fight) = await LoadAsync(userId, mode, request.EncounterId);
            if (error is not null)
            {
                return (error, null);
            }

            var ids = (request.TokenIds ?? []).Distinct().ToList();
            var outcome = await ApplyHiddenAsync(fight!, userId, ids, request.Hidden, undoing: null, strict: true);
            return outcome is null ? (ApiErrorCode.TokenNotFound, null) : (null, outcome);
        });

    // Takes back the caller's latest change in the encounter while it isn't undone: the fog
    // cells, the reveal or hide, or a spawn (its tokens are removed like RemoveToken does).
    // Errors: TokenNotFound, EncounterNotActive, NotSessionDm, NothingToUndo.
    public Task<(ApiErrorCode? Error, ChangeOutcome? Outcome)> UndoAsync(Guid userId, ConnectionMode mode, Guid encounterId) =>
        RetryAsync(async () =>
        {
            var (error, fight) = await LoadAsync(userId, mode, encounterId);
            if (error is not null)
            {
                return (error, null);
            }

            var latest = await db.EncounterChanges
                .Where(c => c.EncounterId == encounterId && c.ByUserId == userId)
                .OrderByDescending(c => c.Id)
                .FirstOrDefaultAsync();
            if (latest is null || latest.UndoneAt is not null)
            {
                return (ApiErrorCode.NothingToUndo, null);
            }

            switch (latest.Kind)
            {
                case EncounterChangeKind.Fog:
                    var fogPayload = JsonSerializer.Deserialize<FogPayload>(latest.Payload)!;
                    return (null, await ApplyFogAsync(fight!, userId, fogPayload.Cells.Select(c => (c[0], c[1])), !fogPayload.Reveal, latest));
                case EncounterChangeKind.Reveal:
                    var reveal = JsonSerializer.Deserialize<RevealPayload>(latest.Payload)!;
                    return (null, await ApplyHiddenAsync(fight!, userId, reveal.TokenIds, reveal.Hidden, latest, strict: false));
                default:
                    var spawn = JsonSerializer.Deserialize<SpawnPayload>(latest.Payload)!;
                    return (null, await RemoveSpawnedAsync(fight!, userId, spawn.TokenIds, latest));
            }
        });

    // The encounter (tracked) of a session DM acting from a player connection, with its map.
    internal async Task<(ApiErrorCode? Error, Fight? Fight)> LoadAsync(Guid userId, ConnectionMode mode, Guid encounterId)
    {
        db.ChangeTracker.Clear();
        var found = await db.Encounters
            .Where(e => e.Id == encounterId)
            .Select(e => new
            {
                Encounter = e,
                IsMember = db.CampaignMembers.Any(m => m.CampaignId == e.CampaignId && m.UserId == userId),
                SessionDmUserId = (Guid?)e.Session.DmUserId,
                e.MapCopy,
                e.BattleMap.Width,
                e.BattleMap.Height,
                e.BattleMap.Layout,
            })
            .SingleOrDefaultAsync();
        if (found is null || !found.IsMember)
        {
            return (ApiErrorCode.TokenNotFound, null);
        }

        if (found.Encounter.Status != EncounterStatus.Active)
        {
            return (ApiErrorCode.EncounterNotActive, null);
        }

        if (!TablePermissions.ActsAsSessionDm(mode, userId, found.SessionDmUserId))
        {
            return (ApiErrorCode.NotSessionDm, null);
        }

        // The fight uses the map as it was at the start.
        var (width, height, layout) = found.MapCopy is { } copy
            ? (copy.Width, copy.Height, copy.Layout)
            : (found.Width, found.Height, found.Layout);
        return (null, new Fight(found.Encounter, new MapGrid(width, height, layout), layout));
    }

    internal sealed record Fight(Encounter Encounter, MapGrid Grid, MapLayout Layout);

    // Changes the cells (undoing: the change this takes back) and sends who sees what.
    private async Task<ChangeOutcome> ApplyFogAsync(
        Fight fight, Guid userId, IEnumerable<(int X, int Y)> cells, bool reveal, EncounterChange? undoing)
    {
        var encounter = fight.Encounter;
        var grid = fight.Grid;
        var before = FogCells.Set(encounter.Fog);

        // Void cells outside any feature are not listed in the fog.
        var changed = cells
            .Distinct()
            .Where(c => grid.Inside(c.X, c.Y)
                && (grid.TerrainAt(c.X, c.Y) != Terrain.Void || grid.FeatureAt(c.X, c.Y) is not null)
                && (reveal ? before.Contains(c) : !before.Contains(c)))
            .OrderBy(c => c.Y)
            .ThenBy(c => c.X)
            .ToList();
        var outcome = new ChangeOutcome(encounter.Id, new Delivery(), []);
        if (changed.Count == 0)
        {
            if (undoing is not null)
            {
                undoing.UndoneAt = time.GetUtcNow();
                await db.SaveChangesAsync();
            }

            return outcome;
        }

        var after = new HashSet<(int X, int Y)>(before);
        if (reveal)
        {
            after.ExceptWith(changed);
        }
        else
        {
            after.UnionWith(changed);
        }

        encounter.Fog = FogCells.Normalize(new FogDocument([.. after.Select(c => new[] { c.X, c.Y })], encounter.Fog!.Areas));
        encounter.FogVersion++;

        var creatures = await db.Tokens
            .Where(t => t.EncounterId == encounter.Id && t.RemovedAt == null && t.Kind == TokenKind.Creature)
            .ToListAsync();
        var appeared = creatures.Where(t => !Visible(before, t) && Visible(after, t)).ToList();
        var disappeared = creatures.Where(t => Visible(before, t) && !Visible(after, t)).Select(t => t.Id).ToList();
        var numbered = await CreatureNumbers.NumberAsync(db, encounter.Id, appeared);

        Record(encounter.Id, userId, EncounterChangeKind.Fog, new FogPayload([.. changed.Select(c => new[] { c.X, c.Y })], reveal), undoing);
        await db.SaveChangesAsync();

        var boardCells = changed.Select(c => new BoardCell(c.X, c.Y)).ToList();
        var labels = await BoardTokensAsync(encounter.CampaignId, appeared.Select(t => t.Id));
        outcome.Delivery.Dm.Add(client => client.FogChanged(new FogChangedEvent(
            encounter.Id,
            encounter.FogVersion,
            reveal,
            boardCells,
            null,
            [],
            [],
            [.. numbered.Select(t => new TokenNumber(t.Id, t.Number!.Value, labels[t.Id].Label))])));
        outcome.Delivery.Players.Add(client => client.FogChanged(new FogChangedEvent(
            encounter.Id,
            encounter.FogVersion,
            reveal,
            boardCells,
            reveal ? NewLayout(fight, changed) : null,
            [.. appeared.Select(t => TableVisibility.ForPlayers(labels[t.Id]))],
            disappeared,
            [])));
        return outcome;
    }

    // The layout of the cells just revealed, with whole features and the entrance cells among
    // them: LayoutFor with every other cell in the fog.
    private static MapLayout NewLayout(Fight fight, List<(int X, int Y)> revealed)
    {
        var others = new HashSet<(int X, int Y)>();
        for (var y = 0; y < fight.Grid.Height; y++)
        {
            for (var x = 0; x < fight.Grid.Width; x++)
            {
                others.Add((x, y));
            }
        }

        others.ExceptWith(revealed);
        return TableVisibility.LayoutFor(fight.Layout, others, []);
    }

    // Sets the flag on creatures of the board and sends who sees what. Null when `strict`
    // and an id is no creature on the board. Creatures that have the flag already stay.
    private async Task<ChangeOutcome?> ApplyHiddenAsync(
        Fight fight, Guid userId, List<Guid> ids, bool hidden, EncounterChange? undoing, bool strict)
    {
        var encounter = fight.Encounter;
        var creatures = await db.Tokens
            .Where(t => t.EncounterId == encounter.Id && ids.Contains(t.Id) && t.Kind == TokenKind.Creature && t.RemovedAt == null)
            .ToListAsync();
        if (strict && (ids.Count == 0 || creatures.Count != ids.Count))
        {
            return null;
        }

        var outcome = new ChangeOutcome(encounter.Id, new Delivery(), []);
        var changing = creatures.Where(t => t.Hidden != hidden).ToList();
        if (changing.Count == 0)
        {
            if (undoing is not null)
            {
                undoing.UndoneAt = time.GetUtcNow();
                await db.SaveChangesAsync();
            }

            return outcome;
        }

        var fog = FogCells.Set(encounter.Fog);
        var wasVisible = changing.Where(t => Visible(fog, t)).Select(t => t.Id).ToHashSet();
        foreach (var creature in changing)
        {
            creature.Hidden = hidden;
        }

        var isVisible = changing.Where(t => Visible(fog, t)).Select(t => t.Id).ToHashSet();
        await CreatureNumbers.NumberAsync(db, encounter.Id, changing.Where(t => isVisible.Contains(t.Id)));
        Record(encounter.Id, userId, EncounterChangeKind.Reveal, new RevealPayload([.. changing.Select(t => t.Id)], !hidden), undoing);
        await db.SaveChangesAsync();

        if (hidden)
        {
            foreach (var creature in changing)
            {
                var id = creature.Id;
                outcome.Delivery.Dm.Add(client => client.TokenHidden(new TokenHiddenEvent(encounter.Id, id)));
                if (wasVisible.Contains(id))
                {
                    outcome.Delivery.Players.Add(client => client.TokenHidden(new TokenHiddenEvent(encounter.Id, id)));
                }
            }

            return outcome;
        }

        var tokens = await BoardTokensAsync(encounter.CampaignId, changing.Select(t => t.Id));
        foreach (var creature in changing)
        {
            var token = tokens[creature.Id] with { Hidden = false };
            outcome.Delivery.Dm.Add(client => client.TokenRevealed(new TokenRevealedEvent(encounter.Id, token)));
            if (isVisible.Contains(creature.Id) && !wasVisible.Contains(creature.Id))
            {
                outcome.Delivery.Players.Add(client => client.TokenRevealed(
                    new TokenRevealedEvent(encounter.Id, TableVisibility.ForPlayers(token))));
            }
        }

        return outcome;
    }

    // Undo of a spawn: the new tokens that are still on the board are marked removed, as
    // RemoveToken does, and TokenRemoved goes to the groups that may see them.
    private async Task<ChangeOutcome> RemoveSpawnedAsync(Fight fight, Guid userId, List<Guid> ids, EncounterChange undoing)
    {
        var encounter = fight.Encounter;
        var fog = FogCells.Set(encounter.Fog);
        var now = time.GetUtcNow();
        var tokens = await db.Tokens.Where(t => t.EncounterId == encounter.Id && ids.Contains(t.Id) && t.RemovedAt == null).ToListAsync();
        var outcome = new ChangeOutcome(encounter.Id, new Delivery(), [.. tokens.Select(t => t.Id)]);
        foreach (var token in tokens)
        {
            token.RemovedAt = now;
            token.RemovedByUserId = userId;
            token.Version++;
        }

        undoing.UndoneAt = now;
        await db.SaveChangesAsync();

        foreach (var token in tokens)
        {
            var removed = new TokenRemovedEvent(encounter.Id, token.Id, userId, now);
            outcome.Delivery.Dm.Add(client => client.TokenRemoved(removed));
            if (Visible(fog, token))
            {
                outcome.Delivery.Players.Add(client => client.TokenRemoved(removed));
            }
        }

        return outcome;
    }

    private void Record<T>(Guid encounterId, Guid userId, EncounterChangeKind kind, T payload, EncounterChange? undoing)
    {
        if (undoing is not null)
        {
            undoing.UndoneAt = time.GetUtcNow();
            return;
        }

        db.EncounterChanges.Add(new EncounterChange
        {
            EncounterId = encounterId,
            ByUserId = userId,
            Kind = kind,
            Payload = JsonSerializer.Serialize(payload),
            At = time.GetUtcNow(),
        });
    }

    private static bool Visible(HashSet<(int X, int Y)> fog, Token token) =>
        TableVisibility.TokenVisible(fog, token.Kind, token.Hidden, token.Size, token.X, token.Y);

    // The tokens as the board draws them (the DM's view: Hidden set), by id.
    internal async Task<Dictionary<Guid, BoardToken>> BoardTokensAsync(Guid campaignId, IEnumerable<Guid> ids)
    {
        var wanted = ids.ToList();
        if (wanted.Count == 0)
        {
            return [];
        }

        var (tokens, _) = await BoardTokens.LoadAsync(db, campaignId, db.Tokens.Where(t => wanted.Contains(t.Id)), CancellationToken.None);
        return tokens.ToDictionary(t => t.Id);
    }

    // A token changed under the operation (a move of the same token): read everything
    // again and repeat, like a move does.
    private async Task<(ApiErrorCode? Error, ChangeOutcome? Outcome)> RetryAsync(Func<Task<(ApiErrorCode? Error, ChangeOutcome? Outcome)>> operation)
    {
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                return await operation();
            }
            catch (DbUpdateConcurrencyException) when (attempt < SaveAttempts)
            {
            }
        }
    }
}
