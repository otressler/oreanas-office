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
}
