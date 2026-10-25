using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Encounters;

// The battle map as it was when the encounter started (knowledge/domain/encounter.md,
// `layout`). Stored as one JSON column on the encounter. Placement and Grid: the map's
// background adjustment and grid style then; older copies have neither.
public record EncounterMapCopy(
    int Width,
    int Height,
    MapLayout Layout,
    BackgroundPlacement? Placement = null,
    MapGridStyle Grid = MapGridStyle.Normal);
