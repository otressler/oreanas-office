namespace OreanasOffice.Server.Rules;

// knowledge/rules/creature-size.md: Tiny, Small and Medium cover one cell, Large
// 2×2, Huge 3×3, Gargantuan 4×4.
public enum CreatureSize
{
    Tiny,
    Small,
    Medium,
    Large,
    Huge,
    Gargantuan,
}

public static class CreatureSizes
{
    // Cells per side of the square footprint.
    public static int Footprint(this CreatureSize size) => size switch
    {
        CreatureSize.Large => 2,
        CreatureSize.Huge => 3,
        CreatureSize.Gargantuan => 4,
        _ => 1,
    };
}
