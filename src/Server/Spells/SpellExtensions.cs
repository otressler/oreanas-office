using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection.Extensions;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Spells;

// One spell of the spell-cards app (knowledge/features/spell-cards.md, "Seeding"): Key is
// its id there ("moonbeam"); Prompts its art motifs. Level and school are ignored: the
// Handbook's count.
public record SeedSpell(string Key, string NameEn, int Level, SpellSchool School, SpellCard Card, List<SeedPrompt>? Prompts);

public record SeedPrompt(string Letter, string Subject);

public record SeedSpellsRequest(List<SeedSpell> Spells);

// Variants: the seeded variant of every key, new or from an earlier upload, for the art
// upload that follows. Rejected: keys whose card broke a rule, with the field, and spells
// that aren't the Handbook's ("nameEn").
public record SeedSpellsResponse(Dictionary<string, Guid> Variants, int Created, Dictionary<string, string> Rejected);

public static class SpellExtensions
{
    // Tests replace ITextModelClient with a fake and the wiki's handler with a stub.
    public static WebApplicationBuilder AddSpells(this WebApplicationBuilder builder)
    {
        builder.Services.AddHttpClient<FoundryTextModelClient>(http => http.Timeout = TimeSpan.FromMinutes(3));
        builder.Services.TryAddTransient<ITextModelClient>(services => services.GetRequiredService<FoundryTextModelClient>());
        builder.Services.AddHttpClient(SpellImport.WikiClient, http =>
        {
            http.Timeout = TimeSpan.FromSeconds(30);
            http.DefaultRequestHeaders.UserAgent.ParseAdd("OreanasOffice-SpellImport/1.0");
        });
        builder.Services.AddScoped<SpellImport>();
        return builder;
    }

    public static IEndpointRouteBuilder MapSpells(this IEndpointRouteBuilder app)
    {
        app.MapSpellImportEndpoints();
        app.MapSpellEndpoints();
        app.MapCharacterSpellEndpoints();
        app.MapSpellArtEndpoints();
        app.MapPost("/api/admin/spells/seed", Seed).WithTags("Admin").RequireAuthorization(Policies.Admin);
        return app;
    }

    // Creates a variant per Handbook spell, by the admin, unless one with the key exists
    // already; its motifs become the first revisions.
    private static async Task<Ok<SeedSpellsResponse>> Seed(
        SeedSpellsRequest request, ClaimsPrincipal user, AppDbContext db, TimeProvider time, CancellationToken cancellationToken)
    {
        var userId = user.GetUserId();
        var variants = new Dictionary<string, Guid>();
        var rejected = new Dictionary<string, string>();
        var created = 0;
        foreach (var spell in request.Spells ?? [])
        {
            var key = spell.Key?.Trim() ?? "";
            if (key.Length is 0 or > Spell.NameMaxLength || variants.ContainsKey(key))
            {
                continue;
            }

            if (await db.SpellVariants.Where(v => v.SeedKey == key).Select(v => (Guid?)v.Id).SingleOrDefaultAsync(cancellationToken) is { } existing)
            {
                variants[key] = existing;
                continue;
            }

            var nameKey = Spell.KeyOf(spell.NameEn ?? "");
            var spellId = await db.Spells
                .Where(s => s.NameKey == nameKey && s.InHandbook)
                .Select(s => (Guid?)s.Id)
                .SingleOrDefaultAsync(cancellationToken);
            if (spellId is null)
            {
                rejected[key] = "nameEn";
                continue;
            }

            var (card, error) = SpellCards.Validate(spell.Card);
            if (card is null)
            {
                rejected[key] = error?.Field ?? "";
                continue;
            }

            var now = time.GetUtcNow();
            var variant = await SpellEndpoints.AddVariantAsync(
                db, spellId.Value, card, SpellVariantOrigin.Seed, null, key, userId, now, cancellationToken);
            foreach (var prompt in spell.Prompts ?? [])
            {
                var letter = prompt.Letter?.Trim().ToLowerInvariant() ?? "";
                var subject = prompt.Subject?.Trim() ?? "";
                if (letter.Length == 1 && letter[0] is >= 'a' and <= 'z' && subject.Length is > 0 and <= SpellArtPrompt.SubjectMaxLength)
                {
                    db.SpellArtPrompts.Add(new SpellArtPrompt
                    {
                        Id = Guid.NewGuid(),
                        VariantId = variant.Id,
                        Letter = letter,
                        Subject = subject,
                        Source = SpellArtPromptSource.Seed,
                        CreatedAt = now,
                        CreatedByUserId = userId,
                    });
                }
            }

            await db.SaveChangesAsync(cancellationToken);
            variants[key] = variant.Id;
            created++;
        }

        return TypedResults.Ok(new SeedSpellsResponse(variants, created, rejected));
    }
}
