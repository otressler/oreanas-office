using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Rules;

// SpellListClassId: the class whose spell list the subclass casts from ("wizard" for
// Eldritch Knight and Arcane Trickster), else null.
public record SubclassView(string Id, string NameEn, string NameDe, string? SpellListClassId);

// Caster: how the class casts spells, null without spellcasting of its own.
public record ClassView(string Id, string NameEn, string NameDe, SpellcastingKind? Caster, List<SubclassView> Subclasses);

// knowledge/rules/handbook-classes.md: the Handbook's classes for the character page's
// pickers and the spell filters. Reference data, the same for every user.
public static class RulesEndpoints
{
    public static IEndpointRouteBuilder MapRulesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/rules/classes", ListClasses).WithTags("Rules").RequireAuthorization();
        app.MapGlossaryEndpoints();
        return app;
    }

    private static async Task<Ok<List<ClassView>>> ListClasses(AppDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(await db.CharacterClasses.AsNoTracking()
            .OrderBy(c => c.Position)
            .Select(c => new ClassView(
                c.Id,
                c.NameEn,
                c.NameDe,
                c.Caster,
                c.Subclasses.OrderBy(s => s.Position).Select(s => new SubclassView(s.Id, s.NameEn, s.NameDe, s.SpellListClassId)).ToList()))
            .ToListAsync(cancellationToken));
}
