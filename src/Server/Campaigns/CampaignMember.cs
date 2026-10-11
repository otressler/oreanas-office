using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;

namespace OreanasOffice.Server.Campaigns;

// knowledge/domain/campaign-member.md
public class CampaignMember
{
    public Guid CampaignId { get; set; }

    public Guid UserId { get; set; }

    public CampaignRole Role { get; set; }

    public DateTimeOffset JoinedAt { get; set; }

    public Campaign Campaign { get; set; } = null!;

    public AppUser User { get; set; } = null!;
}

internal sealed class CampaignMemberConfiguration : IEntityTypeConfiguration<CampaignMember>
{
    public void Configure(EntityTypeBuilder<CampaignMember> member)
    {
        member.HasKey(m => new { m.CampaignId, m.UserId });
        member.HasOne(m => m.Campaign).WithMany(c => c.Members).HasForeignKey(m => m.CampaignId).OnDelete(DeleteBehavior.Cascade);
        member.HasOne(m => m.User).WithMany().HasForeignKey(m => m.UserId).OnDelete(DeleteBehavior.Restrict);
        member.HasIndex(m => m.UserId);
    }
}
