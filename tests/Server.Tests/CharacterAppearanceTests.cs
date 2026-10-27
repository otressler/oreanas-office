using System.Net;
using System.Net.Http.Json;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Rules;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests;

// A character's appearance feeds its portrait prompt (knowledge/domain/character.md).
public sealed class CharacterAppearanceTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    [Fact]
    public async Task The_appearance_is_saved_trimmed()
    {
        var (player, campaignId) = await PlayerAsync();

        var created = await (await player.Client.PostAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters", new CharacterRequest("Thorin", CreatureSize.Medium, "  Zwerg, roter Bart \n"), Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.Created);
        var updated = await (await player.Client.PutAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters/{created.Id}", new CharacterRequest("Thorin", CreatureSize.Medium, " Zwerg mit Helm "), Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.OK);
        var cleared = await (await player.Client.PutAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters/{created.Id}", new CharacterRequest("Thorin", CreatureSize.Medium), Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.OK);

        Assert.Equal(("Zwerg, roter Bart", "Zwerg mit Helm", ""), (created.Appearance, updated.Appearance, cleared.Appearance));
    }

    [Fact]
    public async Task An_appearance_over_500_characters_is_refused()
    {
        var (player, campaignId) = await PlayerAsync();
        var character = await player.CreateCharacterAsync(campaignId, "Thorin");

        var create = await player.Client.PostAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters", new CharacterRequest("Aria", CreatureSize.Medium, new string('x', 751)), Json);
        var update = await player.Client.PutAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters/{character.Id}", new CharacterRequest("Thorin", CreatureSize.Medium, new string('x', 751)), Json);
        var atLimit = await player.Client.PutAsJsonAsync(
            $"/api/campaigns/{campaignId}/characters/{character.Id}", new CharacterRequest("Thorin", CreatureSize.Medium, new string('x', 750)), Json);

        await create.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.TextTooLong, "appearance");
        await update.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.TextTooLong, "appearance");
        Assert.Equal(750, (await atLimit.ReadAsync<CharacterResponse>(HttpStatusCode.OK)).Appearance.Length);
    }

    [Fact]
    public async Task Background_personality_and_bonds_are_saved_trimmed_and_cleared_when_left_out()
    {
        var (player, campaignId) = await PlayerAsync();

        var created = await (await player.Client.PostAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters",
                new CharacterRequest("Liriel", CreatureSize.Medium, Background: " Späherin \n", Personality: " trocken ", Bonds: " Bruder gesucht ", Tagline: " Sucht ihren Bruder. "),
                Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.Created);
        var cleared = await (await player.Client.PutAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters/{created.Id}", new CharacterRequest("Liriel", CreatureSize.Medium), Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.OK);

        Assert.Equal(("Späherin", "trocken", "Bruder gesucht", "Sucht ihren Bruder."), (created.Background, created.Personality, created.Bonds, created.Tagline));
        Assert.Equal(("", "", "", ""), (cleared.Background, cleared.Personality, cleared.Bonds, cleared.Tagline));
    }

    [Fact]
    public async Task Class_species_and_age_are_saved_trimmed_and_cleared_when_left_out()
    {
        var (player, campaignId) = await PlayerAsync();

        var created = await (await player.Client.PostAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters",
                new CharacterRequest("Ireena", CreatureSize.Medium, CharacterClass: " Duellantin ", Species: " Mensch ", Age: " Ende zwanzig "),
                Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.Created);
        var cleared = await (await player.Client.PutAsJsonAsync(
                $"/api/campaigns/{campaignId}/characters/{created.Id}", new CharacterRequest("Ireena", CreatureSize.Medium), Json))
            .ReadAsync<CharacterResponse>(HttpStatusCode.OK);

        Assert.Equal(("Duellantin", "Mensch", "Ende zwanzig"), (created.CharacterClass, created.Species, created.Age));
        Assert.Equal(("", "", ""), (cleared.CharacterClass, cleared.Species, cleared.Age));
    }

    [Theory]
    [InlineData("characterClass")]
    [InlineData("species")]
    [InlineData("age")]
    public async Task A_fact_over_its_limit_is_refused(string field)
    {
        var (player, campaignId) = await PlayerAsync();
        var text = new string('x', Character.FactMaxLength + 1);
        var request = field switch
        {
            "characterClass" => new CharacterRequest("Ireena", CreatureSize.Medium, CharacterClass: text),
            "species" => new CharacterRequest("Ireena", CreatureSize.Medium, Species: text),
            _ => new CharacterRequest("Ireena", CreatureSize.Medium, Age: text),
        };

        var response = await player.Client.PostAsJsonAsync($"/api/campaigns/{campaignId}/characters", request, Json);

        await response.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.TextTooLong, field);
    }

    [Theory]
    [InlineData("background", 1501)]
    [InlineData("personality", 751)]
    [InlineData("bonds", 1501)]
    [InlineData("tagline", 121)]
    public async Task A_story_text_over_its_limit_is_refused(string field, int length)
    {
        var (player, campaignId) = await PlayerAsync();
        var text = new string('x', length);
        var request = field switch
        {
            "background" => new CharacterRequest("Liriel", CreatureSize.Medium, Background: text),
            "personality" => new CharacterRequest("Liriel", CreatureSize.Medium, Personality: text),
            "tagline" => new CharacterRequest("Liriel", CreatureSize.Medium, Tagline: text),
            _ => new CharacterRequest("Liriel", CreatureSize.Medium, Bonds: text),
        };

        var response = await player.Client.PostAsJsonAsync($"/api/campaigns/{campaignId}/characters", request, Json);

        await response.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.TextTooLong, field);
    }

    private async Task<(Person Player, Guid CampaignId)> PlayerAsync()
    {
        var dm = await fixture.App.CreatePersonAsync("Oreana");
        var player = await fixture.App.CreatePersonAsync("Brom");
        var campaign = await dm.CreateCampaignAsync();
        await player.JoinAsync(campaign.JoinCode!);
        return (player, campaign.Id);
    }
}
