using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Spells;

// Suggestions = card drafts (and motifs for cards without one); Revision = the revision pass.
public enum SpellJobRun
{
    Suggestions,
    Revision,
}

// What to queue (knowledge/features/spell-cards.md, "Planned", steps 4 and 5). Level, ClassId
// (a class's list) and School narrow the spells like the library's filters. OnlyWithoutCard:
// suggestions only for spells without a card (drafts); unticked also motifs for the variants
// of the others that have none. OnlyUnrevised: the revision pass skips cards it did already.
public record SpellJobsRequest(
    SpellJobRun Run,
    int? Level = null,
    string? ClassId = null,
    SpellSchool? School = null,
    bool OnlyWithoutCard = true,
    bool OnlyUnrevised = true);

// How many jobs of each kind the request makes, and what they should cost.
public record SpellJobsPlan(int Drafts, int Motifs, int Revisions, decimal EstimatedUsd);

public record SpellJobCounts(SpellJobKind Kind, int Queued, int Running, int Done, int Failed);

// SpellName: the variant's card name, or the spell's German or English name.
public record SpellJobView(
    Guid Id,
    SpellJobKind Kind,
    Guid SpellId,
    Guid? VariantId,
    string SpellName,
    SpellJobStatus Status,
    SpellJobOutcome? Outcome,
    string? Error,
    string? Detail,
    DateTimeOffset? FinishedAt);

// CanRevert: the card wasn't edited since the revision.
public record SpellCardRevisionView(Guid Id, Guid VariantId, Guid SpellId, string Name, DateTimeOffset CreatedAt, bool CanRevert);

// The admin page's view of the queue: counts per kind, failed jobs, revisions whose words
// changed (to check by hand) and the revised cards that can be put back.
public record SpellJobsOverview(
    bool TextModel,
    ImageBudgetResponse Budget,
    List<SpellJobCounts> Counts,
    List<SpellJobView> Failed,
    List<SpellJobView> ToCheck,
    List<SpellCardRevisionView> Revisions);

public static class SpellJobEndpoints
{
    // Before there are earlier calls of a kind to average: generous guesses in USD.
    private static readonly Dictionary<string, decimal> GuessUsd = new()
    {
        ["spell-wiki"] = 0.003m,
        ["spell-motif"] = 0.001m,
        ["spell-revise"] = 0.003m,
    };

    public static IEndpointRouteBuilder MapSpellJobEndpoints(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/admin/spells").WithTags("Admin").RequireAuthorization(Policies.Admin);
        admin.MapGet("/jobs", Overview);
        admin.MapPost("/jobs/plan", Plan);
        admin.MapPost("/jobs", Start);
        admin.MapPost("/jobs/retry", RetryAll);
        admin.MapPost("/jobs/{jobId:guid}/retry", Retry);
        admin.MapPost("/revisions/{revisionId:guid}/revert", Revert);
        app.MapDelete("/api/spells/drafts/{draftId:guid}", DiscardDraft).WithTags("Spells").RequireAuthorization(Policies.Admin);
        return app;
    }

    private static async Task<Ok<SpellJobsOverview>> Overview(
        AppDbContext db, SpellImport import, IOptions<ImageOptions> options, TimeProvider time, CancellationToken cancellationToken)
    {
        var counts = await db.SpellJobs.AsNoTracking()
            .GroupBy(j => new { j.Kind, j.Status })
            .Select(g => new { g.Key.Kind, g.Key.Status, Count = g.Count() })
            .ToListAsync(cancellationToken);
        int Count(SpellJobKind kind, SpellJobStatus status) => counts.SingleOrDefault(c => c.Kind == kind && c.Status == status)?.Count ?? 0;

        var failed = await ViewsAsync(db, db.SpellJobs.Where(j => j.Status == SpellJobStatus.Failed), cancellationToken);
        var toCheck = await ViewsAsync(
            db,
            db.SpellJobs.Where(j => j.Kind == SpellJobKind.Revision && j.Outcome == SpellJobOutcome.WordsChanged
                // A card revised or checked since is no longer to check.
                && !db.SpellJobs.Any(later => later.VariantId == j.VariantId && later.Kind == SpellJobKind.Revision && later.CreatedAt > j.CreatedAt)),
            cancellationToken);
        var revisions = await db.SpellCardRevisions.AsNoTracking()
            .Where(r => r.RevertedAt == null)
            .Join(db.SpellVariants, r => r.VariantId, v => v.Id, (r, v) => new { r.Id, r.VariantId, v.SpellId, v.Card, r.CreatedAt, v.UpdatedAt })
            .OrderBy(r => r.CreatedAt)
            .ToListAsync(cancellationToken);
        return TypedResults.Ok(new SpellJobsOverview(
            import.Available,
            await MapBackgrounds.BudgetAsync(db, options.Value, time, cancellationToken),
            [.. Enum.GetValues<SpellJobKind>().Select(k => new SpellJobCounts(
                k, Count(k, SpellJobStatus.Queued), Count(k, SpellJobStatus.Running), Count(k, SpellJobStatus.Done), Count(k, SpellJobStatus.Failed)))],
            failed,
            toCheck,
            [.. revisions.Select(r => new SpellCardRevisionView(
                r.Id, r.VariantId, r.SpellId, SpellCards.WithoutBreakPoints(r.Card.Name), r.CreatedAt, r.UpdatedAt == r.CreatedAt))]));
    }

    private static async Task<List<SpellJobView>> ViewsAsync(AppDbContext db, IQueryable<SpellJob> jobs, CancellationToken cancellationToken)
    {
        var rows = await jobs.AsNoTracking()
            .OrderBy(j => j.CreatedAt)
            .Select(j => new
            {
                Job = j,
                Spell = db.Spells.Where(s => s.Id == j.SpellId).Select(s => s.NameDe ?? s.NameEn).Single(),
                Card = db.SpellVariants.Where(v => v.Id == j.VariantId).Select(v => v.Card).SingleOrDefault(),
            })
            .Take(200)
            .ToListAsync(cancellationToken);
        return [.. rows.Select(r => new SpellJobView(
            r.Job.Id,
            r.Job.Kind,
            r.Job.SpellId,
            r.Job.VariantId,
            r.Card is { } card ? SpellCards.WithoutBreakPoints(card.Name) : r.Spell,
            r.Job.Status,
            r.Job.Outcome,
            r.Job.Error,
            r.Job.Detail,
            r.Job.FinishedAt))];
    }

    private static async Task<Ok<SpellJobsPlan>> Plan(SpellJobsRequest request, AppDbContext db, CancellationToken cancellationToken)
    {
        var (drafts, motifs, revisions) = await SelectAsync(db, request, cancellationToken);
        return TypedResults.Ok(await EstimateAsync(db, drafts.Count, motifs.Count, revisions.Count, cancellationToken));
    }

    // 202 with what was queued. 409 TextModelUnavailable without a text model, and
    // ImageBudgetExhausted when the month's budget is used up.
    private static async Task<Results<Accepted<SpellJobsPlan>, Conflict<ApiError>>> Start(
        SpellJobsRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        SpellImport import,
        SpellJobQueue queue,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        if (!import.Available)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.TextModelUnavailable));
        }

        if (!await import.BudgetLeftAsync(cancellationToken))
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.ImageBudgetExhausted));
        }

        var (drafts, motifs, revisions) = await SelectAsync(db, request, cancellationToken);
        var userId = user.GetUserId();
        var now = time.GetUtcNow();
        var order = 0;
        SpellJob Job(SpellJobKind kind, Guid spellId, Guid? variantId) => new()
        {
            Id = Guid.NewGuid(),
            Kind = kind,
            SpellId = spellId,
            VariantId = variantId,
            Status = SpellJobStatus.Queued,
            // In the library's order: a tick apart, so the worker keeps it.
            CreatedAt = now.AddTicks(order++),
            CreatedByUserId = userId,
        };
        db.SpellJobs.AddRange(drafts.Select(id => Job(SpellJobKind.Draft, id, null)));
        db.SpellJobs.AddRange(motifs.Select(v => Job(SpellJobKind.Motif, v.SpellId, v.Id)));
        db.SpellJobs.AddRange(revisions.Select(v => Job(SpellJobKind.Revision, v.SpellId, v.Id)));
        await db.SaveChangesAsync(cancellationToken);
        queue.Notify();
        return TypedResults.Accepted("/api/admin/spells/jobs", await EstimateAsync(db, drafts.Count, motifs.Count, revisions.Count, cancellationToken));
    }

    private sealed record VariantRef(Guid Id, Guid SpellId);

    // The spells and variants the request means, in the library's order, without those with an
    // open job of the same kind.
    private static async Task<(List<Guid> Drafts, List<VariantRef> Motifs, List<VariantRef> Revisions)> SelectAsync(
        AppDbContext db, SpellJobsRequest request, CancellationToken cancellationToken)
    {
        var spells = db.Spells.Where(s => s.InHandbook);
        if (request.Level is { } level)
        {
            spells = spells.Where(s => s.Level == level);
        }

        if (request.School is { } school)
        {
            spells = spells.Where(s => s.School == school);
        }

        if (!string.IsNullOrWhiteSpace(request.ClassId))
        {
            spells = spells.Where(s => db.SpellListEntries.Any(e => e.SpellId == s.Id && e.ClassId == request.ClassId && e.SubclassId == null));
        }

        var open = db.SpellJobs.Where(j => j.Status == SpellJobStatus.Queued || j.Status == SpellJobStatus.Running);
        var variants = db.SpellVariants.Where(v => spells.Any(s => s.Id == v.SpellId));
        if (request.Run == SpellJobRun.Revision)
        {
            var revise = variants.Where(v => !open.Any(j => j.Kind == SpellJobKind.Revision && j.VariantId == v.Id));
            if (request.OnlyUnrevised)
            {
                revise = revise.Where(v => !db.SpellJobs.Any(j => j.Kind == SpellJobKind.Revision && j.VariantId == v.Id && j.Status == SpellJobStatus.Done));
            }

            return ([], [], await InOrder(revise).ToListAsync(cancellationToken));
        }

        var drafts = await spells
            .Where(s => !s.Variants.Any()
                && !db.SpellCardDrafts.Any(d => d.SpellId == s.Id)
                && !open.Any(j => j.Kind == SpellJobKind.Draft && j.SpellId == s.Id))
            .OrderBy(s => s.Level)
            .ThenBy(s => s.NameEn)
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);
        var motifs = request.OnlyWithoutCard
            ? []
            : await InOrder(variants.Where(v => !db.SpellArtPrompts.Any(p => p.VariantId == v.Id)
                    && !open.Any(j => j.Kind == SpellJobKind.Motif && j.VariantId == v.Id)))
                .ToListAsync(cancellationToken);
        return (drafts, motifs, []);
    }

    private static IQueryable<VariantRef> InOrder(IQueryable<SpellVariant> variants) =>
        variants
            .OrderBy(v => v.Spell.Level)
            .ThenBy(v => v.Spell.NameEn)
            .ThenBy(v => v.CreatedAt)
            .Select(v => new VariantRef(v.Id, v.SpellId));

    // The average cost of earlier successful calls of each kind, else a guess.
    private static async Task<SpellJobsPlan> EstimateAsync(AppDbContext db, int drafts, int motifs, int revisions, CancellationToken cancellationToken)
    {
        var purposes = GuessUsd.Keys.ToList();
        var averages = await db.TextModelCalls.AsNoTracking()
            .Where(c => c.Succeeded && purposes.Contains(c.Purpose))
            .GroupBy(c => c.Purpose)
            .Select(g => new { Purpose = g.Key, Average = g.Average(c => c.CostUsd) })
            .ToDictionaryAsync(a => a.Purpose, a => a.Average, cancellationToken);
        decimal Cost(string purpose) => averages.TryGetValue(purpose, out var average) && average > 0 ? average : GuessUsd[purpose];
        var estimate = (drafts * (Cost("spell-wiki") + Cost("spell-motif"))) + (motifs * Cost("spell-motif")) + (revisions * Cost("spell-revise"));
        return new SpellJobsPlan(drafts, motifs, revisions, Math.Round(estimate, 4));
    }

    private static async Task<NoContent> RetryAll(AppDbContext db, SpellJobQueue queue, CancellationToken cancellationToken)
    {
        await db.SpellJobs
            .Where(j => j.Status == SpellJobStatus.Failed)
            .ExecuteUpdateAsync(set => set.SetProperty(j => j.Status, SpellJobStatus.Queued).SetProperty(j => j.Error, (string?)null), cancellationToken);
        queue.Notify();
        return TypedResults.NoContent();
    }

    // 404 for a job that isn't failed (any more).
    private static async Task<Results<NoContent, NotFound>> Retry(Guid jobId, AppDbContext db, SpellJobQueue queue, CancellationToken cancellationToken)
    {
        var updated = await db.SpellJobs
            .Where(j => j.Id == jobId && j.Status == SpellJobStatus.Failed)
            .ExecuteUpdateAsync(set => set.SetProperty(j => j.Status, SpellJobStatus.Queued).SetProperty(j => j.Error, (string?)null), cancellationToken);
        if (updated == 0)
        {
            return TypedResults.NotFound();
        }

        queue.Notify();
        return TypedResults.NoContent();
    }

    // Puts the card back as it was before the revision. 409 RevisionOutdated once the card was
    // edited after it; 404 for an unknown or reverted revision.
    private static async Task<Results<NoContent, NotFound, Conflict<ApiError>>> Revert(
        Guid revisionId, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var revision = await db.SpellCardRevisions.SingleOrDefaultAsync(r => r.Id == revisionId && r.RevertedAt == null, cancellationToken);
        var variant = revision is null ? null : await db.SpellVariants.SingleOrDefaultAsync(v => v.Id == revision.VariantId, cancellationToken);
        if (revision is null || variant is null)
        {
            return TypedResults.NotFound();
        }

        if (variant.UpdatedAt != revision.CreatedAt)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.RevisionOutdated));
        }

        var now = time.GetUtcNow();
        variant.Card = revision.Previous;
        variant.UpdatedAt = now;
        revision.RevertedAt = now;
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    private static async Task<Results<NoContent, NotFound>> DiscardDraft(Guid draftId, AppDbContext db, CancellationToken cancellationToken) =>
        await db.SpellCardDrafts.Where(d => d.Id == draftId).ExecuteDeleteAsync(cancellationToken) == 0
            ? TypedResults.NotFound()
            : TypedResults.NoContent();
}
