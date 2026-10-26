namespace OreanasOffice.Server.Api;

// Errors the frontend shows to people. The API returns only the code; the German
// text for each code lives in src/web/src/text/de.ts, so the server sends no
// interface text. `Field` names the request field the error belongs to, if any.
public record ApiError(ApiErrorCode Code, string? Field = null);

public enum ApiErrorCode
{
    // Registration and sign-in
    InviteInvalid,
    EmailInvalid,
    EmailTaken,
    PasswordTooShort,
    DisplayNameInvalid,
    InvalidCredentials,
    LockedOut,
    ResetLinkInvalid,

    // Google sign-in and linking. These reach the frontend as `?fehler=<code>`
    // after a redirect, not in a response body.
    GoogleFailed,
    GoogleNoInvite,
    GoogleEmailTaken,
    GoogleAccountInUse,
    GoogleAlreadyLinked,

    // Campaigns, characters and sessions
    NameInvalid,
    JoinCodeInvalid,
    DateInvalid,
    NotADm,
    AnotherSessionActive,
    SessionEnded,
    // NotSessionDm: only the session's DM plans its fights (knowledge/domain/session.md).
    NotSessionDm,
    // SessionInvalid: the session isn't one of this campaign.
    SessionInvalid,
    // ColorInvalid: a character's ring colour isn't "#rrggbb".
    ColorInvalid,
    // NotAMember: a character was given to someone who isn't a member of the campaign.
    NotAMember,

    // Map imports. Field is the JSON path of the offending entry, e.g. "layout.cells[12]".
    TextTooLong,
    MapSizeInvalid,
    LayoutVersionUnsupported,
    CellInvalid,
    FeatureInvalid,
    EntranceInvalid,
    CreatureTypeInvalid,
    PlacementInvalid,

    // Encounters
    CharacterInvalid,
    SessionNotActive,
    EncounterNotReady,
    EncounterNotActive,
    AnotherEncounterActive,

    // The live table (hub results)
    TokenNotFound,
    NotYourToken,
    TargetInvalid,
    NothingToUndo,

    // Sync and the map store (knowledge/decisions/offline-prep-pwa.md, "Sync protocol").
    // SyncOutdated: the app's sync version is older than the server's minimum.
    SyncOutdated,
    // IdTaken: a new item's id exists already (elsewhere, or as another kind), or an
    // existing id belongs to another campaign.
    IdTaken,
    // ItemNotFound: baseVersion > 0 for an id the server doesn't know.
    ItemNotFound,
    // DependencyRejected: an item this one needs was rejected in the same push.
    DependencyRejected,
    // LayoutInvalid: the map breaks the layout rules; the item result lists the problems.
    LayoutInvalid,
    // MapInvalid: the encounter's map isn't a map of this campaign.
    MapInvalid,
    // CreatureTypeNameTaken: another type of the campaign has this name, ignoring case.
    CreatureTypeNameTaken,
    // StatusInvalid: a device may only push draft or ready.
    StatusInvalid,
    // TokenInvalid: a creature token is malformed; Field is "tokens[i]".
    TokenInvalid,
    // EncounterArchived: an archived encounter can't be started.
    EncounterArchived,
    // CreaturesMisplaced: a creature doesn't stand validly on the current map, so the
    // encounter can't be marked ready or started; Field is "tokens[i]".
    CreaturesMisplaced,
    // MapNotInStore: the map isn't offered in this campaign's store.
    MapNotInStore,

    // Deleting a map (knowledge/domain/battle-map.md, "Deleting").
    // MapNotArchived: only an archived map can be deleted.
    MapNotArchived,
    // MapPlayed: a running or ended encounter uses the map, so it stays.
    MapPlayed,

    // Map backgrounds (knowledge/features/ai-map-generation.md).
    // ImagesUnavailable: the server has no image model configured.
    ImagesUnavailable,
    // ImageBudgetExhausted: this month's image generation reached the limit
    // (knowledge/decisions/image-budget.md).
    ImageBudgetExhausted,
    // GenerationRunning: the map already has a queued or running background job.
    GenerationRunning,
    // MapChanged: the server's map isn't the version the editor confirmed the job for;
    // sync and confirm again.
    MapChanged,
    // BackgroundNotFound: no finished background with this id for this map.
    BackgroundNotFound,
    // BackgroundOutdated: the background was made for another size of the map.
    BackgroundOutdated,
    // InstructionInvalid: a refinement needs an instruction of 1 to 500 characters.
    InstructionInvalid,

    // Token icons and portraits (knowledge/features/token-icons.md). GenerationRunning,
    // ImagesUnavailable and ImageBudgetExhausted apply here too.
    // ItemChanged: the server's creature type isn't the version the DM confirmed the job
    // for; sync and confirm again.
    ItemChanged,
    // AppearanceMissing: a character portrait is generated from its appearance, which is empty.
    AppearanceMissing,
    // ImageNotFound: no finished version with this id for this creature type or character
    // (picking), or no uploaded one (restyling).
    ImageNotFound,
    // UploadInvalid: the body isn't a JPEG, PNG or WebP picture the server can read, or it
    // is larger than ImageOptions.UploadMaxPixels on an edge.
    UploadInvalid,
    // UploadTooLarge: the body is larger than ImageOptions.UploadMaxBytes.
    UploadTooLarge,

    // Campaign descriptions and covers (knowledge/domain/campaign.md).
    // DescriptionInvalid: a campaign description longer than Campaign.DescriptionMaxLength.
    DescriptionInvalid,
    // DescriptionMissing: a cover is generated from the campaign's description, which is empty.
    DescriptionMissing,

    // Statuses (knowledge/features/statuses.md).
    // StatusNotFound: no library status or custom status of this campaign with this id.
    StatusNotFound,
    // StatusAlreadySet: the token has this status already; statuses don't stack.
    StatusAlreadySet,
    // LevelInvalid: a level outside 1-6, or a level for a status without levels.
    LevelInvalid,
    // NotYourStatus: a player removes or changes a status someone else put on.
    NotYourStatus,

    // Fog of war, spawning and the shared table (stage 10).
    // FogInvalid: fog cells or areas are malformed, outside the map, or the encounter has no
    // fog to change. Field names the offending entry.
    FogInvalid,
    // ReadOnlyConnection: a spectator screen, or a shared screen outside local mode, tried to
    // act (move, ping, set statuses, remove, spawn).
    ReadOnlyConnection,
    // SpawnInvalid: no creatures, too many, or a creature type outside the campaign.
    SpawnInvalid,
    // NotLocalMode: a shared screen was asked for in a session that isn't in local mode.
    NotLocalMode,
    // InitiativeInvalid: an initiative list names a token outside the encounter or twice, or
    // a value, modifier or d20 is out of range (knowledge/features/initiative.md).
    InitiativeInvalid,
    // NotBuilt: a hub method of stage 10 whose lane has not been built yet. Removed with the
    // last stub.
    NotBuilt,
}
