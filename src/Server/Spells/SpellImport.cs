using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images;

namespace OreanasOffice.Server.Spells;

// knowledge/features/spell-cards.md, "Creating a spell": English name, wiki page, German
// card. Every model call is recorded with its cost (TextModelCall), counted against the
// monthly AI budget. Nothing else is saved: the drafts go back to the editor.
public sealed partial class SpellImport(
    ITextModelClient model,
    IHttpClientFactory httpClients,
    AppDbContext db,
    IOptions<ImageOptions> options,
    TimeProvider time,
    ILogger<SpellImport> logger)
{
    public const string WikiClient = "spell-wiki";

    private readonly ImageOptions _options = options.Value;

    public bool Available => model.Configured;

    public async Task<bool> BudgetLeftAsync(CancellationToken cancellationToken) =>
        await MapBackgrounds.SpentSinceAsync(db, MapBackgrounds.MonthStart(time.GetUtcNow()), cancellationToken) < _options.MonthlyLimitUsd;

    // The official English 2024 name, or null when the input isn't a spell.
    public async Task<string?> EnglishNameAsync(string input, Guid userId, CancellationToken cancellationToken)
    {
        var result = await CallAsync(
            new TextModelRequest("spell-name", SpellImportPrompts.NameSystem, input.Trim(), "spell_name", SpellImportPrompts.NameSchema, MaxOutputTokens: 2000),
            userId,
            cancellationToken);
        using var json = JsonDocument.Parse(result.Json);
        var name = json.RootElement.TryGetProperty("nameEn", out var n) && n.ValueKind == JsonValueKind.String ? n.GetString()?.Trim() : null;
        return string.IsNullOrEmpty(name) || name.Length > Spell.NameMaxLength ? null : name;
    }

    // The Handbook spell of this English name, or null when the Handbook has none.
    public async Task<HandbookMatch?> HandbookSpellAsync(string nameEn, CancellationToken cancellationToken)
    {
        var key = Spell.KeyOf(nameEn);
        return await db.Spells.AsNoTracking()
            .Where(s => s.NameKey == key && s.InHandbook)
            .Select(s => new HandbookMatch(s.Id, s.NameEn, s.Slug ?? "", s.Level, s.School, s.Variants.Count))
            .SingleOrDefaultAsync(cancellationToken);
    }

    // The text of the spell's wiki page, or null for a 404. Throws SpellImportException when
    // the wiki can't be reached. Slug: the Handbook's (Spell.Slug), which the wiki made.
    public async Task<string?> WikiPageAsync(string slug, CancellationToken cancellationToken)
    {
        var http = httpClients.CreateClient(WikiClient);
        var url = $"{_options.SpellWikiBaseUrl.TrimEnd('/')}/spell:{slug}";
        try
        {
            using var response = await http.GetAsync(url, cancellationToken);
            if (response.StatusCode == HttpStatusCode.NotFound)
            {
                return null;
            }

            if (!response.IsSuccessStatusCode)
            {
                throw new SpellImportException($"The wiki answered {(int)response.StatusCode} for {url}.");
            }

            var text = PageText(Decode(await response.Content.ReadAsByteArrayAsync(cancellationToken)));
            return string.IsNullOrWhiteSpace(text) ? null : text;
        }
        catch (HttpRequestException ex)
        {
            throw new SpellImportException($"The wiki couldn't be reached: {ex.Message}", ex);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            throw new SpellImportException("The wiki didn't answer in time.", ex);
        }
    }

    public async Task<SpellDraft?> DraftFromWikiAsync(HandbookMatch spell, string pageText, Guid userId, CancellationToken cancellationToken)
    {
        var result = await CallAsync(
            new TextModelRequest("spell-wiki", SpellImportPrompts.WikiSystemWith(await GlossaryTermsAsync(cancellationToken)), SpellImportPrompts.WikiUser(spell.NameEn, pageText), "spell_card", SpellImportPrompts.CardSchema()),
            userId,
            cancellationToken);
        var card = JsonSerializer.Deserialize<ModelCard>(result.Json, SpellConfiguration.CardJson);
        return card is not null && ToDraft(card with { NameEn = spell.NameEn }, SpellVariantOrigin.Wiki) is { } draft ? draft.For(spell) : null;
    }

    public async Task<List<SpellDraft>> DraftsFromPhotoAsync(ImageInput photo, Guid userId, CancellationToken cancellationToken)
    {
        var result = await CallAsync(
            new TextModelRequest("spell-photo", SpellImportPrompts.PhotoSystemWith(await GlossaryTermsAsync(cancellationToken)), SpellImportPrompts.PhotoUser, "spell_cards", SpellImportPrompts.PhotoSchema(), [photo], MaxOutputTokens: 32000),
            userId,
            cancellationToken);
        var page = JsonSerializer.Deserialize<ModelPage>(result.Json, SpellConfiguration.CardJson);
        return [.. (page?.Spells ?? []).Select(c => ToDraft(c, SpellVariantOrigin.Photo)).OfType<SpellDraft>()];
    }

    // A new art motif for the studio, or null when the model answered without one. Throws
    // SpellImportException like the imports.
    public async Task<string?> SuggestMotifAsync(SpellMotifInput input, Guid userId, CancellationToken cancellationToken)
    {
        var result = await CallAsync(
            new TextModelRequest("spell-motif", SpellImportPrompts.MotifSystem, SpellImportPrompts.MotifUser(input), "spell_motif", SpellImportPrompts.MotifSchema, MaxOutputTokens: 8000),
            userId,
            cancellationToken);
        using var json = JsonDocument.Parse(result.Json);
        var subject = json.RootElement.TryGetProperty("subject", out var s) && s.ValueKind == JsonValueKind.String ? s.GetString() : null;
        var text = Cut(subject, SpellArtPrompt.SubjectMaxLength);
        return text.Length == 0 ? null : text;
    }

    // The drafts of Handbook spells, with the Handbook's name, level and school; the others
    // are dropped (the library holds only the Handbook's spells).
    public async Task<List<SpellDraft>> InHandbookAsync(IEnumerable<SpellDraft> drafts, CancellationToken cancellationToken)
    {
        var list = drafts.ToList();
        var keys = list.Select(d => Spell.KeyOf(d.NameEn)).ToList();
        var spells = await db.Spells.AsNoTracking()
            .Where(s => keys.Contains(s.NameKey) && s.InHandbook)
            .Select(s => new { s.NameKey, Match = new HandbookMatch(s.Id, s.NameEn, s.Slug ?? "", s.Level, s.School, s.Variants.Count) })
            .ToDictionaryAsync(s => s.NameKey, s => s.Match, cancellationToken);
        return [.. list
            .Where(d => spells.ContainsKey(Spell.KeyOf(d.NameEn)))
            .Select(d => d.For(spells[Spell.KeyOf(d.NameEn)]))];
    }

    private async Task<TextModelResult> CallAsync(TextModelRequest request, Guid userId, CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(_options.TextModelTimeout);
        var call = new TextModelCall
        {
            Id = Guid.NewGuid(),
            Purpose = request.Purpose,
            Model = _options.TextDeployment,
            CreatedAt = time.GetUtcNow(),
            UserId = userId,
        };
        try
        {
            var result = await model.CompleteJsonAsync(request, timeout.Token);
            call.Model = result.Model ?? call.Model;
            call.InputTokens = result.InputTokens;
            call.OutputTokens = result.OutputTokens;
            call.CostUsd = Math.Round(
                ((result.InputTokens * _options.TextModelInputUsdPerMillion) + (result.OutputTokens * _options.TextModelOutputUsdPerMillion)) / 1_000_000m,
                6);
            call.Succeeded = true;
            logger.LogInformation(
                "Text model call {Purpose}: {Input} input and {Output} output tokens, {Cost} USD",
                request.Purpose,
                result.InputTokens,
                result.OutputTokens,
                call.CostUsd);
            return result;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new SpellImportException("The text model didn't answer in time.");
        }
        catch (TextModelException ex)
        {
            logger.LogWarning("Text model call {Purpose} failed: {Message}", request.Purpose, ex.Message);
            throw new SpellImportException(ex.Message, ex) { Refused = ex.Refused };
        }
        finally
        {
            db.TextModelCalls.Add(call);
            await db.SaveChangesAsync(CancellationToken.None);
        }
    }

    // The rules glossary's names, for the cards' [[term]] marks.
    private async Task<List<string>> GlossaryTermsAsync(CancellationToken cancellationToken) =>
        await db.GlossaryEntries.AsNoTracking().OrderBy(e => e.Position).Select(e => e.Name).ToListAsync(cancellationToken);

    // The model's card as a draft: limits enforced by cutting, unknown icons replaced, so
    // the user always gets something to fix in the editor. Null without a usable name.
    private static SpellDraft? ToDraft(ModelCard m, SpellVariantOrigin origin)
    {
        var nameEn = Cut(m.NameEn, Spell.NameMaxLength);
        var name = SpellCards.BreakPoints(Cut(m.Name, SpellCards.NameMax));
        if (nameEn.Length == 0 || name.Length == 0)
        {
            return null;
        }

        string Icon(string? icon) => icon is not null && SpellCards.Icons.Contains(icon) ? icon : "spark";
        static SpellChip? Chip(SpellChip? chip) => string.IsNullOrWhiteSpace(chip?.Big) ? null : new SpellChip
        {
            Big = Cut(chip.Big, SpellCards.ChipBigMax),
            Small = string.IsNullOrWhiteSpace(chip.Small) ? null : Cut(chip.Small, SpellCards.ChipSmallMax),
            Kind = chip.Kind,
        };
        var card = new SpellCard
        {
            Name = name,
            CastingTime = Cut(m.CastingTime, SpellCards.StatMax),
            Range = Cut(m.Range, SpellCards.StatMax),
            Components = Cut(m.Components, SpellCards.StatMax),
            Duration = Cut(m.Duration, SpellCards.StatMax),
            Concentration = m.Concentration,
            Ritual = m.Ritual,
            Description = Cut(m.Description, SpellCards.DescriptionMax),
            Effects = [.. (m.Effects ?? []).Where(e => !string.IsNullOrWhiteSpace(e.Title)).Take(SpellCards.EffectsMax).Select(e => new SpellEffect
            {
                Icon = Icon(e.Icon),
                Title = Cut(e.Title, SpellCards.EffectTitleMax),
                Tag = string.IsNullOrWhiteSpace(e.Tag) ? null : Cut(e.Tag, SpellCards.EffectTagMax),
                Text = Cut(e.Text, SpellCards.EffectTextMax),
                Chip = Chip(e.Chip),
            })],
            Tables = [.. (m.Tables ?? [])
                .Select(t => new SpellTable
                {
                    Caption = Cut(t.Caption, SpellCards.TableCaptionMax),
                    Rows = [.. (t.Rows ?? [])
                        .Where(r => !string.IsNullOrWhiteSpace(r.Title) || !string.IsNullOrWhiteSpace(r.Text))
                        .Take(SpellCards.TableRowsMax)
                        .Select(r => new SpellTableRow
                        {
                            Key = Cut(r.Key, SpellCards.TableKeyMax),
                            Color = r.Color,
                            Title = Cut(r.Title, SpellCards.TableTitleMax),
                            Text = Cut(r.Text, SpellCards.TableTextMax),
                            Chip = Chip(r.Chip),
                        })],
                })
                .Where(t => t.Rows.Count > 0)
                .Take(SpellCards.TablesMax)],
            Icon = Icon(m.Icon),
            Pips = [.. (m.Pips ?? []).Select(Icon).Distinct().Take(SpellCards.PipsMax)],
            HigherLevels = Cut(m.HigherLevels, SpellCards.HigherLevelsMax),
            Tip = Cut(m.Tip, SpellCards.TipMax),
            Material = Cut(m.Material, SpellCards.MaterialMax),
            Source = Cut(m.Source, SpellCards.SourceMax),
            WriteIns = [.. (m.WriteIns ?? []).Distinct()],
        };
        return new SpellDraft(Guid.Empty, nameEn, Math.Clamp(m.Level, 0, Spell.MaxLevel), m.School ?? SpellSchool.Evocation, card, origin, 0);
    }

    private static string Cut(string? text, int max)
    {
        var value = (text ?? "").Trim();
        return value.Length <= max ? value : value[..max].TrimEnd();
    }

    // UTF-8, or Windows-1252-ish Latin-1 for the wiki's older pages.
    private static string Decode(byte[] bytes)
    {
        try
        {
            return new UTF8Encoding(false, true).GetString(bytes);
        }
        catch (DecoderFallbackException)
        {
            return Encoding.Latin1.GetString(bytes);
        }
    }

    // The page's #page-content as plain text: paragraphs and rows on lines of their own,
    // table cells separated by " | ", links and formatting dropped.
    public static string PageText(string html)
    {
        var start = html.IndexOf("id=\"page-content\"", StringComparison.Ordinal);
        if (start < 0)
        {
            return "";
        }

        start = html.IndexOf('>', start) + 1;
        var end = html.IndexOf("<div class=\"page-tags\"", start, StringComparison.Ordinal);
        var ad = html.IndexOf("<!-- mobile bottom", start, StringComparison.Ordinal);
        if (ad >= 0 && (end < 0 || ad < end))
        {
            end = ad;
        }

        var content = html[start..(end < 0 ? html.Length : end)];
        content = Scripts().Replace(content, "");
        // In HTML a line break in the source is a space; only the tags below break lines.
        content = Whitespace().Replace(content, " ");
        content = Paragraphs().Replace(content, "\n\n");
        content = LineBreaks().Replace(content, "\n");
        content = Cells().Replace(content, " | ");
        content = Tags().Replace(content, "");
        content = WebUtility.HtmlDecode(content);
        content = Spaces().Replace(content, " ");
        content = LineEdges().Replace(content, "\n");
        content = BlankLines().Replace(content, "\n\n");
        var text = content.Trim();
        return text.Length <= 12000 ? text : text[..12000];
    }

    [GeneratedRegex(@"<script[\s\S]*?</script>", RegexOptions.IgnoreCase)]
    private static partial Regex Scripts();

    [GeneratedRegex(@"</p>|</h\d>|</table>|</ul>|</ol>", RegexOptions.IgnoreCase)]
    private static partial Regex Paragraphs();

    [GeneratedRegex(@"<br\s*/?>|</li>|</tr>|</div>", RegexOptions.IgnoreCase)]
    private static partial Regex LineBreaks();

    [GeneratedRegex(@"</t[dh]>", RegexOptions.IgnoreCase)]
    private static partial Regex Cells();

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex Tags();

    [GeneratedRegex(@"[ \t ]+")]
    private static partial Regex Spaces();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    [GeneratedRegex(" *\n *")]
    private static partial Regex LineEdges();

    [GeneratedRegex(@"\s*\n\s*\n\s*")]
    private static partial Regex BlankLines();

    // The model's answer, as the JSON schema in SpellImportPrompts describes it.
    private sealed record ModelPage(List<ModelCard>? Spells);

    private sealed record ModelCard
    {
        public string? NameEn { get; init; }
        public string? Name { get; init; }
        public int Level { get; init; }
        public SpellSchool? School { get; init; }
        public string? CastingTime { get; init; }
        public string? Range { get; init; }
        public string? Components { get; init; }
        public string? Duration { get; init; }
        public bool Concentration { get; init; }
        public bool Ritual { get; init; }
        public string? Description { get; init; }
        public List<ModelEffect>? Effects { get; init; }
        public List<ModelTable>? Tables { get; init; }
        public string? Icon { get; init; }
        public List<string>? Pips { get; init; }
        public string? HigherLevels { get; init; }
        public string? Tip { get; init; }
        public string? Material { get; init; }
        public string? Source { get; init; }
        public List<SpellWriteIn>? WriteIns { get; init; }
    }

    private sealed record ModelEffect(string? Icon, string? Title, string? Tag, string? Text, SpellChip? Chip);

    private sealed record ModelTable(string? Caption, List<ModelRow>? Rows);

    private sealed record ModelRow(string? Key, SpellRowColor? Color, string? Title, string? Text, SpellChip? Chip);
}

// A Handbook spell an import found: its library row, wiki slug and facts, and how many
// variants it has.
public sealed record HandbookMatch(Guid SpellId, string NameEn, string Slug, int Level, SpellSchool School, int VariantCount);

// What "Vorschlagen" in the studio sends: the variant's card and spell, the English names of
// the classes whose list it is on, the current subject of each motif and the author's notes.
public sealed record SpellMotifInput(
    string NameEn,
    int Level,
    SpellSchool School,
    SpellCard Card,
    IReadOnlyList<string> Classes,
    IReadOnlyList<string> Motifs,
    IReadOnlyList<string> Notes);

internal static class SpellDrafts
{
    // The draft as a card for this Handbook spell: its id, name, level and school.
    public static SpellDraft For(this SpellDraft draft, HandbookMatch spell) => draft with
    {
        SpellId = spell.SpellId,
        NameEn = spell.NameEn,
        Level = spell.Level,
        School = spell.School,
        VariantCount = spell.VariantCount,
    };
}

public sealed class SpellImportException(string message, Exception? inner = null) : Exception(message, inner)
{
    public bool Refused { get; init; }
}
