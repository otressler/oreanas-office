using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Encounters;

namespace OreanasOffice.Server.Table;

// Who is at the table and the colour they ping in (knowledge/features/pings-and-arrows.md,
// "Colours"). The board's People and every Pinged and ArrowDrawn take the colour from here.
public static class TablePeople
{
    // A gold no default ring has; a character's player may still pick it.
    public const string SessionDmColor = "#f5b81c";

    public const string NoCharacterColor = "#ffffff";

    // The default ring colours by ColorIndex, repeating from the ninth character. A copy of
    // CHARACTER_RINGS in src/web/src/board/palette.ts: change both together.
    public static readonly IReadOnlyList<string> CharacterRings =
    [
        "#4da3ff",
        "#4cc76a",
        "#f28c38",
        "#b07cf0",
        "#2fc4c0",
        "#f064a8",
        "#e3e05a",
        "#e8e4dc",
    ];

    // A character with a token in the encounter, removed or not: a player whose character
    // left the board keeps their colour for the rest of the fight. ColorIndex: its place
    // in the order characters were added to the campaign (CharacterColorIndexesAsync).
    public sealed record FightCharacter(Guid OwnerUserId, int ColorIndex, string? Color);

    // A character's ring: the colour its player picked, else the default by ColorIndex.
    public static string RingColor(int colorIndex, string? color) =>
        color ?? CharacterRings[((colorIndex % CharacterRings.Count) + CharacterRings.Count) % CharacterRings.Count];

    // The session DM: gold, even with a character of their own in the fight. A player: the
    // ring of their character in the fight added to the campaign first. Anyone else: white.
    public static string PingColor(Guid userId, Guid? sessionDmUserId, IEnumerable<FightCharacter> characters)
    {
        if (userId == sessionDmUserId)
        {
            return SessionDmColor;
        }

        var first = characters.Where(c => c.OwnerUserId == userId).MinBy(c => c.ColorIndex);
        return first is null ? NoCharacterColor : RingColor(first.ColorIndex, first.Color);
    }

    // Every member of the campaign, in the order they joined.
    public static async Task<List<BoardPerson>> LoadAsync(
        AppDbContext db,
        Guid campaignId,
        Guid? sessionDmUserId,
        IReadOnlyCollection<FightCharacter> characters,
        CancellationToken cancellationToken)
    {
        var members = await db.CampaignMembers.AsNoTracking()
            .Where(m => m.CampaignId == campaignId)
            .OrderBy(m => m.JoinedAt)
            .ThenBy(m => m.UserId)
            .Select(m => new { m.UserId, m.User.DisplayName })
            .ToListAsync(cancellationToken);
        return [.. members.Select(m => new BoardPerson(m.UserId, m.DisplayName, PingColor(m.UserId, sessionDmUserId, characters)))];
    }
}
