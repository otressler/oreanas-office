using OreanasOffice.Server.Api;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Maps;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Sessions;

namespace OreanasOffice.Server.Sync;

// Request and response types of the sync protocol
// (knowledge/decisions/offline-prep-pwa.md, "Sync protocol").

public enum SyncItemKind
{
    Campaign,
    CreatureType,
    BattleMap,
    Encounter,
}

// Created: a new item, version 1. Saved: accepted, version + 1 (or a retry of a
// campaign). Conflict: the server version differs; Server holds the server copy.
// Rejected: not allowed or invalid; Error says why.
public enum SyncOutcome
{
    Created,
    Saved,
    Conflict,
    Rejected,
}

// The data of each kind, as a device pushes it and the server sends it back.
public record SyncCampaignData(string Name);

public record SyncCreatureTypeData(string Name, CreatureSize Size, string Appearance, string Notes, DateTimeOffset? ArchivedAt);

public record SyncMapData(
    string Name,
    int Width,
    int Height,
    MapLayout Layout,
    string Scene,
    string Vibe,
    string Lighting,
    DateTimeOffset? ArchivedAt,
    Guid? CopiedFromMapId);

// Status: a device pushes only Draft or Ready. SessionId: the session the fight is planned
// for; a different one moves it (knowledge/domain/session.md).
public record SyncEncounterData(
    string Name,
    Guid BattleMapId,
    EncounterStatus Status,
    DateTimeOffset? ArchivedAt,
    List<SyncCreatureToken> Tokens,
    Guid SessionId);

// Elevation is not pushed: the server takes the highest elevation under the footprint.
public record SyncCreatureToken(Guid Id, Guid CreatureTypeId, string Label, int X, int Y, CreatureSize Size);

// What the server sends back for an encounter: the pushed fields plus the server-only ones.
public record SyncEncounterServerData(
    string Name,
    Guid BattleMapId,
    EncounterStatus Status,
    DateTimeOffset? ArchivedAt,
    List<SyncCreatureToken> Tokens,
    Guid SessionId,
    EncounterMapCopy? MapCopy);

// POST /api/sync/push. Items are handled in request order, each in its own transaction.
public record SyncPushRequest(List<SyncPushItem> Items);

// Exactly the field matching Kind is set.
public record SyncPushItem(
    Guid Id,
    SyncItemKind Kind,
    Guid CampaignId,
    int BaseVersion,
    SyncCampaignData? Campaign,
    SyncCreatureTypeData? CreatureType,
    SyncMapData? Map,
    SyncEncounterData? Encounter);

// Results in the order of the request.
public record SyncPushResponse(List<SyncItemResult> Results);

// Server: the server copy now (created, saved, conflict). Error: why it was rejected.
// DependsOnId: the item that was rejected earlier in the push (DependencyRejected).
// Problems: the layout rules broken (LayoutInvalid). ExistingCreatureTypeId: the type
// that has the name (CreatureTypeNameTaken).
public record SyncItemResult(
    Guid Id,
    SyncItemKind Kind,
    SyncOutcome Outcome,
    SyncServerItem? Server,
    ApiError? Error,
    Guid? DependsOnId,
    List<LayoutProblem>? Problems,
    Guid? ExistingCreatureTypeId);

// An item as the server holds it. Campaigns have no version: theirs is always 1 and
// UpdatedAt is the creation time. Exactly the field matching Kind is set.
public record SyncServerItem(
    Guid Id,
    SyncItemKind Kind,
    Guid CampaignId,
    int Version,
    DateTimeOffset UpdatedAt,
    string? UpdatedByDisplayName,
    SyncCampaignData? Campaign,
    SyncCreatureTypeData? CreatureType,
    SyncMapData? Map,
    SyncEncounterServerData? Encounter);

// GET versions: every item of the campaign, archived ones included, and the campaign's
// sessions as they are now. Sessions aren't sync items: devices keep them read-only, so
// fights can be planned into them offline, and replace them on every pull.
public record SyncItemVersion(Guid Id, int Version);

public record SyncVersionList(
    List<SyncItemVersion> CreatureTypes,
    List<SyncItemVersion> BattleMaps,
    List<SyncItemVersion> Encounters,
    List<SyncSession> Sessions);

public record SyncSession(Guid Id, string Title, DateOnly Date, SessionStatus Status, Guid DmUserId, string DmDisplayName);

// POST items: at most SyncProtocol.MaxFetchIds ids.
public record SyncFetchRequest(List<Guid> Ids);
