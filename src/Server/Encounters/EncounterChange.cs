using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;

namespace OreanasOffice.Server.Encounters;

// One undoable thing the session DM did at the table besides moving: a fog change, a
// creature reveal or hide, or a spawn (knowledge/features/fog-of-war.md, "Undo";
// creature-spawn.md). Saved so the undo survives a cold start. The session DM undoes their
// latest change in the encounter while it isn't undone.
public class EncounterChange
{
    // Increasing, so "latest" is the highest id.
    public long Id { get; set; }

    public Guid EncounterId { get; set; }

    public Guid ByUserId { get; set; }

    public EncounterChangeKind Kind { get; set; }

    // What it takes to put things back, as JSON: for Fog the cells that changed and which way,
    // for Reveal the token ids and the flag they had, for Spawn the new token ids.
    public required string Payload { get; set; }

    public DateTimeOffset At { get; set; }

    public DateTimeOffset? UndoneAt { get; set; }
}

public enum EncounterChangeKind
{
    Fog,
    Reveal,
    Spawn,
}

internal sealed class EncounterChangeConfiguration : IEntityTypeConfiguration<EncounterChange>
{
    public void Configure(EntityTypeBuilder<EncounterChange> change)
    {
        // No foreign key to the encounter: the encounter already cascades from its campaign.
        change.HasOne<AppUser>().WithMany().HasForeignKey(c => c.ByUserId).OnDelete(DeleteBehavior.Restrict);
        change.HasIndex(c => new { c.EncounterId, c.Id });
    }
}
