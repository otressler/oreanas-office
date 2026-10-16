using System.Collections.Concurrent;

namespace OreanasOffice.Server.Table;

// The move previews shown right now, one per connection (knowledge/decisions/realtime-sync.md).
// In memory only: a preview isn't worth keeping, and after a restart every device
// reconnects without one anyway.
public sealed class TablePreviews
{
    private readonly ConcurrentDictionary<string, MovePreviewEvent> _byConnection = new();

    // Shows the connection's preview and returns the one it replaces. A connection's
    // calls run one at a time, so the two steps don't race each other.
    public MovePreviewEvent? Show(string connectionId, MovePreviewEvent preview)
    {
        _byConnection.TryGetValue(connectionId, out var replaced);
        _byConnection[connectionId] = preview;
        return replaced;
    }

    public MovePreviewEvent? Clear(string connectionId) =>
        _byConnection.TryRemove(connectionId, out var cleared) ? cleared : null;

    // Takes back every preview of the token, with the connection that showed it: the token
    // left the board (knowledge/features/removing-tokens.md). A preview replaced meanwhile
    // stays.
    public List<(string ConnectionId, MovePreviewEvent Preview)> ClearToken(Guid encounterId, Guid tokenId)
    {
        var cleared = new List<(string, MovePreviewEvent)>();
        foreach (var shown in _byConnection)
        {
            if (shown.Value.EncounterId == encounterId && shown.Value.TokenId == tokenId && _byConnection.TryRemove(shown))
            {
                cleared.Add((shown.Key, shown.Value));
            }
        }

        return cleared;
    }

    public List<MovePreviewEvent> In(Guid encounterId) =>
        [.. _byConnection.Values.Where(preview => preview.EncounterId == encounterId)];
}
