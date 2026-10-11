using System.Security.Cryptography;

namespace OreanasOffice.Server.Campaigns;

// Six characters without look-alikes (no 0/O, 1/I/L), so a code read aloud or
// copied from a phone screen comes out right.
public static class JoinCodes
{
    public const int Length = 6;
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    public static string Create() => RandomNumberGenerator.GetString(Alphabet, Length);

    // What a person typed: case, spaces and dashes don't matter. Null when it
    // can't be a join code.
    public static string? Normalize(string? input)
    {
        if (input is null)
        {
            return null;
        }

        var code = new string(input.Where(c => !char.IsWhiteSpace(c) && c != '-').ToArray()).ToUpperInvariant();
        return code.Length == Length && code.All(Alphabet.Contains) ? code : null;
    }
}
