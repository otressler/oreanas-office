using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Campaigns;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Spells;

// knowledge/domain/spell.md, "Character spell": every member reads a character's spells;
// whoever may edit the character (its owner, `dm` members) adds, switches, prepares and
// removes them.
public static class CharacterSpellEndpoints
{
    public static IEndpointRouteBuilder MapCharacterSpellEndpoints(this IEndpointRouteBuilder app)
    {
        var spells = app.MapGroup("/api/campaigns/{campaignId:guid}/characters/{characterId:guid}/spells")
            .WithTags("Spells")
            .RequireAuthorization(Policies.CampaignMember);

        spells.MapGet("/", ListSpells);
        spells.MapPut("/{spellId:guid}", SetSpell);
        spells.MapDelete("/{spellId:guid}", RemoveSpell);

        // Every character's spells in the campaign at once, for the gallery at the table.
        app.MapGet("/api/campaigns/{campaignId:guid}/character-spells", ListCampaignSpells)
            .WithTags("Spells")
            .RequireAuthorization(Policies.CampaignMember);

        return app;
    }

    private static async Task<Results<Ok<List<CharacterSpellView>>, NotFound>> ListSpells(
        Guid campaignId, Guid characterId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        if (!await db.Characters.AnyAsync(c => c.Id == characterId && c.CampaignId == campaignId, cancellationToken))
        {
            return TypedResults.NotFound();
        }

        var all = await ViewsAsync(db, [characterId], user, cancellationToken);
        return TypedResults.Ok(all.GetValueOrDefault(characterId, []));
    }

    private static async Task<Ok<Dictionary<Guid, List<CharacterSpellView>>>> ListCampaignSpells(
        Guid campaignId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        var ids = await db.Characters.Where(c => c.CampaignId == campaignId).Select(c => c.Id).ToListAsync(cancellationToken);
        return TypedResults.Ok(await ViewsAsync(db, ids, user, cancellationToken));
    }

    private static async Task<Results<Ok<CharacterSpellView>, NotFound, ForbidHttpResult, BadRequest<ApiError>>> SetSpell(
        Guid campaignId,
        Guid characterId,
        Guid spellId,
        SetCharacterSpellRequest request,
        ClaimsPrincipal user,
        AppDbContext db,
        TimeProvider time,
        CancellationToken cancellationToken)
    {
        switch (await AccessAsync(db, campaignId, characterId, user, cancellationToken))
        {
            case Access.NotFound:
                return TypedResults.NotFound();
            case Access.ReadOnly:
                return TypedResults.Forbid();
        }

        if (!await db.SpellVariants.AnyAsync(v => v.Id == request.VariantId && v.SpellId == spellId, cancellationToken))
        {
            return TypedResults.BadRequest(new ApiError(ApiErrorCode.SpellNotFound, "variantId"));
        }

        var entry = await db.CharacterSpells
            .SingleOrDefaultAsync(e => e.CharacterId == characterId && e.SpellId == spellId, cancellationToken);
        if (entry is null)
        {
            entry = new CharacterSpell
            {
                Id = Guid.NewGuid(),
                CharacterId = characterId,
                SpellId = spellId,
                VariantId = request.VariantId,
                Prepared = request.Prepared ?? false,
                AddedAt = time.GetUtcNow(),
            };
            db.CharacterSpells.Add(entry);
        }
        else
        {
            entry.VariantId = request.VariantId;
            entry.Prepared = request.Prepared ?? entry.Prepared;
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException) when (db.Entry(entry).State == EntityState.Added)
        {
            // Two adds at once: the other one won the unique index; set this request's values
            // on it.
            db.ChangeTracker.Clear();
            var other = await db.CharacterSpells.SingleAsync(e => e.CharacterId == characterId && e.SpellId == spellId, cancellationToken);
            other.VariantId = request.VariantId;
            other.Prepared = request.Prepared ?? other.Prepared;
            await db.SaveChangesAsync(cancellationToken);
        }

        var views = await ViewsAsync(db, [characterId], user, cancellationToken);
        return TypedResults.Ok(views[characterId].Single(v => v.SpellId == spellId));
    }

    private static async Task<Results<NoContent, NotFound, ForbidHttpResult>> RemoveSpell(
        Guid campaignId, Guid characterId, Guid spellId, ClaimsPrincipal user, AppDbContext db, CancellationToken cancellationToken)
    {
        switch (await AccessAsync(db, campaignId, characterId, user, cancellationToken))
        {
            case Access.NotFound:
                return TypedResults.NotFound();
            case Access.ReadOnly:
                return TypedResults.Forbid();
        }

        await db.CharacterSpells
            .Where(e => e.CharacterId == characterId && e.SpellId == spellId)
            .ExecuteDeleteAsync(cancellationToken);
        return TypedResults.NoContent();
    }

    private enum Access
    {
        NotFound,
        ReadOnly,
        Edit,
    }

    private static async Task<Access> AccessAsync(
        AppDbContext db, Guid campaignId, Guid characterId, ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var owner = await db.Characters
            .Where(c => c.Id == characterId && c.CampaignId == campaignId)
            .Select(c => (Guid?)c.OwnerUserId)
            .SingleOrDefaultAsync(cancellationToken);
        if (owner is null)
        {
            return Access.NotFound;
        }

        var userId = user.GetUserId();
        return owner == userId || await db.IsCampaignDmAsync(campaignId, userId, cancellationToken) ? Access.Edit : Access.ReadOnly;
    }

    // Per character, ordered by level, then German name.
    private static async Task<Dictionary<Guid, List<CharacterSpellView>>> ViewsAsync(
        AppDbContext db, List<Guid> characterIds, ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var entries = await db.CharacterSpells.AsNoTracking()
            .Where(e => characterIds.Contains(e.CharacterId))
            .Select(e => new { e.CharacterId, e.SpellId, e.VariantId, e.Prepared, e.AddedAt })
            .ToListAsync(cancellationToken);
        var variantIds = entries.Select(e => e.VariantId).Distinct().ToList();
        var variants = (await SpellEndpoints.ViewsAsync(db, db.SpellVariants.Where(v => variantIds.Contains(v.Id)), user, cancellationToken))
            .ToDictionary(v => v.Id);
        return entries
            .GroupBy(e => e.CharacterId)
            .ToDictionary(
                g => g.Key,
                g => g
                    .Select(e => new CharacterSpellView(e.SpellId, e.Prepared, e.AddedAt, variants[e.VariantId]))
                    .OrderBy(v => v.Variant.Level)
                    .ThenBy(v => v.Variant.Card.Name, StringComparer.CurrentCultureIgnoreCase)
                    .ToList());
    }
}
