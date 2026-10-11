using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Data;

// IdentityUserContext: users, logins, claims and tokens, without Identity's role
// tables. Roles are per campaign (CampaignMember.Role), not site-wide.
public class AppDbContext(DbContextOptions<AppDbContext> options) : IdentityUserContext<AppUser, Guid>(options)
{
    public DbSet<RegistrationInvite> RegistrationInvites => Set<RegistrationInvite>();

    public DbSet<Campaign> Campaigns => Set<Campaign>();

    public DbSet<CampaignMember> CampaignMembers => Set<CampaignMember>();

    public DbSet<Character> Characters => Set<Character>();

    public DbSet<GameSession> Sessions => Set<GameSession>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(AppDbContext).Assembly);
        builder.Entity<AppUser>().Property(u => u.DisplayName).HasMaxLength(AppUser.DisplayNameMaxLength);
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder configuration)
    {
        // Enums as readable strings ("Active", "Dm"), not numbers.
        configuration.Properties<Enum>().HaveConversion<string>().HaveMaxLength(20);
    }
}
