using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Table;

// Creature spawn (knowledge/features/creature-spawn.md): the session DM places creatures
// that were not prepared, in a running fight. All tokens and the EncounterChange for the
// undo are saved in one SaveChanges; the tokens may stand on other tokens, and their numbers
// follow CreatureNumbers (at first sight when a spawn is hidden or in fog).
public sealed class TableSpawns(TableFog fog, AppDbContext db, TimeProvider time)
{
    public const int MaxCreatures = 50;

    private const int SaveAttempts = 5;

    // Errors: TokenNotFound, EncounterNotActive, NotSessionDm, SpawnInvalid (none, more than
    // MaxCreatures, or a creature type outside the campaign), TargetInvalid (a footprint not
    // on walkable cells inside the map). TokenIds are in the order of the request.
    public async Task<(ApiErrorCode? Error, ChangeOutcome? Outcome, List<Guid>? TokenIds)> SpawnAsync(
        Guid userId, ConnectionMode mode, SpawnCreaturesRequest? request)
    {
        if (request is null)
        {
            return (ApiErrorCode.TokenNotFound, null, null);
        }

        for (var attempt = 1; ; attempt++)
        {
            var (error, fight) = await fog.LoadAsync(userId, mode, request.EncounterId);
            if (error is not null)
            {
                return (error, null, null);
            }

            var creatures = request.Creatures ?? [];
            if (creatures.Count is 0 or > MaxCreatures || creatures.Any(c => c is null))
            {
                return (ApiErrorCode.SpawnInvalid, null, null);
            }

            var encounter = fight!.Encounter;
            var typeIds = creatures.Select(c => c.CreatureTypeId).Distinct().ToList();
            var types = await db.CreatureTypes.AsNoTracking()
                .Where(t => t.CampaignId == encounter.CampaignId && typeIds.Contains(t.Id))
                .ToDictionaryAsync(t => t.Id, t => new { t.Size, t.InitiativeModifier, t.InitiativeRollMode });
            if (types.Count != typeIds.Count)
            {
                return (ApiErrorCode.SpawnInvalid, null, null);
            }

            var now = time.GetUtcNow();
            var tokens = new List<Token>();
            for (var i = 0; i < creatures.Count; i++)
            {
                var (typeId, x, y) = (creatures[i].CreatureTypeId, creatures[i].X, creatures[i].Y);
                var size = types[typeId].Size;
                if (!Maps.MapGrid.FootprintCells(size, x, y).All(cell => fight.Grid.Walkable(cell.X, cell.Y)))
                {
                    return (ApiErrorCode.TargetInvalid, null, null);
                }

                tokens.Add(new Token
                {
                    Id = Guid.NewGuid(),
                    EncounterId = encounter.Id,
                    Kind = TokenKind.Creature,
                    CreatureTypeId = typeId,
                    Size = size,
                    X = x,
                    Y = y,
                    Elevation = fight.Grid.PlacementElevation(size, x, y),
                    Hidden = request.Hidden,
                    // The request's order is the placement order.
                    CreatedAt = now.AddTicks(i),
                });
            }

            var hiddenCells = FogCells.Set(encounter.Fog);
            var visible = tokens.Where(t => Visible(hiddenCells, t)).ToList();
            await CreatureNumbers.NumberAsync(db, encounter.Id, visible);
            // With initiative on, the creatures roll and join the list (knowledge/features/initiative.md).
            var initiative = TableInitiative.AddSpawned(
                encounter,
                tokens,
                types.ToDictionary(t => t.Key, t => (t.Value.InitiativeModifier, t.Value.InitiativeRollMode)),
                InitiativeRules.RollD20);
            db.Tokens.AddRange(tokens);
            db.EncounterChanges.Add(new EncounterChange
            {
                EncounterId = encounter.Id,
                ByUserId = userId,
                Kind = EncounterChangeKind.Spawn,
                Payload = JsonSerializer.Serialize(new TableFog.SpawnPayload([.. tokens.Select(t => t.Id)])),
                At = now,
            });
            try
            {
                await db.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException) when (attempt < SaveAttempts)
            {
                continue;
            }

            var ids = tokens.Select(t => t.Id).ToList();
            var board = await fog.BoardTokensAsync(encounter.CampaignId, ids);
            var added = ids.Select(id => board[id]).ToList();
            var outcome = new ChangeOutcome(encounter.Id, new Delivery(), []);
            outcome.Delivery.Dm.Add(client => client.TokensAdded(new TokensAddedEvent(encounter.Id, added)));
            if (initiative is not null)
            {
                outcome.Delivery.Dm.Add(client => client.InitiativeChanged(initiative));
            }

            var forPlayers = added.Where(t => TableVisibility.TokenVisible(hiddenCells, t)).ToList();
            if (forPlayers.Count > 0)
            {
                outcome.Delivery.Players.Add(client => client.TokensAdded(new TokensAddedEvent(encounter.Id, forPlayers)));
            }

            return (null, outcome, ids);
        }
    }

    private static bool Visible(HashSet<(int X, int Y)> hiddenCells, Token token) =>
        TableVisibility.TokenVisible(hiddenCells, token.Kind, token.Hidden, token.Size, token.X, token.Y);
}
