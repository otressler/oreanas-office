using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Table;

namespace OreanasOffice.Server.Characters;

// Who plays a character (knowledge/domain/character.md, "Who plays it"): in a session, the
// member the session DM handed it to (SessionCharacterPlayer), otherwise its owner. Every
// table check and BoardToken.OwnerUserId use that player. The queries spell it out inline,
// since EF can't call a shared expression inside a projection:
//
//   c.SessionPlayers.Where(p => p.SessionId == sessionId).Select(p => (Guid?)p.UserId).FirstOrDefault()
//       ?? c.OwnerUserId
public static class CharacterPlayers
{
    // The player of a character changed: running fights among these reload their boards. The
    // devices join again on ReloadBoard, which also computes who's here again.
    public static async Task ChangedAsync(
        IQueryable<Encounter> encounters, TableBroadcaster table, CancellationToken cancellationToken)
    {
        var running = await encounters
            .Where(e => e.Status == EncounterStatus.Active)
            .Select(e => e.Id)
            .ToListAsync(cancellationToken);
        foreach (var encounterId in running)
        {
            await table.Everyone(encounterId).ReloadBoard(encounterId);
        }
    }
}
