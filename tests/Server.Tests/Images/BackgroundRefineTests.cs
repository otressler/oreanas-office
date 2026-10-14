using System.Net;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Images;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests.Images;

// Refining a finished version with an instruction (knowledge/features/ai-map-generation.md,
// "Refining"): a new version from the picture and the guide.
[Collection("App")]
public sealed class BackgroundRefineTests(AppFixture fixture)
{
    [Fact]
    public async Task A_refinement_sends_the_picture_then_the_guide_and_becomes_a_new_version()
    {
        var fake = fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var first = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        var version = (await dm.FetchOneAsync(campaignId, mapId)).Version;
        fake.Reset();

        await using var watcher = await ImageTestClient.WatchAsync(fixture.App, dm.Id, campaignId, mapId);
        var queued = await (await dm.RefineAsync(campaignId, mapId, version, first.Id, "  Die Brücke doppelt so breit  "))
            .ReadAsync<MapBackground>(HttpStatusCode.Accepted);
        Assert.Equal((first.Id, "Die Brücke doppelt so breit"), (queued.RefinedFromId, queued.Instruction));
        var done = await watcher.EndedAsync(queued.Id);

        Assert.Equal(AssetStatus.Done, done.Status);
        var request = Assert.Single(fake.Requests);
        var stored = await (await dm.GetAssetAsync(first.Id)).Content.ReadAsByteArrayAsync();
        Assert.Equal(stored, request.Picture!.Content);
        Assert.StartsWith("Edit the first image, a top-down battle map for a tabletop game. Change only this: Die Brücke doppelt so breit.\n", request.Prompt);
        Assert.Contains("\nThe second image is the colour-coded layout of the same map.", request.Prompt);
        Assert.Equal(request.Prompt, (await fixture.App.AssetAsync(done.Id)).Prompt);

        var list = await dm.ListBackgroundsAsync(campaignId, mapId);
        Assert.Equal([done.Id, first.Id], list.Versions.Select(v => v.Id));
        // The first version stays picked; the DM picks the refinement when it is better.
        Assert.Equal(first.Id, list.PickedAssetId);
    }

    [Fact]
    public async Task A_refinement_needs_an_instruction_and_a_finished_version_that_fits()
    {
        fixture.App.ResetFakeImages();
        var (dm, campaignId, mapId) = await fixture.App.DmWithMapAsync();
        var first = await fixture.App.GenerateAndWaitAsync(dm, campaignId, mapId);
        var (otherDm, otherCampaign, otherMap) = await fixture.App.DmWithMapAsync("Fremd");
        var foreign = await fixture.App.GenerateAndWaitAsync(otherDm, otherCampaign, otherMap);
        var version = (await dm.FetchOneAsync(campaignId, mapId)).Version;

        await AssertConflict(ApiErrorCode.InstructionInvalid, await dm.RefineAsync(campaignId, mapId, version, first.Id, "   "));
        await AssertConflict(ApiErrorCode.InstructionInvalid, await dm.RefineAsync(campaignId, mapId, version, first.Id, new string('x', 501)));
        await AssertConflict(ApiErrorCode.BackgroundNotFound, await dm.RefineAsync(campaignId, mapId, version, Guid.NewGuid(), "breiter"));

        // Another map's version.
        await AssertConflict(ApiErrorCode.BackgroundNotFound, await dm.RefineAsync(campaignId, mapId, version, foreign.Id, "breiter"));

        // Resized: the version was made for another size.
        var map = await dm.FetchOneAsync(campaignId, mapId);
        await dm.PushOneAsync(Map(campaignId, mapId, map.Version, map.Map! with { Width = 9 }));
        var resized = (await dm.FetchOneAsync(campaignId, mapId)).Version;
        await AssertConflict(ApiErrorCode.BackgroundOutdated, await dm.RefineAsync(campaignId, mapId, resized, first.Id, "breiter"));
    }

    private static async Task AssertConflict(ApiErrorCode code, HttpResponseMessage response) =>
        Assert.Equal(code, (await response.ReadAsync<ApiError>(HttpStatusCode.Conflict)).Code);
}
