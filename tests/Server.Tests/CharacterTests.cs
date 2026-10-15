using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Rules;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

[Collection("App")]
public sealed class CharacterTests(AppFixture fixture)
{
    [Fact]
    public async Task A_player_creates_a_character_they_own()
    {
        var (_, player, _, campaignId) = await CreatePartyAsync();

        var response = await player.Client.PostAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters", new CharacterRequest("  Thorin  ", CreatureSize.Small), Json);

        var character = await response.ReadAsync<CharacterResponse>(HttpStatusCode.Created);
        Assert.Equal($"/api/campaigns/{campaignId}/characters/{character.Id}", response.Headers.Location?.OriginalString);
        Assert.Equal(
            new CharacterResponse(character.Id, player.Id, "Brom", "Thorin", CreatureSize.Small, CanEdit: true, ColorIndex: 0, Appearance: "", PortraitUrl: null),
            character);
    }

    // Ring colours follow the order characters were added; two added at the same
    // moment still get different colours.
    [Fact]
    public async Task Characters_get_distinct_colour_indexes_in_the_order_they_were_added()
    {
        var (_, player, otherPlayer, campaignId) = await CreatePartyAsync();
        var first = await CreateCharacterAsync(player, campaignId, "Zelda");
        var second = await CreateCharacterAsync(otherPlayer, campaignId, "Arwen");
        var third = await CreateCharacterAsync(player, campaignId, "Mira");
        using (var scope = fixture.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var sameMoment = DateTimeOffset.UtcNow;
            await db.Characters
                .Where(c => c.Id == second.Id || c.Id == third.Id)
                .ExecuteUpdateAsync(set => set.SetProperty(c => c.CreatedAt, sameMoment));
        }

        var colors = (await ListAsync(player, campaignId)).ToDictionary(c => c.Id, c => c.ColorIndex);

        Assert.Equal(0, colors[first.Id]);
        Assert.Equal([1, 2], new[] { colors[second.Id], colors[third.Id] }.Order());
    }

    [Fact]
    public async Task The_list_is_sorted_by_name_and_says_who_can_edit()
    {
        var (dm, player, otherPlayer, campaignId) = await CreatePartyAsync();
        var mine = await CreateCharacterAsync(player, campaignId, "Zelda");
        var theirs = await CreateCharacterAsync(otherPlayer, campaignId, "Arwen");

        var asPlayer = await ListAsync(player, campaignId);
        var asDm = await ListAsync(dm, campaignId);

        Assert.Equal([theirs.Id, mine.Id], asPlayer.Select(c => c.Id));
        Assert.Equal([false, true], asPlayer.Select(c => c.CanEdit));
        Assert.Equal(["Cara", "Brom"], asPlayer.Select(c => c.OwnerDisplayName));
        Assert.Equal([true, true], asDm.Select(c => c.CanEdit));
    }

    [Fact]
    public async Task Characters_belong_to_their_campaign()
    {
        var (dm, _, _, campaignId) = await CreatePartyAsync();
        var otherCampaign = await dm.CreateCampaignAsync("Andere Runde");
        await CreateCharacterAsync(dm, otherCampaign.Id, "Woanders");

        Assert.Empty(await ListAsync(dm, campaignId));
    }

    [Fact]
    public async Task The_owner_updates_their_character()
    {
        var (_, player, _, campaignId) = await CreatePartyAsync();
        var character = await CreateCharacterAsync(player, campaignId, "Thorin");

        var updated = await (await player.Client.PutAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters/{character.Id}",
                new CharacterRequest(" Thorin II ", CreatureSize.Large),
                Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.OK);

        Assert.Equal(
            new CharacterResponse(character.Id, player.Id, "Brom", "Thorin II", CreatureSize.Large, CanEdit: true, ColorIndex: 0, Appearance: "", PortraitUrl: null),
            updated);
        Assert.Equal(updated, Assert.Single(await ListAsync(player, campaignId)));
    }

    [Fact]
    public async Task A_dm_updates_any_character_without_taking_it_over()
    {
        var (dm, player, _, campaignId) = await CreatePartyAsync();
        var character = await CreateCharacterAsync(player, campaignId, "Thorin");

        var updated = await (await dm.Client.PutAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters/{character.Id}",
                new CharacterRequest("Thorin", CreatureSize.Large),
                Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.OK);

        Assert.Equal((player.Id, CreatureSize.Large, true), (updated.OwnerUserId, updated.Size, updated.CanEdit));
    }

    [Fact]
    public async Task Another_player_cannot_update_a_character()
    {
        var (_, player, otherPlayer, campaignId) = await CreatePartyAsync();
        var character = await CreateCharacterAsync(player, campaignId, "Thorin");

        var response = await otherPlayer.Client.PutAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters/{character.Id}",
            new CharacterRequest("Gestohlen", CreatureSize.Medium),
            Json);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("Thorin", Assert.Single(await ListAsync(player, campaignId)).Name);
    }

    [Fact]
    public async Task Updating_a_character_of_another_campaign_is_not_found()
    {
        var (dm, _, _, campaignId) = await CreatePartyAsync();
        var otherCampaign = await dm.CreateCampaignAsync("Andere Runde");
        var elsewhere = await CreateCharacterAsync(dm, otherCampaign.Id, "Woanders");
        var request = new CharacterRequest("Hier", CreatureSize.Medium);

        var wrongCampaign = await dm.Client.PutAsJsonAsync($"/api/campaigns/{campaignId}/characters/{elsewhere.Id}", request, Json);
        var unknown = await dm.Client.PutAsJsonAsync($"/api/campaigns/{campaignId}/characters/{Guid.NewGuid()}", request, Json);

        Assert.Equal(HttpStatusCode.NotFound, wrongCampaign.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    [InlineData("12345678901234567890123456789012345678901")]
    public async Task Names_must_be_one_to_forty_characters(string? name)
    {
        var (_, player, _, campaignId) = await CreatePartyAsync();
        var character = await CreateCharacterAsync(player, campaignId, new string('x', Character.NameMaxLength));
        var request = new CharacterRequest(name!, CreatureSize.Medium);

        var create = await player.Client.PostAsJsonAsync($"/api/campaigns/{campaignId}/characters", request, Json);
        var update = await player.Client.PutAsJsonAsync($"/api/campaigns/{campaignId}/characters/{character.Id}", request, Json);

        await create.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NameInvalid, "name");
        await update.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.NameInvalid, "name");
    }

    [Fact]
    public async Task Sizes_must_be_defined()
    {
        var (_, player, _, campaignId) = await CreatePartyAsync();
        using var numeric = new StringContent("""{"name":"Thorin","size":42}""", Encoding.UTF8, "application/json");
        using var unknown = new StringContent("""{"name":"Thorin","size":"colossal"}""", Encoding.UTF8, "application/json");

        var numericResponse = await player.Client.PostAsync($"/api/campaigns/{campaignId}/characters", numeric);
        var unknownResponse = await player.Client.PostAsync($"/api/campaigns/{campaignId}/characters", unknown);

        // Enums bind only by name, so a number fails like an unknown name.
        Assert.Equal(HttpStatusCode.BadRequest, numericResponse.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, unknownResponse.StatusCode);
        Assert.Empty(await ListAsync(player, campaignId));
    }

    private async Task<(Person Dm, Person Player, Person OtherPlayer, Guid CampaignId)> CreatePartyAsync()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var otherPlayer = await fixture.App.CreatePersonAsync("Cara");
        var campaign = await dm.CreateCampaignAsync();
        await player.JoinAsync(campaign.JoinCode!);
        await otherPlayer.JoinAsync(campaign.JoinCode!);
        return (dm, player, otherPlayer, campaign.Id);
    }

    private static async Task<CharacterResponse> CreateCharacterAsync(Person owner, Guid campaignId, string name) =>
        await (await owner.Client.PostAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters", new CharacterRequest(name, CreatureSize.Medium), Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.Created);

    private static async Task<List<CharacterResponse>> ListAsync(Person person, Guid campaignId) =>
        await (await person.Client.GetAsync($"/api/campaigns/{campaignId}/characters"))
            .ReadAsync<List<CharacterResponse>>(HttpStatusCode.OK);
}
