using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;

namespace OreanasOffice.Server.Sessions;

// knowledge/domain/session.md, "Spectators": someone who isn't a campaign member and joined
// one session with "Nur zuschauen". Gives access to that session only, for as long as it
// exists, and none to the campaign or its other sessions.
public class SessionSpectator
{
    public Guid SessionId { get; set; }

    public Guid UserId { get; set; }

    public DateTimeOffset JoinedAt { get; set; }

    public GameSession Session { get; set; } = null!;
}

internal sealed class SessionSpectatorConfiguration : IEntityTypeConfiguration<SessionSpectator>
{
    public void Configure(EntityTypeBuilder<SessionSpectator> spectator)
    {
        spectator.HasKey(s => new { s.SessionId, s.UserId });
        spectator.HasOne(s => s.Session).WithMany().HasForeignKey(s => s.SessionId).OnDelete(DeleteBehavior.Cascade);
        spectator.HasOne<AppUser>().WithMany().HasForeignKey(s => s.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}
