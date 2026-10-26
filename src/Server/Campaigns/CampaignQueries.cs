using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Campaigns;

public static class CampaignQueries
{
    // Whether a user is a `dm` member of the campaign: who may edit any character,
    // and who may run a session.
    public static Task<bool> IsCampaignDmAsync(
        this AppDbContext db, Guid campaignId, Guid userId, CancellationToken cancellationToken) =>
        db.CampaignMembers.AnyAsync(
            m => m.CampaignId == campaignId && m.UserId == userId && m.Role == CampaignRole.Dm, cancellationToken);

    // Whether a user is a member of the campaign in any role: who a character can be given to.
    public static Task<bool> IsCampaignMemberAsync(
        this AppDbContext db, Guid campaignId, Guid userId, CancellationToken cancellationToken) =>
        db.CampaignMembers.AnyAsync(m => m.CampaignId == campaignId && m.UserId == userId, cancellationToken);

    // Ring colours (knowledge/domain/token.md): each character's place in the order
    // characters were added to the campaign, 0, 1, 2…, by character id. The character
    // list and the board both use this, so the setup screen shows the fight's colours.
    public static async Task<Dictionary<Guid, int>> CharacterColorIndexesAsync(
        this AppDbContext db, Guid campaignId, CancellationToken cancellationToken)
    {
        var ids = await db.Characters
            .Where(c => c.CampaignId == campaignId)
            .OrderBy(c => c.CreatedAt)
            .ThenBy(c => c.Id)
            .Select(c => c.Id)
            .ToListAsync(cancellationToken);
        return ids.Select((id, index) => (id, index)).ToDictionary(p => p.id, p => p.index);
    }
}
