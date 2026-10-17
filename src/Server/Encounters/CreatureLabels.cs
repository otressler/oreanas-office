namespace OreanasOffice.Server.Encounters;

// knowledge/domain/token.md, "label": a creature's label is the type name and a number, or
// the DM's own name. It is stored as Token.Number and Token.Label (the DM's name only);
// devices and the sync format still see one string.
public static class CreatureLabels
{
    // "Goblin 3" of type "Goblin" is (3, null); the bare type name is (null, null); anything
    // else is the DM's own name. Types match ignoring case, like the type index.
    public static (int? Number, string? Name) Split(string typeName, string label)
    {
        var text = label.Trim();
        if (text.Equals(typeName, StringComparison.OrdinalIgnoreCase))
        {
            return (null, null);
        }

        var space = text.LastIndexOf(' ');
        if (space > 0
            && int.TryParse(text[(space + 1)..], System.Globalization.NumberStyles.None, System.Globalization.CultureInfo.InvariantCulture, out var number)
            && number > 0
            && Shortened(typeName, number).Equals(text, StringComparison.OrdinalIgnoreCase))
        {
            return (number, null);
        }

        return (null, text);
    }

    // What the board and the sync format show.
    public static string Display(string typeName, int? number, string? name) =>
        name is { Length: > 0 } ? name : number is { } n ? Shortened(typeName, n) : typeName;

    // "Goblin 3". A type name near the length limit is shortened so the number fits.
    public static string Shortened(string typeName, int number)
    {
        var suffix = $" {number}";
        var room = Token.LabelMaxLength - suffix.Length;
        return (typeName.Length > room ? typeName[..room].TrimEnd() : typeName) + suffix;
    }
}
