using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Encounters;

// The battle map as it was when the encounter started (knowledge/domain/encounter.md,
// `layout`). Stored as one JSON column on the encounter.
public record EncounterMapCopy(int Width, int Height, MapLayout Layout);
