using System.Net;
using Microsoft.EntityFrameworkCore;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Images;
using static OreanasOffice.Server.Tests.CampaignTestApi;
using static OreanasOffice.Server.Tests.SyncTestApi;

namespace OreanasOffice.Server.Tests.Images;

// Creature type icons: `dm` members only, one job per type, the type's sync version, the
// monthly limit, picking (knowledge/features/token-icons.md, requirements 1, 5 and 7).
[Collection("App")]
public sealed class IconEndpointTests(AppFixture fixture)
{
    [Fact]
    public async Task Generating_queues_a_version_for_the_type()
    {
        fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        await using var watcher = await TokenImageTestClient.WatchAsync(
            fixture.App, table.Dm.Id, table.CampaignId, AssetOwnerType.CreatureType, table.CreatureTypeId);

        var response = await table.Dm.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, table.TypeVersion);

        var queued = await response.ReadAsync<TokenImage>(HttpStatusCode.Accepted);
        Assert.Equal(IconsUrl(table), response.Headers.Location?.OriginalString);
        Assert.Equal(
            (AssetOwnerType.CreatureType, table.CreatureTypeId, AssetOrigin.Generated, AssetStatus.Queued, (string?)null, (Guid?)null),
            (queued.OwnerType, queued.OwnerId, queued.Origin, queued.Status, queued.Url, queued.SourceAssetId));
        var asset = await fixture.App.AssetAsync(queued.Id);
        Assert.Equal(
            (AssetKind.TokenIcon, table.CampaignId, "fake-image", "high", (Guid?)table.Dm.Id),
            (asset.Kind, asset.CampaignId, asset.Model, asset.Quality, asset.CreatedByUserId));
        await watcher.EndedAsync(queued.Id);
    }

    [Fact]
    public async Task Players_and_strangers_are_refused()
    {
        var table = await fixture.App.CreateTokenTableAsync();

        foreach (var person in new[] { table.Player, table.Stranger })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await person.Client.GetAsync(IconsUrl(table))).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await person.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, table.TypeVersion)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await person.PickIconAsync(table.CampaignId, table.CreatureTypeId, null)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await person.Client.GetAsync($"/api/campaigns/{table.CampaignId}/creature-types/icons")).StatusCode);
        }

        // Every `dm` member may.
        Assert.Empty((await table.SecondDm.ListIconsAsync(table.CampaignId, table.CreatureTypeId)).Versions);
    }

    [Fact]
    public async Task A_type_of_another_campaign_is_not_found()
    {
        var table = await fixture.App.CreateTokenTableAsync();
        var other = await fixture.App.CreateTokenTableAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await table.Dm.Client.GetAsync(IconsUrl(table.CampaignId, other.CreatureTypeId))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await table.Dm.GenerateIconAsync(table.CampaignId, other.CreatureTypeId, 1)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await table.Dm.PickIconAsync(table.CampaignId, other.CreatureTypeId, null)).StatusCode);
    }

    [Fact]
    public async Task An_archived_type_is_not_found_for_generating()
    {
        var table = await fixture.App.CreateTokenTableAsync();
        var archived = await table.Dm.PushOneAsync(CreatureType(
            table.CampaignId, table.CreatureTypeId, baseVersion: table.TypeVersion, archivedAt: DateTimeOffset.UtcNow));

        var response = await table.Dm.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, archived.Server!.Version);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await table.Dm.Client.GetAsync(IconsUrl(table))).StatusCode);
    }

    [Fact]
    public async Task Generating_needs_the_types_version_the_server_has()
    {
        var table = await fixture.App.CreateTokenTableAsync();
        await table.Dm.PushOneAsync(CreatureType(table.CampaignId, table.CreatureTypeId, baseVersion: table.TypeVersion, appearance: "groß"));

        var stale = await table.Dm.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, table.TypeVersion);
        var missing = await table.Dm.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, null);

        await stale.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ItemChanged);
        await missing.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ItemChanged);
        Assert.Empty((await table.Dm.ListIconsAsync(table.CampaignId, table.CreatureTypeId)).Versions);
    }

    [Fact]
    public async Task Only_one_job_per_type_at_a_time()
    {
        var fake = fixture.App.ResetFakeTokens();
        var gate = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fake.Gate = gate;
        var table = await fixture.App.CreateTokenTableAsync();
        await using var watcher = await TokenImageTestClient.WatchAsync(
            fixture.App, table.Dm.Id, table.CampaignId, AssetOwnerType.CreatureType, table.CreatureTypeId);
        try
        {
            var responses = await Task.WhenAll(Enumerable.Range(0, 4)
                .Select(_ => table.Dm.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, table.TypeVersion)));

            var accepted = Assert.Single(responses, r => r.StatusCode == HttpStatusCode.Accepted);
            foreach (var refused in responses.Where(r => r != accepted))
            {
                await refused.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.GenerationRunning);
            }

            var queued = await accepted.ReadAsync<TokenImage>(HttpStatusCode.Accepted);
            await watcher.RunningAsync(queued.Id);
            await (await table.Dm.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, table.TypeVersion))
                .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.GenerationRunning);

            // Another owner isn't blocked: a portrait queues behind the icon.
            var portrait = await table.Player.GeneratePortraitAsync(table.CampaignId, table.CharacterId);
            Assert.Equal(HttpStatusCode.Accepted, portrait.StatusCode);
            gate.SetResult();
            Assert.Equal(AssetStatus.Done, (await watcher.EndedAsync(queued.Id)).Status);
        }
        finally
        {
            gate.TrySetResult();
            fake.Reset();
        }

        Assert.Equal(HttpStatusCode.Accepted, (await table.Dm.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, table.TypeVersion)).StatusCode);
    }

    [Fact]
    public async Task Generating_is_refused_once_the_months_spending_reaches_the_limit()
    {
        fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var before = (await table.Dm.ListIconsAsync(table.CampaignId, table.CreatureTypeId)).Budget;
        var now = DateTimeOffset.UtcNow;
        var seeded = new Asset
        {
            Id = Guid.NewGuid(),
            Kind = AssetKind.TokenIcon,
            OwnerType = AssetOwnerType.CreatureType,
            OwnerId = table.CreatureTypeId,
            CampaignId = table.CampaignId,
            Origin = AssetOrigin.Generated,
            Status = AssetStatus.Done,
            CostUsd = before.LimitUsd - before.SpentUsd,
            CreatedAt = now,
            FinishedAt = now,
        };
        await fixture.App.InDbAsync(async db =>
        {
            db.Assets.Add(seeded);
            return await db.SaveChangesAsync();
        });
        try
        {
            var icon = await table.Dm.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, table.TypeVersion);
            var portrait = await table.Player.GeneratePortraitAsync(table.CampaignId, table.CharacterId);
            var budget = (await table.Player.ListPortraitsAsync(table.CampaignId, table.CharacterId)).Budget;

            await icon.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ImageBudgetExhausted);
            await portrait.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ImageBudgetExhausted);
            Assert.Equal((before.LimitUsd, true), (budget.SpentUsd, budget.Available));
        }
        finally
        {
            await fixture.App.InDbAsync(db => db.Assets.Where(a => a.Id == seeded.Id).ExecuteDeleteAsync());
        }
    }

    [Fact]
    public async Task Without_an_image_model_generating_is_unavailable()
    {
        await using var app = fixture.CreateApp(configuration: new Dictionary<string, string?> { ["Images:Endpoint"] = "" });
        var table = await app.CreateTokenTableAsync();

        var icon = await table.Dm.GenerateIconAsync(table.CampaignId, table.CreatureTypeId, table.TypeVersion);
        var portrait = await table.Player.GeneratePortraitAsync(table.CampaignId, table.CharacterId);

        await icon.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ImagesUnavailable);
        await portrait.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ImagesUnavailable);
        Assert.False((await table.Dm.ListIconsAsync(table.CampaignId, table.CreatureTypeId)).Budget.Available);

        // Uploading needs no model.
        Assert.Equal(HttpStatusCode.Created, (await table.Player.UploadAsync(
            table.CampaignId, table.CharacterId, TestPictures.SplitJpeg(100, 100), "image/jpeg")).StatusCode);
    }

    [Fact]
    public async Task Picking_and_unpicking_dont_change_the_types_sync_version()
    {
        fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var first = await fixture.App.IconAndWaitAsync(table.Dm, table.CampaignId, table.CreatureTypeId);
        var second = await fixture.App.IconAndWaitAsync(table.Dm, table.CampaignId, table.CreatureTypeId);
        var before = await table.Dm.FetchOneAsync(table.CampaignId, table.CreatureTypeId);

        Assert.Equal(second.Id, (await table.Dm.ListIconsAsync(table.CampaignId, table.CreatureTypeId)).PickedAssetId);
        Assert.Equal(HttpStatusCode.NoContent, (await table.Dm.PickIconAsync(table.CampaignId, table.CreatureTypeId, first.Id)).StatusCode);
        var picked = await table.Dm.ListIconsAsync(table.CampaignId, table.CreatureTypeId);
        Assert.Equal(HttpStatusCode.NoContent, (await table.SecondDm.PickIconAsync(table.CampaignId, table.CreatureTypeId, null)).StatusCode);
        var unpicked = await table.Dm.ListIconsAsync(table.CampaignId, table.CreatureTypeId);
        var after = await table.Dm.FetchOneAsync(table.CampaignId, table.CreatureTypeId);

        Assert.Equal(first.Id, picked.PickedAssetId);
        Assert.Equal([second.Id, first.Id], picked.Versions.Select(v => v.Id));
        Assert.Null(unpicked.PickedAssetId);
        Assert.Equal((before.Version, before.UpdatedAt), (after.Version, after.UpdatedAt));
    }

    [Fact]
    public async Task Only_finished_versions_of_the_type_can_be_picked()
    {
        var fake = fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var other = await fixture.App.CreateTokenTableAsync();
        var foreign = await fixture.App.IconAndWaitAsync(other.Dm, other.CampaignId, other.CreatureTypeId);
        var portrait = await table.Player.UploadOkAsync(table.CampaignId, table.CharacterId);
        fake.EnqueueFailure(new ImageRejectedException("moderation"));
        var failed = await fixture.App.IconAndWaitAsync(table.Dm, table.CampaignId, table.CreatureTypeId);

        foreach (var id in new[] { Guid.NewGuid(), foreign.Id, portrait.Id, failed.Id })
        {
            await (await table.Dm.PickIconAsync(table.CampaignId, table.CreatureTypeId, id))
                .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ImageNotFound);
        }
    }

    [Fact]
    public async Task The_bestiary_lists_the_picked_icon_of_each_type_that_has_one()
    {
        fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var orc = await table.Dm.PushOneAsync(CreatureType(table.CampaignId, name: "Ork"));
        await table.Dm.PushOneAsync(CreatureType(table.CampaignId, name: "Wolf"));
        var goblinIcon = await fixture.App.IconAndWaitAsync(table.Dm, table.CampaignId, table.CreatureTypeId);
        var orcIcon = await fixture.App.IconAndWaitAsync(table.Dm, table.CampaignId, orc.Id);

        var icons = await (await table.Dm.Client.GetAsync($"/api/campaigns/{table.CampaignId}/creature-types/icons"))
            .ReadAsync<List<CreatureTypeIcon>>(HttpStatusCode.OK);

        Assert.Equal(
            [
                new CreatureTypeIcon(table.CreatureTypeId, goblinIcon.Id, $"/api/assets/{goblinIcon.Id}"),
                new CreatureTypeIcon(orc.Id, orcIcon.Id, $"/api/assets/{orcIcon.Id}"),
            ],
            icons);
    }

    private static string IconsUrl(TokenTable table) => TokenImageTestApi.IconsUrl(table.CampaignId, table.CreatureTypeId);

    private static string IconsUrl(Guid campaignId, Guid typeId) => TokenImageTestApi.IconsUrl(campaignId, typeId);
}
