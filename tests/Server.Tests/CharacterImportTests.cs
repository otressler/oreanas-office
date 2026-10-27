using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Data;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Rules;
using OreanasOffice.Server.Tests.Images;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// knowledge/features/character-import.md.
public sealed class CharacterImportTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    [Fact]
    public async Task A_player_sees_their_own_characters_from_their_other_campaigns()
    {
        var (dm, player, here, there) = await CreateTwoCampaignsAsync();
        var thorin = await CreateCharacterAsync(player, there, new CharacterRequest("Thorin", CreatureSize.Small, Tagline: "Hat immer Hunger.", CharacterClass: "Kämpfer", Species: "Zwerg"));
        await CreateCharacterAsync(player, here, new CharacterRequest("Schon hier", CreatureSize.Medium));
        await CreateCharacterAsync(dm, there, new CharacterRequest("Nicht seiner", CreatureSize.Medium));

        var importable = await ListImportableAsync(player, here);

        Assert.Equal(
            [new ImportableCharacterResponse(thorin.Id, there, "Die Rabenküste", "Thorin", CreatureSize.Small, "Hat immer Hunger.", "Kämpfer", "Zwerg", null, null)],
            importable);
    }

    [Fact]
    public async Task Importing_makes_an_independent_copy_the_importer_owns()
    {
        var (_, player, here, there) = await CreateTwoCampaignsAsync();
        var source = await CreateCharacterAsync(player, there, new CharacterRequest(
            "Liriel", CreatureSize.Medium, Appearance: "Silberhaar", Color: "#4da3ff", Background: "Aus dem Wald",
            Personality: "Still", Bonds: "Ihre Schwester", Tagline: "Sieht alles.", CharacterClass: "Waldläuferin",
            Species: "Waldelfe", Age: "112"));

        var copy = await (await ImportAsync(player, here, source.Id)).ReadAsync<CharacterResponse>(HttpStatusCode.Created);

        Assert.NotEqual(source.Id, copy.Id);
        Assert.Equal(source with { Id = copy.Id, ColorIndex = copy.ColorIndex }, copy);
        Assert.Equal([copy.Id], (await ListAsync(player, here)).Select(c => c.Id));

        // Changing the copy leaves the source alone.
        (await player.Client.PutAsJsonAsync(
            $"/api/campaigns/{here}/characters/{copy.Id}", new CharacterRequest("Liriel die Zweite", CreatureSize.Medium), Json))
            .EnsureSuccessStatusCode();
        Assert.Equal("Liriel", (await ListAsync(player, there)).Single().Name);
    }

    [Fact]
    public async Task Only_the_owners_characters_from_other_campaigns_can_be_imported()
    {
        var (dm, player, here, there) = await CreateTwoCampaignsAsync();
        var dmsCharacter = await CreateCharacterAsync(dm, there, new CharacterRequest("Nicht seiner", CreatureSize.Medium));
        var alreadyHere = await CreateCharacterAsync(player, here, new CharacterRequest("Schon hier", CreatureSize.Medium));
        var stranger = await fixture.App.CreatePersonAsync("Fremd");
        var own = await CreateCharacterAsync(player, there, new CharacterRequest("Thorin", CreatureSize.Small));

        foreach (var id in new[] { dmsCharacter.Id, alreadyHere.Id, Guid.NewGuid() })
        {
            Assert.Equal(HttpStatusCode.NotFound, (await ImportAsync(player, here, id)).StatusCode);
        }

        // Someone outside this campaign can't bring anything in.
        Assert.Equal(HttpStatusCode.Forbidden, (await ImportAsync(stranger, here, own.Id)).StatusCode);
        Assert.Equal([alreadyHere.Id], (await ListAsync(player, here)).Select(c => c.Id));
    }

    [Fact]
    public async Task The_picked_portrait_is_copied_as_a_free_version_of_the_copy()
    {
        var (dm, player, here, there) = await CreateTwoCampaignsAsync();
        var source = await CreateCharacterAsync(player, there, new CharacterRequest("Thorin", CreatureSize.Small));
        var portrait = await player.UploadOkAsync(there, source.Id);

        var copy = await (await ImportAsync(player, here, source.Id)).ReadAsync<CharacterResponse>(HttpStatusCode.Created);

        Assert.NotNull(copy.PortraitUrl);
        Assert.NotEqual(portrait.Url, copy.PortraitUrl);
        var versions = await player.ListPortraitsAsync(here, copy.Id);
        var version = Assert.Single(versions.Versions);
        Assert.Equal((AssetOrigin.Uploaded, AssetStatus.Done, copy.PortraitUrl), (version.Origin, version.Status, version.Url));

        using (var scope = fixture.App.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var asset = await db.Assets.SingleAsync(a => a.Id == version.Id);
            Assert.Equal((here, (decimal?)null), (asset.CampaignId, asset.CostUsd));
        }

        // A member of this campaign who isn't in the source's sees the picture, the same bytes.
        var other = await fixture.App.CreatePersonAsync("Kira");
        await other.JoinAsync((await dm.GetCampaignAsync(here)).JoinCode!);
        var copied = await other.Client.GetByteArrayAsync(copy.PortraitUrl);
        Assert.Equal(await player.Client.GetByteArrayAsync(portrait.Url), copied);
    }

    // The DM Oreana runs both campaigns; the player Brom is in both.
    private async Task<(Person Dm, Person Player, Guid Here, Guid There)> CreateTwoCampaignsAsync()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var here = await dm.CreateCampaignAsync("Die Gruft");
        var there = await dm.CreateCampaignAsync("Die Rabenküste");
        await player.JoinAsync(here.JoinCode!);
        await player.JoinAsync(there.JoinCode!);
        return (dm, player, here.Id, there.Id);
    }

    private static async Task<CharacterResponse> CreateCharacterAsync(Person owner, Guid campaignId, CharacterRequest request) =>
        await (await owner.Client.PostAsJsonAsync($"/api/campaigns/{campaignId}/characters", request, Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.Created);

    private static async Task<List<ImportableCharacterResponse>> ListImportableAsync(Person person, Guid campaignId) =>
        await (await person.Client.GetAsync($"/api/campaigns/{campaignId}/characters/importable"))
            .ReadAsync<List<ImportableCharacterResponse>>(HttpStatusCode.OK);

    private static async Task<HttpResponseMessage> ImportAsync(Person person, Guid campaignId, Guid characterId) =>
        await person.Client.PostAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters/import", new ImportCharacterRequest(characterId), Json);

    private static async Task<List<CharacterResponse>> ListAsync(Person person, Guid campaignId) =>
        await (await person.Client.GetAsync($"/api/campaigns/{campaignId}/characters"))
            .ReadAsync<List<CharacterResponse>>(HttpStatusCode.OK);
}
