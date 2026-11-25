using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using OreanasOffice.Server.Spells;

namespace OreanasOffice.Server.Rules;

// The 2024 Player's Handbook as data (knowledge/rules/handbook-classes.md): its 12 classes
// and 48 subclasses with German names, its 391 spells, which class lists each spell is on,
// and the spells each subclass grants from a class level on. handbook.json is embedded in
// the assembly; HandbookSync copies it into the database.
public static class Handbook
{
    private static readonly Lazy<(HandbookData Data, string Hash)> Loaded = new(Load);

    public static HandbookData Data => Loaded.Value.Data;

    // SHA-256 of the embedded file, so the sync runs only when it changed.
    public static string Hash => Loaded.Value.Hash;

    private static (HandbookData, string) Load()
    {
        using var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("OreanasOffice.Server.Rules.handbook.json")
            ?? throw new InvalidOperationException("handbook.json isn't embedded in the server.");
        using var memory = new MemoryStream();
        stream.CopyTo(memory);
        var bytes = memory.ToArray();
        var data = JsonSerializer.Deserialize<HandbookData>(bytes, JsonOptions)
            ?? throw new InvalidOperationException("handbook.json is empty.");
        return (data, Convert.ToHexStringLower(SHA256.HashData(bytes)));
    }

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };
}

public sealed record HandbookData(List<HandbookClass> Classes, List<HandbookSpell> Spells);

public sealed record HandbookClass(string Id, string NameEn, string NameDe, SpellcastingKind? Caster, List<HandbookSubclass> Subclasses);

// SpellListClass: the class whose spell list the subclass casts from (Eldritch Knight and
// Arcane Trickster: "wizard"). Spells: the spells it grants, by the class level from which on.
// NameDeSource: where the German name comes from (phb2024: the German Player's Handbook 2024,
// given by the project owner); only for the knowledge base, not stored.
public sealed record HandbookSubclass(
    string Id,
    string NameEn,
    string NameDe,
    string NameDeSource,
    string? SpellListClass,
    Dictionary<int, List<string>>? Spells);

// NameDe: the German Player's Handbook 2024's name; null for the few spells it is still
// missing for (knowledge/rules/handbook-classes.md). Slug: the spell's page
// on dnd2024.wikidot.com ("hunter-s-mark"). Classes: the class lists it is on.
public sealed record HandbookSpell(string NameEn, string? NameDe, string Slug, int Level, SpellSchool School, List<string> Classes);
