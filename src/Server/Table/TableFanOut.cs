using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Table;

// What a change sends to each group of the encounter, built after it was saved
// (knowledge/features/fog-of-war.md, "Keeping secrets on the wire"). The DM group gets
// everything; the players' group (players, spectator screens, shared screens) only what
// players may see.
public sealed class Delivery
{
    public List<Func<ITableClient, Task>> Dm { get; } = [];

    public List<Func<ITableClient, Task>> Players { get; } = [];

    public async Task SendAsync(TableBroadcaster broadcaster, Guid encounterId)
    {
        foreach (var send in Dm)
        {
            await send(broadcaster.Dm(encounterId));
        }

        foreach (var send in Players)
        {
            await send(broadcaster.Players(encounterId));
        }
    }
}

// Where a token stood before a move or undo, for TableFanOut.MovedAsync.
public record MovedFrom(int X, int Y);

// Sends the stage 4 to 9 events (moves, previews, pings, statuses, removals) through
// TableVisibility, one group at a time: a token players cannot see never reaches them, and
// neither does a preview whose target they cannot see. The per-event decisions are the
// static MoveFor and PreviewVisible functions, which the unit tests cover.
public sealed class TableFanOut(AppDbContext db, TableBroadcaster broadcaster)
{
    // What the players' group learns from a creature (or character) move.
    public enum MoveView
    {
        Nothing,
        Moved,
        Revealed,
        Hidden,
    }

    public static MoveView MoveFor(bool visibleBefore, bool visibleAfter) => (visibleBefore, visibleAfter) switch
    {
        (true, true) => MoveView.Moved,
        (false, true) => MoveView.Revealed,
        (true, false) => MoveView.Hidden,
        _ => MoveView.Nothing,
    };

    // A preview reaches players only when the token and its whole target are visible.
    public static bool PreviewVisible(HashSet<(int X, int Y)> fog, TokenFacts token, int x, int y) =>
        token.VisibleIn(fog) && TableVisibility.FootprintRevealed(fog, token.Size, x, y);

    // After the move was saved. DM group: TokenMoved (plus TokenRevealed when the creature
    // just became visible, since it may have got its number). Players: see MoveView.
    public async Task MovedAsync(TokenMovedEvent move, MovedFrom? from)
    {
        var facts = await FactsAsync(move.TokenId);
        var dm = broadcaster.Dm(move.EncounterId);
        var players = broadcaster.Players(move.EncounterId);
        if (facts is null)
        {
            await dm.TokenMoved(move);
            return;
        }

        var fog = facts.Fog;
        var before = from is null ? facts.VisibleIn(fog) : TableVisibility.TokenVisible(fog, facts.Kind, facts.Hidden, facts.Size, from.X, from.Y);
        var view = MoveFor(before, facts.VisibleIn(fog));
        await dm.TokenMoved(move);
        switch (view)
        {
            case MoveView.Moved:
                await players.TokenMoved(move);
                break;
            case MoveView.Revealed:
                var token = await BoardTokenAsync(facts, move.TokenId);
                await dm.TokenRevealed(new TokenRevealedEvent(move.EncounterId, token));
                await players.TokenRevealed(new TokenRevealedEvent(move.EncounterId, token));
                break;
            case MoveView.Hidden:
                await players.TokenHidden(new TokenHiddenEvent(move.EncounterId, move.TokenId));
                break;
        }
    }

    public async Task PreviewedAsync(MovePreviewEvent preview, string exceptConnectionId)
    {
        await broadcaster.Hub.Clients.GroupExcept(TableGroups.Dm(preview.EncounterId), [exceptConnectionId]).MovePreviewed(preview);
        var facts = await FactsAsync(preview.TokenId);
        if (facts is null)
        {
            return;
        }

        var players = broadcaster.Hub.Clients.GroupExcept(TableGroups.Players(preview.EncounterId), [exceptConnectionId]);
        if (PreviewVisible(facts.Fog, facts, preview.X, preview.Y))
        {
            await players.MovePreviewed(preview);
        }
        else if (facts.VisibleIn(facts.Fog))
        {
            // The token is theirs to see but the new target is not: take back an earlier
            // preview of it, so none stays behind.
            await players.MovePreviewCleared(new MovePreviewClearedEvent(preview.EncounterId, preview.TokenId, preview.ByUserId));
        }
    }

    // The preview is gone. Players hear it when the token is visible to them now; a token
    // that just stopped being visible got a TokenHidden, which drops its previews too.
    public async Task ClearedAsync(MovePreviewClearedEvent cleared, string exceptConnectionId)
    {
        await broadcaster.Hub.Clients.GroupExcept(TableGroups.Dm(cleared.EncounterId), [exceptConnectionId]).MovePreviewCleared(cleared);
        var facts = await FactsAsync(cleared.TokenId);
        if (facts is not null && facts.VisibleIn(facts.Fog))
        {
            await broadcaster.Hub.Clients.GroupExcept(TableGroups.Players(cleared.EncounterId), [exceptConnectionId]).MovePreviewCleared(cleared);
        }
    }

    // The previews a joining connection may see: the DM group all, players the visible ones.
    public async Task<List<MovePreviewEvent>> PreviewsForAsync(IEnumerable<MovePreviewEvent> previews, bool inDmGroup)
    {
        var shown = new List<MovePreviewEvent>();
        foreach (var preview in previews)
        {
            if (inDmGroup || await PreviewVisibleToPlayersAsync(preview))
            {
                shown.Add(preview);
            }
        }

        return shown;
    }

    // Pings and arrows that touch a hidden creature go to the DM group only; those on
    // cells go to everyone (knowledge/features/pings-and-arrows.md).
    public async Task PingedAsync(PingedEvent ping, string exceptConnectionId)
    {
        await broadcaster.Hub.Clients.GroupExcept(TableGroups.Dm(ping.EncounterId), [exceptConnectionId]).Pinged(ping);
        if (await TokenVisibleToPlayersAsync(ping.TokenId))
        {
            await broadcaster.Hub.Clients.GroupExcept(TableGroups.Players(ping.EncounterId), [exceptConnectionId]).Pinged(ping);
        }
    }

    public async Task ArrowDrawnAsync(ArrowDrawnEvent arrow, string exceptConnectionId)
    {
        await broadcaster.Hub.Clients.GroupExcept(TableGroups.Dm(arrow.EncounterId), [exceptConnectionId]).ArrowDrawn(arrow);
        if (await TokenVisibleToPlayersAsync(arrow.FromTokenId))
        {
            await broadcaster.Hub.Clients.GroupExcept(TableGroups.Players(arrow.EncounterId), [exceptConnectionId]).ArrowDrawn(arrow);
        }
    }

    public async Task StatusesChangedAsync(TokenStatusesChangedEvent change)
    {
        await broadcaster.Dm(change.EncounterId).TokenStatusesChanged(change);
        if (await TokenVisibleToPlayersAsync(change.TokenId))
        {
            await broadcaster.Players(change.EncounterId).TokenStatusesChanged(change);
        }
    }

    public async Task RemovedAsync(TokenRemovedEvent removed)
    {
        await broadcaster.Dm(removed.EncounterId).TokenRemoved(removed);
        if (await TokenVisibleToPlayersAsync(removed.TokenId))
        {
            await broadcaster.Players(removed.EncounterId).TokenRemoved(removed);
        }
    }

    public async Task RestoredAsync(TokenRestoredEvent restored)
    {
        await broadcaster.Dm(restored.EncounterId).TokenRestored(restored);
        var fog = await FogAsync(restored.EncounterId);
        if (TableVisibility.TokenVisible(fog, restored.Token))
        {
            await broadcaster.Players(restored.EncounterId).TokenRestored(restored);
        }
    }

    private async Task<bool> PreviewVisibleToPlayersAsync(MovePreviewEvent preview)
    {
        var facts = await FactsAsync(preview.TokenId);
        return facts is not null && PreviewVisible(facts.Fog, facts, preview.X, preview.Y);
    }

    private async Task<bool> TokenVisibleToPlayersAsync(Guid? tokenId)
    {
        if (tokenId is not { } id)
        {
            return true;
        }

        var facts = await FactsAsync(id);
        return facts is not null && facts.VisibleIn(facts.Fog);
    }

    private async Task<HashSet<(int X, int Y)>> FogAsync(Guid encounterId) =>
        FogCells.Set(await db.Encounters.AsNoTracking().Where(e => e.Id == encounterId).Select(e => e.Fog).SingleOrDefaultAsync());

    // The token and its encounter's fog as saved now.
    private async Task<TokenFacts?> FactsAsync(Guid tokenId)
    {
        var found = await db.Tokens.AsNoTracking()
            .Where(t => t.Id == tokenId)
            .Select(t => new { t.Kind, t.Hidden, t.Size, t.X, t.Y, t.Encounter.CampaignId, t.Encounter.Fog })
            .SingleOrDefaultAsync();
        return found is null
            ? null
            : new TokenFacts(found.Kind, found.Hidden, found.Size, found.X, found.Y, found.CampaignId, FogCells.Set(found.Fog));
    }

    private async Task<BoardToken> BoardTokenAsync(TokenFacts facts, Guid tokenId)
    {
        var (tokens, _) = await BoardTokens.LoadAsync(db, facts.CampaignId, db.Tokens.Where(t => t.Id == tokenId), CancellationToken.None);
        return tokens.Single();
    }

    public sealed record TokenFacts(
        TokenKind Kind, bool Hidden, CreatureSize Size, int X, int Y, Guid CampaignId, HashSet<(int X, int Y)> Fog)
    {
        public bool VisibleIn(HashSet<(int X, int Y)> fog) => TableVisibility.TokenVisible(fog, Kind, Hidden, Size, X, Y);
    }
}
