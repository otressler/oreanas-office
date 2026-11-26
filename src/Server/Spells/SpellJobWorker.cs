using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Spells;

// Works the suggestion queue one job at a time (knowledge/features/spell-cards.md, "Planned",
// steps 4 and 5): card drafts from the wiki with a motif, motifs for cards without one, and the
// revision pass. Woken by SpellJobQueue when jobs are added and once at startup, where jobs cut
// off by a restart go back to the queue; it never polls the database
// (knowledge/decisions/hosting.md). A failed job stays failed until an admin tries it again.
public sealed class SpellJobWorker(
    IServiceScopeFactory scopes,
    SpellJobQueue queue,
    DatabaseState database,
    ITextModelClient model,
    IOptions<ImageOptions> options,
    TimeProvider time,
    ILogger<SpellJobWorker> logger) : BackgroundService
{
    private static readonly TimeSpan MigrationCheckInterval = TimeSpan.FromMilliseconds(200);

    private readonly ImageOptions _options = options.Value;

    // When the last wiki page was fetched, in memory.
    private DateTimeOffset? _lastWikiFetch;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();
        if (!model.Configured)
        {
            logger.LogInformation("No text model configured; spell jobs won't run");
            return;
        }

        while (database.Status == MigrationStatus.Migrating)
        {
            await Task.Delay(MigrationCheckInterval, time, stoppingToken);
        }

        if (database.Status != MigrationStatus.Migrated)
        {
            logger.LogWarning("The database isn't available; spell jobs won't run");
            return;
        }

        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var requeued = await db.SpellJobs
                .Where(j => j.Status == SpellJobStatus.Running)
                .ExecuteUpdateAsync(set => set.SetProperty(j => j.Status, SpellJobStatus.Queued), stoppingToken);
            if (requeued > 0)
            {
                logger.LogInformation("Put {Count} spell jobs cut off by a restart back in the queue", requeued);
            }
        }
        catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
        {
            logger.LogError(ex, "Couldn't put spell jobs cut off by a restart back in the queue");
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (await NextJobAsync(stoppingToken) is { } jobId)
                {
                    await RunAsync(jobId, stoppingToken);
                    continue;
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "The spell job worker hit an error; waiting for the next job");
            }

            try
            {
                await queue.WaitAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    private async Task<Guid?> NextJobAsync(CancellationToken cancellationToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.SpellJobs
            .Where(j => j.Status == SpellJobStatus.Queued)
            .OrderBy(j => j.CreatedAt)
            .ThenBy(j => j.Id)
            .Select(j => (Guid?)j.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task RunAsync(Guid jobId, CancellationToken stoppingToken)
    {
        await using var scope = scopes.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var import = scope.ServiceProvider.GetRequiredService<SpellImport>();
        var job = await db.SpellJobs.SingleAsync(j => j.Id == jobId, stoppingToken);
        if (job.Status != SpellJobStatus.Queued)
        {
            return;
        }

        job.Status = SpellJobStatus.Running;
        job.StartedAt = time.GetUtcNow();
        job.Attempts += 1;
        await db.SaveChangesAsync(stoppingToken);

        JobResult result;
        try
        {
            result = !await import.BudgetLeftAsync(stoppingToken)
                ? JobResult.Fail("Das KI-Budget des Monats ist aufgebraucht.")
                : job.Kind switch
                {
                    SpellJobKind.Draft => await DraftAsync(db, import, job, stoppingToken),
                    SpellJobKind.Motif => await MotifAsync(db, import, job, stoppingToken),
                    _ => await ReviseAsync(db, import, job, stoppingToken),
                };
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Shutting down: the job stays Running and goes back to the queue at the next start.
            throw;
        }
        catch (SpellImportException ex)
        {
            result = JobResult.Fail(ex.Refused ? $"Das Textmodell hat abgelehnt: {ex.Message}" : $"Textmodell oder Wiki: {ex.Message}");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Spell job {JobId} broke", job.Id);
            result = JobResult.Fail($"Unerwarteter Fehler: {ex.Message}");
        }

        // Saving the result mustn't be stopped by a shutdown that begins now: the model was paid.
        db.ChangeTracker.Clear();
        var done = await db.SpellJobs.SingleAsync(j => j.Id == jobId, CancellationToken.None);
        done.Status = result.Error is null ? SpellJobStatus.Done : SpellJobStatus.Failed;
        done.Outcome = result.Outcome;
        done.Error = result.Error is { } error ? Cut(error, SpellJob.ErrorMaxLength) : null;
        done.Detail = result.Detail;
        done.FinishedAt = time.GetUtcNow();
        await db.SaveChangesAsync(CancellationToken.None);
        logger.LogInformation(
            "Spell job {JobId} ({Kind}) for spell {SpellId}: {Status} {Outcome} {Error}",
            job.Id, job.Kind, job.SpellId, done.Status, done.Outcome, done.Error);
    }

    // A draft from the wiki, then a motif for it; the motif failing doesn't lose the draft.
    private async Task<JobResult> DraftAsync(AppDbContext db, SpellImport import, SpellJob job, CancellationToken cancellationToken)
    {
        var spell = await db.Spells.AsNoTracking()
            .Where(s => s.Id == job.SpellId)
            .Select(s => new
            {
                Match = new HandbookMatch(s.Id, s.NameEn, s.Slug ?? "", s.Level, s.School, s.Variants.Count, s.NameDe),
                HasDraft = db.SpellCardDrafts.Any(d => d.SpellId == s.Id),
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (spell is null)
        {
            return JobResult.Fail("Den Zauber gibt es nicht mehr.");
        }

        if (spell.Match.VariantCount > 0 || spell.HasDraft)
        {
            return JobResult.Done(SpellJobOutcome.Unchanged);
        }

        await WaitForWikiAsync(cancellationToken);
        var page = await import.WikiPageAsync(spell.Match.Slug, cancellationToken);
        if (page is null)
        {
            return JobResult.Fail("Diesen Zauber gibt es im Wiki nicht.");
        }

        var draft = await import.DraftFromWikiAsync(spell.Match, page, job.CreatedByUserId, cancellationToken);
        if (draft is null)
        {
            return JobResult.Fail("Das Textmodell hat keine Karte geschrieben.");
        }

        string? motif = null;
        try
        {
            motif = await import.SuggestMotifAsync(
                new SpellMotifInput(
                    spell.Match.NameEn, spell.Match.Level, spell.Match.School, draft.Card,
                    await import.ClassNamesAsync(job.SpellId, cancellationToken), [], [], spell.Match.NameDe),
                job.CreatedByUserId,
                cancellationToken);
        }
        catch (SpellImportException ex)
        {
            logger.LogWarning("Spell job {JobId}: no motif for the draft: {Message}", job.Id, ex.Message);
        }

        db.SpellCardDrafts.Add(new SpellCardDraft
        {
            Id = Guid.NewGuid(),
            SpellId = job.SpellId,
            Card = draft.Card,
            MotifSubject = motif,
            CreatedAt = time.GetUtcNow(),
            CreatedByUserId = job.CreatedByUserId,
        });
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (Campaigns.UniqueIndex.IsViolation(ex))
        {
            // Another run wrote one at the same time.
            return JobResult.Done(SpellJobOutcome.Unchanged);
        }

        return JobResult.Done(SpellJobOutcome.Saved);
    }

    // Motif A for a variant that still has no motif, as a suggestion.
    private async Task<JobResult> MotifAsync(AppDbContext db, SpellImport import, SpellJob job, CancellationToken cancellationToken)
    {
        var variant = await db.SpellVariants.AsNoTracking()
            .Where(v => v.Id == job.VariantId)
            .Select(v => new
            {
                v.Card,
                v.SpellId,
                v.Spell.NameEn,
                v.Spell.NameDe,
                v.Spell.Level,
                v.Spell.School,
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (variant is null)
        {
            return JobResult.Fail("Die Karte gibt es nicht mehr.");
        }

        if (await HasMotifAsync(db, job.VariantId!.Value, cancellationToken))
        {
            return JobResult.Done(SpellJobOutcome.Unchanged);
        }

        var subject = await import.SuggestMotifAsync(
            new SpellMotifInput(
                variant.NameEn, variant.Level, variant.School, variant.Card,
                await import.ClassNamesAsync(variant.SpellId, cancellationToken), [], [], variant.NameDe),
            job.CreatedByUserId,
            cancellationToken);
        if (subject is null)
        {
            return JobResult.Fail("Das Textmodell hat kein Motiv geschrieben.");
        }

        // The author may have written one while the model thought.
        if (await HasMotifAsync(db, job.VariantId.Value, cancellationToken))
        {
            return JobResult.Done(SpellJobOutcome.Unchanged);
        }

        db.SpellArtPrompts.Add(new SpellArtPrompt
        {
            Id = Guid.NewGuid(),
            VariantId = job.VariantId.Value,
            Letter = "a",
            Subject = subject,
            Source = SpellArtPromptSource.Suggestion,
            CreatedAt = time.GetUtcNow(),
            CreatedByUserId = job.CreatedByUserId,
        });
        await db.SaveChangesAsync(cancellationToken);
        return JobResult.Done(SpellJobOutcome.Saved);
    }

    private static Task<bool> HasMotifAsync(AppDbContext db, Guid variantId, CancellationToken cancellationToken) =>
        db.SpellArtPrompts.AnyAsync(p => p.VariantId == variantId, cancellationToken);

    // The card in the new form when its words stay the same, with the old card kept for undo.
    private async Task<JobResult> ReviseAsync(AppDbContext db, SpellImport import, SpellJob job, CancellationToken cancellationToken)
    {
        var variant = await db.SpellVariants.AsNoTracking()
            .Where(v => v.Id == job.VariantId)
            .Select(v => new
            {
                v.Card,
                v.UpdatedAt,
                v.Spell.NameEn,
                v.Spell.NameDe,
                v.Spell.Level,
                v.Spell.School,
            })
            .SingleOrDefaultAsync(cancellationToken);
        if (variant is null)
        {
            return JobResult.Fail("Die Karte gibt es nicht mehr.");
        }

        var proposed = await import.ReviseCardAsync(
            variant.NameEn,
            variant.Level,
            variant.School,
            variant.Card,
            job.CreatedByUserId,
            cancellationToken,
            variant.NameDe);
        if (proposed is null)
        {
            return JobResult.Fail("Das Textmodell hat keine Karte geschrieben.");
        }

        var (merged, changed) = SpellCardRevise.Merge(variant.Card, proposed);
        if (changed is not null)
        {
            return new JobResult(SpellJobOutcome.WordsChanged, null, changed);
        }

        var (card, error) = SpellCards.Validate(merged);
        if (card is null)
        {
            return JobResult.Fail($"Die überarbeitete Karte verletzt eine Regel ({error!.Field}).");
        }

        if (SpellCardRevise.Same(card, variant.Card))
        {
            return JobResult.Done(SpellJobOutcome.Unchanged);
        }

        var saved = await db.SpellVariants.SingleOrDefaultAsync(v => v.Id == job.VariantId, cancellationToken);
        if (saved is null)
        {
            return JobResult.Fail("Die Karte gibt es nicht mehr.");
        }

        if (saved.UpdatedAt != variant.UpdatedAt)
        {
            return JobResult.Fail("Die Karte wurde inzwischen geändert.");
        }

        var now = time.GetUtcNow();
        db.SpellCardRevisions.Add(new SpellCardRevision { Id = Guid.NewGuid(), VariantId = saved.Id, Previous = variant.Card, CreatedAt = now });
        saved.Card = card;
        saved.UpdatedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        return JobResult.Done(SpellJobOutcome.Saved);
    }

    private async Task WaitForWikiAsync(CancellationToken cancellationToken)
    {
        if (_lastWikiFetch is { } last && last + _options.SpellWikiInterval - time.GetUtcNow() is { } wait && wait > TimeSpan.Zero)
        {
            await Task.Delay(wait, time, cancellationToken);
        }

        _lastWikiFetch = time.GetUtcNow();
    }

    private static string Cut(string text, int max) => text.Length <= max ? text : text[..max];

    private sealed record JobResult(SpellJobOutcome? Outcome, string? Error, string? Detail = null)
    {
        public static JobResult Done(SpellJobOutcome outcome) => new(outcome, null);

        public static JobResult Fail(string error) => new(null, error);
    }
}

// The worker's doorbell: starting or retrying jobs rings it after saving them.
public sealed class SpellJobQueue
{
    private readonly SemaphoreSlim _signal = new(0);

    public void Notify()
    {
        if (_signal.CurrentCount == 0)
        {
            _signal.Release();
        }
    }

    public Task WaitAsync(CancellationToken cancellationToken) => _signal.WaitAsync(cancellationToken);
}
