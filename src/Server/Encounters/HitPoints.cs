namespace OreanasOffice.Server.Encounters;

// knowledge/features/hit-points.md: the session DM notes a creature's hit points during a
// fight. A creature type has a default, a placed creature may start with its own, and the
// current value is whatever the DM writes down. Nothing follows from it: 0 doesn't kill.
public static class HitPointRules
{
    public const int MaxMin = 1;
    public const int MaxMax = 999;

    public static bool MaxValid(int? max) => max is null or >= MaxMin and <= MaxMax;

    // The creature's maximum: its own, or its type's; null when neither is set.
    public static int? Max(int? own, int? type) => own ?? type;

    // What's left: the noted value up to the maximum, or the maximum while none is noted.
    // Null when the creature has no maximum.
    public static int? Current(int? noted, int? max) => max is { } m ? Math.Min(noted ?? m, m) : null;

    public static bool Valid(int current, int max) =>
        max is >= MaxMin and <= MaxMax && current >= 0 && current <= max;
}
