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

    public List<MovePreviewEvent> In(Guid encounterId) =>
        [.. _byConnection.Values.Where(preview => preview.EncounterId == encounterId)];
}
