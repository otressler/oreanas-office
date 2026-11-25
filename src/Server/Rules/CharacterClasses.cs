using OreanasOffice.Server.Api;
using OreanasOffice.Server.Characters;

namespace OreanasOffice.Server.Rules;

// The rules for a character's classes (knowledge/domain/character.md): Handbook classes, each
// once, levels 1-20 and at most 20 together (a character's level), a subclass of the same
// class and only from level 3. Multiclassing prerequisites aren't checked ("show, don't
// enforce").
public static class CharacterClasses
{
    private static readonly Lazy<Dictionary<string, HashSet<string>>> SubclassesByClass = new(() =>
        Handbook.Data.Classes.ToDictionary(c => c.Id, c => c.Subclasses.Select(s => s.Id).ToHashSet()));

    // The validated classes in order, or the error.
    public static ApiError? Validate(List<CharacterClassRequest>? request, out List<CharacterClassView> classes)
    {
        classes = [];
        var total = 0;
        foreach (var entry in request ?? [])
        {
            var classId = entry?.ClassId?.Trim() ?? "";
            var subclassId = entry?.SubclassId?.Trim() is { Length: > 0 } picked ? picked : null;
            if (entry is null
                || !SubclassesByClass.Value.TryGetValue(classId, out var subclasses)
                || classes.Any(c => c.ClassId == classId)
                || entry.Level is < 1 or > CharacterClassLevel.MaxLevel
                || (subclassId is not null && (!subclasses.Contains(subclassId) || entry.Level < CharacterClassLevel.SubclassLevel)))
            {
                return new ApiError(ApiErrorCode.CharacterClassInvalid, "classes");
            }

            total += entry.Level;
            classes.Add(new CharacterClassView(classId, entry.Level, subclassId));
        }

        return total > CharacterClassLevel.MaxLevel ? new ApiError(ApiErrorCode.CharacterClassInvalid, "classes") : null;
    }

    // Makes the character's classes these, keeping the rows of classes it still has.
    public static void Apply(Character character, List<CharacterClassView> classes)
    {
        character.Classes.RemoveAll(row => classes.All(c => c.ClassId != row.ClassId));
        foreach (var (entry, position) in classes.Select((c, i) => (c, i)))
        {
            var row = character.Classes.FirstOrDefault(c => c.ClassId == entry.ClassId);
            if (row is null)
            {
                row = new CharacterClassLevel { CharacterId = character.Id, ClassId = entry.ClassId };
                character.Classes.Add(row);
            }

            row.Level = entry.Level;
            row.SubclassId = entry.SubclassId;
            row.Position = position;
        }
    }

    // "Wizard (Evoker), Fighter" for the portrait prompt: English, without levels.
    public static string PromptText(IEnumerable<(string ClassEn, string? SubclassEn)> classes) =>
        string.Join(", ", classes.Select(c => c.SubclassEn is null ? c.ClassEn : $"{c.ClassEn} ({c.SubclassEn})"));
}
