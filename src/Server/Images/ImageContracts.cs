namespace OreanasOffice.Server.Images;

// Request and response types for map backgrounds (knowledge/features/ai-map-generation.md).
// Every endpoint needs a connection; the editor says so offline.

// GET backgrounds: the map's versions, newest first, and what the month has used.
// PickedAssetId: the map's BackgroundAssetId, also when it is outdated or belongs to the
// store map this one was copied from (then it is listed too). The editor shows the picked
// one as current only while it isn't Outdated.
public record MapBackgroundsResponse(
    Guid? PickedAssetId,
    List<MapBackground> Versions,
    ImageBudgetResponse Budget);

// One version. Url: /api/assets/{id} once Done, else null. Outdated: made for another size
// than the map has now. LayoutChanged: the layout changed since it was made (same size);
// the editor notes it, the board still shows it. Failure: set when Failed.
// X, Y, Width, Height: as BoardBackground, so the editor can draw it under its grid.
public record MapBackground(
    Guid Id,
    Guid MapId,
    AssetStatus Status,
    string? Url,
    int GridWidth,
    int GridHeight,
    int X,
    int Y,
    int Width,
    int Height,
    bool Outdated,
    bool LayoutChanged,
    AssetFailure? Failure,
    DateTimeOffset CreatedAt,
    DateTimeOffset? FinishedAt);

// The month runs in UTC from MonthStart. SpentUsd counts finished images; generating is
// refused (ImageBudgetExhausted) once SpentUsd reaches LimitUsd. Available: the server has
// an image model configured (ImagesUnavailable otherwise).
public record ImageBudgetResponse(decimal SpentUsd, decimal LimitUsd, DateTimeOffset MonthStart, bool Available);

// POST backgrounds: the editor synced the map and the DM confirmed the job (never
// automatic, knowledge/decisions/image-budget.md). MapVersion: the map version the DM saw;
// MapChanged (409) when the server has another one.
public record GenerateBackgroundRequest(int MapVersion);

// PUT background: pick a Done version that fits the map's size, or null for the plain
// rendering. Errors: BackgroundNotFound, BackgroundOutdated.
public record PickBackgroundRequest(Guid? AssetId);
