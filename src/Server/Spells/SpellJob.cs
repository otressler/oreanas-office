using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Accounts;

namespace OreanasOffice.Server.Spells;

// knowledge/domain/spell.md, "Suggestions and revisions": one piece of work for the text model,
// queued from the admin page (knowledge/features/spell-cards.md, "Planned", steps 4 and 5) and
// worked one at a time by SpellJobWorker.
public class SpellJob
{
    public const int ErrorMaxLength = 500;

    public const int DetailMaxLength = 100;

    public Guid Id { get; set; }

    public SpellJobKind Kind { get; set; }

    public Guid SpellId { get; set; }

    // Motif and revision jobs: the variant they work on.
    public Guid? VariantId { get; set; }

    public SpellJobStatus Status { get; set; }

    // What a done job did.
    public SpellJobOutcome? Outcome { get; set; }

    // Why a failed job failed, in German for the admin page.
    public string? Error { get; set; }

    // A revision whose words changed: the first field that differed ("card.description").
    public string? Detail { get; set; }

    public int Attempts { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? StartedAt { get; set; }

    public DateTimeOffset? FinishedAt { get; set; }

    // The admin who started the run; the text model calls are recorded under them.
    public Guid CreatedByUserId { get; set; }
}

public enum SpellJobKind
{
    // A card draft from the wiki for a spell without a card, then a motif for it.
    Draft,

    // A motif suggestion for a variant without any motif.
    Motif,

    // The revision pass: the variant's card in the new form, if its words stay the same.
    Revision,
}

public enum SpellJobStatus
{
    Queued,
    Running,
    Done,
    Failed,
}

public enum SpellJobOutcome
{
    // Saved: a draft, a motif or a revised card.
    Saved,

    // Nothing to do any more (a card appeared, a motif was written meanwhile, the revision
    // changed nothing).
    Unchanged,

    // A revision that changed words: nothing saved, to look at by hand.
    WordsChanged,
}

// A machine-written card for a spell without one: not a variant until someone checks it.
public class SpellCardDraft
{
    public Guid Id { get; set; }

    public Guid SpellId { get; set; }

    public required SpellCard Card { get; set; }

    // The motif suggested for it, which the variant gets as motif A.
    public string? MotifSubject { get; set; }

    public DateTimeOffset CreatedAt { get; set; }

    public Guid CreatedByUserId { get; set; }
}

// The card as it was before the revision pass saved a new form, for "Zurücksetzen".
public class SpellCardRevision
{
    public Guid Id { get; set; }

    public Guid VariantId { get; set; }

    public required SpellCard Previous { get; set; }

    // Also the variant's UpdatedAt the revision set: putting it back is refused after an edit.
    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset? RevertedAt { get; set; }
}

internal sealed class SpellJobConfiguration :
    IEntityTypeConfiguration<SpellJob>,
    IEntityTypeConfiguration<SpellCardDraft>,
    IEntityTypeConfiguration<SpellCardRevision>
{
    public void Configure(EntityTypeBuilder<SpellJob> job)
    {
        job.Property(j => j.Error).HasMaxLength(SpellJob.ErrorMaxLength);
        job.Property(j => j.Detail).HasMaxLength(SpellJob.DetailMaxLength);
        job.HasIndex(j => new { j.Status, j.CreatedAt });
        job.HasIndex(j => new { j.SpellId, j.Kind });
        job.HasIndex(j => j.VariantId);
        job.HasOne<Spell>().WithMany().HasForeignKey(j => j.SpellId).OnDelete(DeleteBehavior.Cascade);

        // The spell's cascade already reaches its variants; one path is all SQL Server allows.
        job.HasOne<SpellVariant>().WithMany().HasForeignKey(j => j.VariantId).OnDelete(DeleteBehavior.NoAction);
        job.HasOne<AppUser>().WithMany().HasForeignKey(j => j.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    public void Configure(EntityTypeBuilder<SpellCardDraft> draft)
    {
        SpellConfiguration.AsCardJson(draft.Property(d => d.Card)).HasColumnName("CardJson");
        draft.Property(d => d.MotifSubject).HasMaxLength(SpellArtPrompt.SubjectMaxLength);
        draft.HasIndex(d => d.SpellId).IsUnique();
        draft.HasOne<Spell>().WithMany().HasForeignKey(d => d.SpellId).OnDelete(DeleteBehavior.Cascade);
        draft.HasOne<AppUser>().WithMany().HasForeignKey(d => d.CreatedByUserId).OnDelete(DeleteBehavior.Restrict);
    }

    public void Configure(EntityTypeBuilder<SpellCardRevision> revision)
    {
        SpellConfiguration.AsCardJson(revision.Property(r => r.Previous)).HasColumnName("PreviousJson");
        revision.HasIndex(r => new { r.VariantId, r.CreatedAt });
        revision.HasOne<SpellVariant>().WithMany().HasForeignKey(r => r.VariantId).OnDelete(DeleteBehavior.Cascade);
    }
}
