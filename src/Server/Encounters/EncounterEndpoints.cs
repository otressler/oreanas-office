using Microsoft.AspNetCore.Http.HttpResults;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Authorization;
using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Encounters;

// knowledge/domain/encounter.md and battle-map.md: `dm` members prepare encounters by
// importing maps and see the prepared ones; only the session DM starts and ends them.
// Every member sees the board of the active encounter.
public static class EncounterEndpoints
{
    public static IEndpointRouteBuilder MapEncounterEndpoints(this IEndpointRouteBuilder app)
    {
        var encounters = app.MapGroup("/api/campaigns/{campaignId:guid}/encounters").WithTags("Encounters");

        encounters.MapGet("/", ListEncounters).RequireAuthorization(Policies.CampaignDm);
        encounters.MapPost("/import", ImportMap).RequireAuthorization(Policies.CampaignDm);
        encounters.MapGet("/{encounterId:guid}/board", GetBoard).RequireAuthorization(Policies.CampaignMember);

        var running = app.MapGroup("/api/campaigns/{campaignId:guid}/sessions/{sessionId:guid}/encounters/{encounterId:guid}")
            .WithTags("Encounters")
            .RequireAuthorization(Policies.SessionDm);
        running.MapPost("/start", StartEncounter);
        running.MapPost("/end", EndEncounter);

        return app;
    }

    // Every encounter of the campaign: active first, then ready, draft and ended, newest
    // first within each.
    private static Task<Ok<List<EncounterSummaryResponse>>> ListEncounters(Guid campaignId) =>
        throw new NotImplementedException();

    // Creates the battle map, an encounter of the same name in status Ready, its
    // creature tokens and any missing creature types, all or nothing. See MapFile.cs
    // for the rules and their error codes.
    private static Task<Results<Created<EncounterSummaryResponse>, BadRequest<ApiError>>> ImportMap(
        Guid campaignId, ImportMapRequest request) =>
        throw new NotImplementedException();

    // Any member for the active encounter of the campaign's active session; `dm`
    // members for any encounter (the setup screen draws a Ready one). 404 otherwise, so
    // players can't tell a prepared encounter exists.
    private static Task<Results<Ok<BoardStateResponse>, NotFound>> GetBoard(Guid campaignId, Guid encounterId) =>
        throw new NotImplementedException();

    // Ready → active in this session, creating one character token per placement in the
    // same transaction. 404 for an encounter of another campaign. Conflicts:
    // SessionNotActive, EncounterNotReady (draft, active or ended), AnotherEncounterActive.
    // Bad requests: CharacterInvalid (not in the campaign, or listed twice) and
    // PlacementInvalid (knowledge/domain/encounter.md, placement rule), with Field
    // "characters[i]".
    private static Task<Results<Ok<EncounterSummaryResponse>, BadRequest<ApiError>, NotFound, Conflict<ApiError>>> StartEncounter(
        Guid campaignId, Guid sessionId, Guid encounterId, StartEncounterRequest request) =>
        throw new NotImplementedException();

    // Active → ended. Already ended: unchanged. 404 unless the encounter ran in this
    // session; EncounterNotActive for one that hasn't started.
    private static Task<Results<Ok<EncounterSummaryResponse>, NotFound, Conflict<ApiError>>> EndEncounter(
        Guid campaignId, Guid sessionId, Guid encounterId) =>
        throw new NotImplementedException();
}
