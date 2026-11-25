using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Images;
using OreanasOffice.Server.Spells;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SpellTestApi;

namespace OreanasOffice.Server.Tests.Images;

// The art studio (knowledge/features/spell-cards.md, "Art studio") against the fake image model.
[Collection("Images")]
public sealed class SpellArtTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    private static string Studio(Guid variantId) => $"/api/spells/variants/{variantId}/studio";

    private async Task<SpellStudio> StudioAsync(Person person, Guid variantId) =>
        await (await person.Client.GetAsync(Studio(variantId))).ReadAsync<SpellStudio>(HttpStatusCode.OK);

    private async Task<SpellArtImage> UntilFinishedAsync(Person person, Guid variantId, Guid assetId)
    {
        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(30);
        while (true)
        {
            var image = (await StudioAsync(person, variantId)).Images.Single(i => i.Id == assetId);
            if (image.Status is AssetStatus.Done or AssetStatus.Failed || DateTime.UtcNow > deadline)
            {
                return image;
            }

            await Task.Delay(100);
        }
    }

    [Fact]
    public async Task A_motif_is_saved_as_revisions_and_its_picture_becomes_the_first_art()
    {
        var fake = fixture.App.ResetFakeTokens();
        fake.TokenPng = TestPictures.SplitJpeg(1008, 1728);
        var author = await fixture.App.CreatePersonAsync("Mira");
        var stranger = await fixture.App.CreatePersonAsync("Fremd");
        // A spell no other test writes cards for, so the library shows this variant's art.
        var variant = await author.CreateSpellAsync("Conjure Woodland Beings");

        var first = await (await author.Client.PostAsJsonAsync(Studio(variant.Id) + "/prompts", new SaveArtPromptRequest("A", "a druid in moonlight"), Json))
            .ReadAsync<SaveArtPromptResponse>(HttpStatusCode.OK);
        var same = await (await author.Client.PostAsJsonAsync(Studio(variant.Id) + "/prompts", new SaveArtPromptRequest("a", "a druid in moonlight"), Json))
            .ReadAsync<SaveArtPromptResponse>(HttpStatusCode.OK);
        // Saving the current subject again adds no revision; letters are lower case.
        Assert.Equal((first.Prompt.Id, "a"), (same.Prompt.Id, same.Prompt.Letter));

        var saved = await (await author.Client.PostAsJsonAsync(
                Studio(variant.Id) + "/prompts", new SaveArtPromptRequest("a", "wolves under a silver beam", Generate: true), Json))
            .ReadAsync<SaveArtPromptResponse>(HttpStatusCode.OK);
        Assert.NotEqual(first.Prompt.Id, saved.Prompt.Id);
        Assert.Equal(AssetStatus.Queued, saved.Image!.Status);
        Assert.Equal(("a", saved.Prompt.Id), (saved.Image.Letter, saved.Image.PromptId));

        var done = await UntilFinishedAsync(author, variant.Id, saved.Image.Id);
        Assert.Equal(AssetStatus.Done, done.Status);
        var request = Assert.Single(fake.GenerateRequests);
        Assert.Equal((1008, 1728, "high", "opaque", "jpeg"), (request.Width, request.Height, request.Quality, request.Background, request.OutputFormat));
        Assert.Contains("\nSubject: wolves under a silver beam\nVertical portrait 7:12", request.Prompt);

        var studio = await StudioAsync(stranger, variant.Id);
        Assert.False(studio.CanEdit);
        Assert.Equal(saved.Image.Id, studio.Variant.ArtAssetId);
        Assert.Equal(2, studio.Prompts.Count);

        // Spell art is site-wide: anyone signed in loads it.
        var image = await stranger.Client.GetAsync(done.Url);
        Assert.Equal((HttpStatusCode.OK, "image/webp"), (image.StatusCode, image.Content.Headers.ContentType?.MediaType));
        using var bitmap = TestPictures.Decode(await image.Content.ReadAsByteArrayAsync());
        Assert.Equal((672, 1152), (bitmap.Width, bitmap.Height));

        var library = await (await stranger.Client.GetAsync("/api/spells")).ReadAsync<List<SpellSummary>>(HttpStatusCode.OK);
        Assert.Equal(done.Url, library.Single(s => s.Id == variant.SpellId).ArtUrl);
    }

    [Fact]
    public async Task Uploads_reviews_and_picks_belong_to_the_author()
    {
        fixture.App.ResetFakeTokens();
        var author = await fixture.App.CreatePersonAsync("Mira");
        var other = await fixture.App.CreatePersonAsync("Brom");
        var variant = await author.CreateSpellAsync();

        HttpContent Jpeg()
        {
            var content = new ByteArrayContent(TestPictures.SplitJpeg(700, 1200));
            content.Headers.ContentType = new MediaTypeHeaderValue("image/jpeg");
            return content;
        }

        await (await other.Client.PostAsync(Studio(variant.Id) + "/upload", Jpeg())).AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.NotSpellAuthor);
        await (await other.Client.PostAsJsonAsync(Studio(variant.Id) + "/prompts", new SaveArtPromptRequest("a", "x"), Json))
            .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.NotSpellAuthor);

        var first = await (await author.Client.PostAsync(Studio(variant.Id) + "/upload", Jpeg())).ReadAsync<SpellArtImage>(HttpStatusCode.OK);
        var second = await (await author.Client.PostAsync(Studio(variant.Id) + "/upload", Jpeg())).ReadAsync<SpellArtImage>(HttpStatusCode.OK);
        Assert.Equal((AssetOrigin.Uploaded, AssetStatus.Done), (second.Origin, second.Status));
        Assert.Equal(first.Id, (await StudioAsync(author, variant.Id)).Variant.ArtAssetId);

        Assert.Equal(HttpStatusCode.NoContent, (await author.Client.PutAsJsonAsync(Studio(variant.Id) + "/art", new PickArtRequest(second.Id), Json)).StatusCode);
        await (await author.Client.PutAsJsonAsync(Studio(variant.Id) + "/art", new PickArtRequest(Guid.NewGuid()), Json))
            .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ImageNotFound);
        Assert.Equal(HttpStatusCode.NoContent, (await author.Client.PutAsJsonAsync(Studio(variant.Id) + "/approved", new ApproveArtRequest(true), Json)).StatusCode);

        (await author.Client.PostAsJsonAsync(Studio(variant.Id) + "/events", new AddArtEventRequest(SpellArtEventKind.Favorite, first.Id), Json)).EnsureSuccessStatusCode();
        (await author.Client.PostAsJsonAsync(Studio(variant.Id) + "/events", new AddArtEventRequest(SpellArtEventKind.Comment, Value: " Mehr Mond "), Json)).EnsureSuccessStatusCode();
        await (await author.Client.PostAsJsonAsync(Studio(variant.Id) + "/events", new AddArtEventRequest(SpellArtEventKind.Reject), Json))
            .AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.ImageNotFound, "assetId");

        var studio = await StudioAsync(author, variant.Id);
        Assert.Equal((second.Id, true), (studio.Variant.ArtAssetId, studio.Variant.ArtApproved));
        Assert.Equal(
            [(SpellArtEventKind.Favorite, (Guid?)first.Id, "1", "Mira"), (SpellArtEventKind.Comment, null, "Mehr Mond", "Mira")],
            studio.Events.Select(e => (e.Kind, e.AssetId, e.Value, e.UserName)));
    }

    [Fact]
    public async Task A_queued_request_can_be_cancelled_until_it_runs()
    {
        var fake = fixture.App.ResetFakeTokens();
        fake.TokenPng = TestPictures.SplitJpeg(1008, 1728);
        fake.Gate = new TaskCompletionSource();
        var author = await fixture.App.CreatePersonAsync("Mira");
        var variant = await author.CreateSpellAsync();
        (await author.Client.PostAsJsonAsync(Studio(variant.Id) + "/prompts", new SaveArtPromptRequest("a", "moonlight"), Json)).EnsureSuccessStatusCode();

        var running = await (await author.Client.PostAsJsonAsync(Studio(variant.Id) + "/generate", new GenerateArtRequest("a"), Json))
            .ReadAsync<SpellArtImage>(HttpStatusCode.Accepted);
        var queued = await (await author.Client.PostAsJsonAsync(Studio(variant.Id) + "/generate", new GenerateArtRequest("a"), Json))
            .ReadAsync<SpellArtImage>(HttpStatusCode.Accepted);
        Assert.True(queued.QueuePosition > 0);

        var deadline = DateTime.UtcNow + TimeSpan.FromSeconds(10);
        while ((await StudioAsync(author, variant.Id)).Images.Single(i => i.Id == running.Id).Status != AssetStatus.Running && DateTime.UtcNow < deadline)
        {
            await Task.Delay(50);
        }

        Assert.Equal(HttpStatusCode.NoContent, (await author.Client.DeleteAsync($"{Studio(variant.Id)}/requests/{queued.Id}")).StatusCode);
        await (await author.Client.DeleteAsync($"{Studio(variant.Id)}/requests/{running.Id}"))
            .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.GenerationRunning);

        fake.Gate.SetResult();
        Assert.Equal(AssetStatus.Done, (await UntilFinishedAsync(author, variant.Id, running.Id)).Status);
        Assert.Equal([running.Id], (await StudioAsync(author, variant.Id)).Images.Select(i => i.Id));
    }
}
