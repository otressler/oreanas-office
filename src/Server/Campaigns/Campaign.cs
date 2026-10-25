using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Campaigns;

// knowledge/domain/campaign.md. The active session isn't a column here: it is the
// session with status Active, and a filtered unique index on Sessions allows at
// most one per campaign (see GameSessionConfiguration).
public class Campaign
{
    public const int NameMaxLength = 80;

    public const int DescriptionMaxLength = 300;

    public Guid Id { get; set; }

    public required string Name { get; set; }

    // A few sentences for the campaign's card on the home page; it also feeds the cover
    // prompt. Null or empty when the DM wrote none.
    public string? Description { get; set; }

    // The picked cover (knowledge/domain/campaign.md): generated or uploaded, an Asset of
    // kind CampaignCover. Null shows the default picture.
    public Guid? CoverAssetId { get; set; }

    public Guid DefaultDmUserId { get; set; }

    public required string JoinCode { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public List<CampaignMember> Members { get; } = [];

    public List<GameSession> Sessions { get; } = [];

    public List<Character> Characters { get; } = [];
}

public enum CampaignRole
{
    Dm,
    Player,
}

internal sealed class CampaignConfiguration : IEntityTypeConfiguration<Campaign>
{
    public void Configure(EntityTypeBuilder<Campaign> campaign)
    {
        campaign.Property(c => c.Name).HasMaxLength(Campaign.NameMaxLength);
        campaign.Property(c => c.Description).HasMaxLength(Campaign.DescriptionMaxLength);
        campaign.HasIndex(c => c.CoverAssetId);
        campaign.Property(c => c.JoinCode).HasMaxLength(JoinCodes.Length).IsFixedLength();
        campaign.HasIndex(c => c.JoinCode).IsUnique();
        campaign.HasOne<AppUser>().WithMany().HasForeignKey(c => c.DefaultDmUserId).OnDelete(DeleteBehavior.Restrict);
    }
}
