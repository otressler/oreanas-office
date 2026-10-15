namespace OreanasOffice.Server.Images;

// Request and response types for token icons and portraits
// (knowledge/features/token-icons.md). Creature types and characters share them; the
// owner is named by OwnerType and OwnerId. Every endpoint needs a connection; the app says
// so offline.

// GET icons or portraits: the owner's versions, newest first, and what the month has used.
// PickedAssetId: CreatureType.IconAssetId or Character.TokenAssetId.
public record TokenImagesResponse(Guid? PickedAssetId, List<TokenImage> Versions, ImageBudgetResponse Budget);

// One version. Url: /api/assets/{id} once Done, else null. Origin: Generated (from the
// name and appearance, or restyled from an upload when SourceAssetId is set) or Uploaded
// (Done at once, no cost). Failure: set when Failed.
public record TokenImage(
    Guid Id,
    AssetOwnerType OwnerType,
    Guid OwnerId,
    AssetOrigin Origin,
    AssetStatus Status,
    string? Url,
    AssetFailure? Failure,
    Guid? SourceAssetId,
    DateTimeOffset CreatedAt,
    DateTimeOffset? FinishedAt);

// POST icons or portraits: a person confirmed the job (never automatic,
// knowledge/decisions/image-budget.md). One job per owner at a time (GenerationRunning).
// ItemVersion: creature types only, the version the DM saw after syncing; ItemChanged (409)
// when the server has another one. RestyleAssetId: characters only, an Uploaded version of
// the character to paint in the token style (requirement 4); without it a character needs a
// non-empty appearance (AppearanceMissing). Errors (409): ImagesUnavailable,
// ImageBudgetExhausted, GenerationRunning, ItemChanged, AppearanceMissing, ImageNotFound.
public record GenerateTokenImageRequest(int? ItemVersion = null, Guid? RestyleAssetId = null);

// PUT icon or portrait: pick a Done version of the owner, or null for the letter. Doesn't
// raise a creature type's sync version. Error (409): ImageNotFound.
public record PickTokenImageRequest(Guid? AssetId);

// GET creature-types/icons: the picked icon of each type of the campaign that has one, for
// the bestiary's list. Types without an icon are left out.
public record CreatureTypeIcon(Guid CreatureTypeId, Guid AssetId, string Url);
