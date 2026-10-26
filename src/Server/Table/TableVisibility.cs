using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;

namespace OreanasOffice.Server.Table;

// The per-viewer filter (knowledge/features/fog-of-war.md, "Keeping secrets on the wire"):
// the one place that decides what a player's device, a spectator screen or a shared screen
// may know. Every board load and every broadcast about tokens, cells, pings and statuses
// goes through it. The server filters; the device never hides.
//
// A creature is visible when it isn't hidden and at least one cell of its footprint is
// revealed. Characters are always visible. A cell is revealed unless it is in the fog.
public static class TableVisibility
{
    // Creatures need `hidden` false and a revealed cell; characters always pass.
    public static bool TokenVisible(HashSet<(int X, int Y)> fog, TokenKind kind, bool hidden, CreatureSize size, int x, int y) =>
        kind == TokenKind.Character
        || (!hidden && (fog.Count == 0 || MapGrid.FootprintCells(size, x, y).Any(cell => !fog.Contains(cell))));

    public static bool TokenVisible(HashSet<(int X, int Y)> fog, BoardToken token) =>
        TokenVisible(fog, token.Kind, token.Hidden, token.Size, token.X, token.Y);

    // The whole footprint revealed, for a preview that may leave the DM's device.
    public static bool FootprintRevealed(HashSet<(int X, int Y)> fog, CreatureSize size, int x, int y) =>
        MapGrid.FootprintCells(size, x, y).All(cell => !fog.Contains(cell));

    // The board as players get it. Hidden creatures and removed tokens are gone, the layout
    // keeps only revealed cells and the cells under characters, a feature stays only when
    // one of its cells is revealed (then whole), entrances keep only revealed cells, and
    // the fog lists hidden cells without areas. Statuses are cut to the visible tokens. The
    // initiative list is the session DM's alone (knowledge/features/initiative.md).
    public static BoardStateResponse ForPlayers(BoardStateResponse board)
    {
        var fog = FogSet(board.Fog);
        var tokens = board.Tokens.Where(t => t.RemovedAt is null && TokenVisible(fog, t)).ToList();
        var used = tokens.SelectMany(t => t.Statuses).Select(s => s.StatusId).ToHashSet();
        var map = board.Map with { Layout = LayoutFor(board.Map.Layout, fog, tokens) };
        return board with
        {
            Viewer = BoardViewer.Player,
            IsSessionDm = false,
            Map = map,
            Tokens = tokens,
            RemovedTokens = [],
            Statuses = [.. board.Statuses.Where(s => used.Contains(s.Id))],
            Fog = board.Fog is null ? null : board.Fog with { Areas = [] },
            Initiative = null,
        };
    }

    public static MapLayout LayoutFor(MapLayout layout, HashSet<(int X, int Y)> fog, IEnumerable<BoardToken> tokens)
    {
        if (fog.Count == 0)
        {
            return layout;
        }

        var shown = new HashSet<(int X, int Y)>();
        foreach (var token in tokens.Where(t => t.Kind == TokenKind.Character))
        {
            shown.UnionWith(MapGrid.FootprintCells(token.Size, token.X, token.Y));
        }

        bool Revealed(int x, int y) => !fog.Contains((x, y)) || shown.Contains((x, y));
        return layout with
        {
            Cells = [.. layout.Cells.Where(c => Revealed(c.X, c.Y))],
            Features = [.. layout.Features.Where(f => Covered(f).Any(cell => Revealed(cell.X, cell.Y)))],
            Entrances = [.. layout.Entrances
                .Select(e => e with { Cells = [.. e.Cells.Where(c => Revealed(c[0], c[1]))] })
                .Where(e => e.Cells.Count > 0)],
        };
    }

    public static HashSet<(int X, int Y)> FogSet(FogView? fog) =>
        fog is null ? [] : [.. fog.HiddenCells.Select(c => (c.X, c.Y))];

    private static IEnumerable<(int X, int Y)> Covered(LayoutFeature feature) =>
        Enumerable.Range(0, feature.H).SelectMany(dy => Enumerable.Range(0, feature.W).Select(dx => (feature.X + dx, feature.Y + dy)));
}
