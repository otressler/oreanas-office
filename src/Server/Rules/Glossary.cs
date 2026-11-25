using System.Security.Claims;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Data;

namespace OreanasOffice.Server.Rules;

// knowledge/features/rules-glossary.md: the Player's Handbook's rules glossary (Anhang C), which
// explains the conditions and rules terms on spell cards and statuses. Its texts are the
// Handbook's, so they never enter the repository: an admin uploads them (the file comes from
// scripts/glossary-seed.mjs), and the upload replaces every entry.
public class GlossaryEntry
{
    public const int NameMaxLength = 60;

    public const int TagMaxLength = 30;

    public const int TextMaxLength = 8000;

    public const int MaxEntries = 500;

    // "Festgesetzt", as the Handbook heads the entry; unique, ignoring case.
    public required string Name { get; set; }

    // The rule family in brackets after the name: "Zustand", "Aktion", "Gefahr" …; null without.
    public string? Tag { get; set; }

    // Markdown: paragraphs, **bold**, *italic*, lists and tables.
    public required string Text { get; set; }

    // The glossary's order (alphabetical).
    public int Position { get; set; }
}

public record GlossaryEntryView(string Name, string? Tag, string Text);

public record UploadGlossaryRequest(List<GlossaryEntryView>? Entries);

public record UploadGlossaryResponse(int Entries);

internal sealed class GlossaryEntryConfiguration : IEntityTypeConfiguration<GlossaryEntry>
{
    public void Configure(EntityTypeBuilder<GlossaryEntry> entry)
    {
        entry.HasKey(e => e.Name);
        entry.Property(e => e.Name).HasMaxLength(GlossaryEntry.NameMaxLength);
        entry.Property(e => e.Tag).HasMaxLength(GlossaryEntry.TagMaxLength);
        entry.Property(e => e.Text).HasMaxLength(GlossaryEntry.TextMaxLength);
    }
}

public static class GlossaryEndpoints
{
    public static IEndpointRouteBuilder MapGlossaryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/rules/glossary", List).WithTags("Rules").RequireAuthorization();
        app.MapPut("/api/admin/rules/glossary", Upload).WithTags("Admin").RequireAuthorization(Policies.Admin);
        return app;
    }

    // Empty until an admin uploads the glossary; the app then shows no explanations.
    private static async Task<Ok<List<GlossaryEntryView>>> List(AppDbContext db, CancellationToken cancellationToken) =>
        TypedResults.Ok(await db.GlossaryEntries.AsNoTracking()
            .OrderBy(e => e.Position)
            .Select(e => new GlossaryEntryView(e.Name, e.Tag, e.Text))
            .ToListAsync(cancellationToken));

    private static async Task<Results<Ok<UploadGlossaryResponse>, BadRequest<ApiError>>> Upload(
        UploadGlossaryRequest request, AppDbContext db, CancellationToken cancellationToken)
    {
        var (entries, error) = Validate(request.Entries);
        if (error is not null)
        {
            return TypedResults.BadRequest(error);
        }

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            await db.GlossaryEntries.ExecuteDeleteAsync(cancellationToken);
            db.GlossaryEntries.AddRange(entries!);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            db.ChangeTracker.Clear();
        });
        return TypedResults.Ok(new UploadGlossaryResponse(entries!.Count));
    }

    // Trims every text; the first entry that breaks a rule comes back as GlossaryInvalid with
    // its index ("entries[3]"), or "entries" for the list as a whole.
    public static (List<GlossaryEntry>? Entries, ApiError? Error) Validate(List<GlossaryEntryView>? entries)
    {
        if (entries is null || entries.Count is 0 or > GlossaryEntry.MaxEntries)
        {
            return (null, new ApiError(ApiErrorCode.GlossaryInvalid, "entries"));
        }

        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<GlossaryEntry>(entries.Count);
        for (var i = 0; i < entries.Count; i++)
        {
            var name = (entries[i]?.Name ?? "").Trim();
            var tag = (entries[i]?.Tag ?? "").Trim();
            var text = (entries[i]?.Text ?? "").Replace("\r\n", "\n").Trim();
            if (name.Length is 0 or > GlossaryEntry.NameMaxLength
                || tag.Length > GlossaryEntry.TagMaxLength
                || text.Length is 0 or > GlossaryEntry.TextMaxLength
                || !names.Add(name))
            {
                return (null, new ApiError(ApiErrorCode.GlossaryInvalid, $"entries[{i}]"));
            }

            result.Add(new GlossaryEntry { Name = name, Tag = tag.Length > 0 ? tag : null, Text = text, Position = i });
        }

        return (result, null);
    }
}
