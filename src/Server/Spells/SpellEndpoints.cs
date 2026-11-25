using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Accounts;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Spells;

// knowledge/features/spell-cards.md: the site-wide library. Every signed-in user reads every
// spell and makes variants; only a variant's author (and site admins) changes it.
public static class SpellEndpoints
{
    public static IEndpointRouteBuilder MapSpellEndpoints(this IEndpointRouteBuilder app)
    {
        var spells = app.MapGroup("/api/spells").WithTags("Spells").RequireAuthorization();

        spells.MapGet("/", ListSpells);
        spells.MapGet("/{spellId:guid}", GetSpell);
        spells.MapPost("/variants", CreateVariant);
        spells.MapGet("/variants/{variantId:guid}", GetVariant);
        spells.MapPut("/variants/{variantId:guid}", UpdateVariant);
        spells.MapDelete("/variants/{variantId:guid}", DeleteVariant);

        return app;
    }

    internal static bool IsAdmin(this ClaimsPrincipal user) => user.HasClaim(AppClaims.Admin, "true");

    // The Handbook's spells, ordered by level and English name; the app filters and searches.
    private static async Task<Ok<List<SpellSummary>>> ListSpells(AppDbContext db, CancellationToken cancellationToken)
    {
        var rows = await db.Spells.AsNoTracking()
            .Where(s => s.InHandbook)
            .OrderBy(s => s.Level)
            .ThenBy(s => s.NameEn)
            .Select(s => new
            {
                s.Id,
                s.NameEn,
                s.NameDe,
                s.Level,
                s.School,
                Count = s.Variants.Count,
                First = s.Variants
                    .OrderByDescending(v => db.CharacterSpells.Count(c => c.VariantId == v.Id))
                    .ThenBy(v => v.CreatedAt)
                    .Select(v => new { v.Card, v.ArtAssetId })
                    .FirstOrDefault(),
            })
            .ToListAsync(cancellationToken);
        var lists = await ListsAsync(db, db.Spells.Where(s => s.InHandbook), cancellationToken);
        return TypedResults.Ok(rows
            .Select(r => new SpellSummary(
                r.Id,
                r.NameEn,
                r.Level,
                r.School,
                r.First?.Card.Name ?? r.NameDe ?? r.NameEn,
                r.First?.Card.Icon ?? "spark",
                r.Count,
                r.First?.ArtAssetId is { } art ? MapBackgrounds.Url(art) : null,
                lists.GetValueOrDefault(r.Id) ?? []))
            .ToList());
    }

    // The class lists of these spells, by spell: the class lists first, then the subclasses by level.
    private static async Task<Dictionary<Guid, List<SpellListLink>>> ListsAsync(
        AppDbContext db, IQueryable<Spell> spells, CancellationToken cancellationToken)
    {
        var entries = await db.SpellListEntries.AsNoTracking()
            .Where(e => spells.Any(s => s.Id == e.SpellId))
            .OrderBy(e => e.ClassLevel ?? 0)
            .ThenBy(e => e.ClassId)
            .ThenBy(e => e.SubclassId)
            .Select(e => new { e.SpellId, Link = new SpellListLink(e.ClassId, e.SubclassId, e.ClassLevel) })
            .ToListAsync(cancellationToken);
        return entries.GroupBy(e => e.SpellId).ToDictionary(g => g.Key, g => g.Select(e => e.Link).ToList());
    }

    private static async Task<Results<Ok<SpellDetail>, NotFound>> GetSpell(
        Guid spellId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var spell = await db.Spells.AsNoTracking().SingleOrDefaultAsync(s => s.Id == spellId, cancellationToken);
        if (spell is null)
        {
            return TypedResults.NotFound();
        }

        var variants = await ViewsAsync(
            db, db.SpellVariants.Where(v => v.SpellId == spellId).OrderBy(v => v.CreatedAt), user, cancellationToken);
        var lists = await ListsAsync(db, db.Spells.Where(s => s.Id == spellId), cancellationToken);
        return TypedResults.Ok(new SpellDetail(
            spell.Id, spell.NameEn, spell.NameDe, spell.Level, spell.School, spell.InHandbook, lists.GetValueOrDefault(spell.Id) ?? [], variants));
    }

    // 409 SpellNotInHandbook for a spell that isn't the Handbook's, 400 SpellNotFound for an
    // unknown spell or basedOnVariantId.
    private static async Task<Results<Created<SpellVariantView>, BadRequest<ApiError>, Conflict<ApiError>>> CreateVariant(
        CreateVariantRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var spell = await db.Spells.AsNoTracking()
            .Where(s => s.Id == request.SpellId)
            .Select(s => new { s.InHandbook })
            .SingleOrDefaultAsync(cancellationToken);
        if (spell is null)
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.SpellNotFound, "spellId"));
        }

        if (!spell.InHandbook)
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.SpellNotInHandbook, "spellId"));
        }

        var (card, cardError) = SpellCards.Validate(request.Card);
        if (card is null)
        {
            return TypedResults.BadRequest(cardError!);
        }

        if (request.BasedOnVariantId is { } basedOn
            && !await db.SpellVariants.AnyAsync(v => v.Id == basedOn, cancellationToken))
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.SpellNotFound, "basedOnVariantId"));
        }

        var origin = request.Origin == SpellVariantOrigin.Seed ? SpellVariantOrigin.Manual : request.Origin;
        var variant = await AddVariantAsync(
            db, request.SpellId, card, origin, request.BasedOnVariantId, null, user.GetUserId(), time.GetUtcNow(), cancellationToken);
        var view = (await ViewsAsync(db, db.SpellVariants.Where(v => v.Id == variant.Id), user, cancellationToken)).Single();
        return TypedResults.Created($"/api/spells/variants/{variant.Id}", view);
    }

    // Adds a variant to a spell of the library (HandbookSync made them all).
    internal static async Task<SpellVariant> AddVariantAsync(
        AppDbContext db,
        Guid spellId,
        SpellCard card,
        SpellVariantOrigin origin,
        Guid? basedOnVariantId,
        string? seedKey,
        Guid userId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        var variant = new SpellVariant
        {
            Id = Guid.NewGuid(),
            SpellId = spellId,
            AuthorUserId = userId,
            BasedOnVariantId = basedOnVariantId,
            Origin = origin,
            Card = card,
            SeedKey = seedKey,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.SpellVariants.Add(variant);
        await db.SaveChangesAsync(cancellationToken);
        return variant;
    }

    private static async Task<Results<Ok<SpellVariantView>, NotFound>> GetVariant(
        Guid variantId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken) =>
        (await ViewsAsync(db, db.SpellVariants.Where(v => v.Id == variantId), user, cancellationToken)).SingleOrDefault() is { } view
            ? TypedResults.Ok(view)
            : TypedResults.NotFound();

    private static async Task<Results<Ok<SpellVariantView>, NotFound, BadRequest<ApiError>, Conflict<ApiError>>> UpdateVariant(
        Guid variantId, UpdateVariantRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var variant = await db.SpellVariants.SingleOrDefaultAsync(v => v.Id == variantId, cancellationToken);
        if (variant is null)
        {
            return TypedResults.NotFound();
        }

        if (!CanEdit(variant, user))
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.NotSpellAuthor));
        }

        var (card, error) = SpellCards.Validate(request.Card);
        if (card is null)
        {
            return TypedResults.BadRequest(error!);
        }

        variant.Card = card;
        variant.UpdatedAt = time.GetUtcNow();
        await db.SaveChangesAsync(cancellationToken);
        return TypedResults.Ok((await ViewsAsync(db, db.SpellVariants.Where(v => v.Id == variantId), user, cancellationToken)).Single());
    }

    // Only while no character uses it. A spell that isn't the Handbook's goes with its last
    // variant; Handbook spells stay in the library without one. Its art rows stay for the
    // monthly limit.
    private static async Task<Results<NoContent, NotFound, Conflict<ApiError>>> DeleteVariant(
        Guid variantId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var variant = await db.SpellVariants.SingleOrDefaultAsync(v => v.Id == variantId, cancellationToken);
        if (variant is null)
        {
            return TypedResults.NotFound();
        }

        if (!CanEdit(variant, user))
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.NotSpellAuthor));
        }

        if (await db.CharacterSpells.AnyAsync(c => c.VariantId == variantId, cancellationToken))
        {
            return TypedResults.Conflict(new ApiError(ApiErrorCode.VariantInUse));
        }

        await db.SpellVariants.Where(v => v.BasedOnVariantId == variantId)
            .ExecuteUpdateAsync(set => set.SetProperty(v => v.BasedOnVariantId, (Guid?)null), cancellationToken);
        db.SpellVariants.Remove(variant);
        await db.SaveChangesAsync(cancellationToken);
        if (!await db.SpellVariants.AnyAsync(v => v.SpellId == variant.SpellId, cancellationToken))
        {
            await db.Spells.Where(s => s.Id == variant.SpellId && !s.InHandbook).ExecuteDeleteAsync(cancellationToken);
        }

        return TypedResults.NoContent();
    }

    internal static bool CanEdit(SpellVariant variant, ClaimsPrincipal user) =>
        variant.AuthorUserId == user.GetUserId() || user.IsAdmin();

    // Variants as the app sees them, in the query's order.
    internal static async Task<List<SpellVariantView>> ViewsAsync(
        AppDbContext db, IQueryable<SpellVariant> variants, ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var admin = user.IsAdmin();
        var rows = await variants.AsNoTracking()
            .Select(v => new
            {
                Variant = v,
                v.Spell.NameEn,
                v.Spell.Level,
                v.Spell.School,
                v.Author.DisplayName,
                UsedBy = db.CharacterSpells.Count(c => c.VariantId == v.Id),
            })
            .ToListAsync(cancellationToken);
        return [.. rows.Select(r => new SpellVariantView(
            r.Variant.Id,
            r.Variant.SpellId,
            r.NameEn,
            r.Level,
            r.School,
            new SpellAuthor(r.Variant.AuthorUserId, r.DisplayName),
            r.Variant.BasedOnVariantId,
            r.Variant.Origin,
            r.Variant.Card,
            r.Variant.ArtAssetId,
            r.Variant.ArtAssetId is { } art ? MapBackgrounds.Url(art) : null,
            r.Variant.ArtApproved,
            r.UsedBy,
            admin || r.Variant.AuthorUserId == userId,
            r.Variant.CreatedAt,
            r.Variant.UpdatedAt))];
    }
}
