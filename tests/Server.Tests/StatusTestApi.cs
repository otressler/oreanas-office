using System.Net;
using System.Net.Http.Json;
using OreanasOffice.Server.Encounters;
using OreanasOffice.Server.Statuses;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// Shortcuts for statuses and status lists (knowledge/features/statuses.md).
public static class StatusTestApi
{
    public static Guid Library(string key) => StatusLibrary.Conditions.Single(c => c.Key == key).Id;

    public static Guid Prone => Library("prone");

    public static Guid Poisoned => Library("poisoned");

    public static Guid Exhaustion => Library("exhaustion");

    public static IEnumerable<Guid> LibraryIds => StatusLibrary.Conditions.Select(c => c.Id);

    public static string CharacterListUrl(Guid campaignId, Guid characterId) => $"/api/campaigns/{campaignId}/characters/{characterId}/status-list";

    public static string DmListUrl(Guid campaignId) => $"/api/campaigns/{campaignId}/dm-status-list";

    public static string PickerUrl(Guid campaignId, Guid encounterId) => $"/api/campaigns/{campaignId}/encounters/{encounterId}/status-picker";

    public static async Task<StatusListResponse> GetCharacterListAsync(this Person person, Guid campaignId, Guid characterId) =>
        await (await person.Client.GetAsync(CharacterListUrl(campaignId, characterId))).ReadAsync<StatusListResponse>(HttpStatusCode.OK);

    public static async Task<StatusListResponse> GetDmListAsync(this Person person, Guid campaignId) =>
        await (await person.Client.GetAsync(DmListUrl(campaignId))).ReadAsync<StatusListResponse>(HttpStatusCode.OK);

    public static Task<HttpResponseMessage> SetCharacterListAsync(this Person person, Guid campaignId, Guid characterId, params Guid[] statusIds) =>
        person.Client.PutAsJsonAsync(CharacterListUrl(campaignId, characterId), new SetStatusListRequest([.. statusIds]), Json);

    public static Task<HttpResponseMessage> SetDmListAsync(this Person person, Guid campaignId, params Guid[] statusIds) =>
        person.Client.PutAsJsonAsync(DmListUrl(campaignId), new SetStatusListRequest([.. statusIds]), Json);

    public static Task<HttpResponseMessage> CreateStatusAsync(this Person person, Guid campaignId, CreateStatusRequest request) =>
        person.Client.PostAsJsonAsync($"/api/campaigns/{campaignId}/statuses", request, Json);

    // A custom status in the character's list, or the caller's DM list without one.
    public static async Task<StatusDefinitionView> CreateStatusOkAsync(
        this Person person, Guid campaignId, string name, Guid? characterId = null, string? iconDescription = null, bool hasLevels = false) =>
        await (await person.CreateStatusAsync(campaignId, new CreateStatusRequest(name, iconDescription, hasLevels, characterId)))
            .ReadAsync<StatusDefinitionView>(HttpStatusCode.Created);

    public static async Task<StatusPickerResponse> GetPickerAsync(this Person person, Guid campaignId, Guid encounterId) =>
        await (await person.Client.GetAsync(PickerUrl(campaignId, encounterId))).ReadAsync<StatusPickerResponse>(HttpStatusCode.OK);

    public static async Task<BoardStateResponse> BoardAsync(this Person person, Guid campaignId, Guid encounterId) =>
        await (await person.GetBoardAsync(campaignId, encounterId)).ReadAsync<BoardStateResponse>(HttpStatusCode.OK);

    public static Task<BoardStateResponse> BoardAsync(this Person person, RunningFight fight) =>
        person.BoardAsync(fight.CampaignId, fight.EncounterId);
}
