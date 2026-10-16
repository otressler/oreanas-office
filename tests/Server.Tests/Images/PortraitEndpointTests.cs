using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using OreanasOffice.Server.Api;
using OreanasOffice.Server.Characters;
using OreanasOffice.Server.Images;
using SkiaSharp;
using static OreanasOffice.Server.Tests.CampaignTestApi;

namespace OreanasOffice.Server.Tests.Images;

// Character portraits: generated from the appearance, uploaded, restyled and picked by the
// character's owner or a `dm` member (knowledge/features/token-icons.md, requirements 2–4,
// knowledge/domain/character.md "Permissions").
[Collection("Images")]
public sealed class PortraitEndpointTests(AppFixture fixture) : IClassFixture<AppFixture>
{
    [Fact]
    public async Task The_owner_and_dm_members_may_and_other_players_may_not()
    {
        fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync();
        var (campaignId, characterId) = (table.CampaignId, table.CharacterId);

        var other = table.OtherPlayer;
        Assert.Equal(HttpStatusCode.Forbidden, (await other.Client.GetAsync(PortraitsUrl(table))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.GeneratePortraitAsync(campaignId, characterId)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.UploadAsync(campaignId, characterId, TestPictures.SplitJpeg(50, 50), "image/jpeg")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PickPortraitAsync(campaignId, characterId, null)).StatusCode);

        var stranger = table.Stranger;
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.Client.GetAsync(PortraitsUrl(table))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GeneratePortraitAsync(campaignId, characterId)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.UploadAsync(campaignId, characterId, TestPictures.SplitJpeg(50, 50), "image/jpeg")).StatusCode);

        var byOwner = await table.Player.UploadOkAsync(campaignId, characterId);
        var byDm = await table.SecondDm.UploadOkAsync(campaignId, characterId);
        Assert.Equal(HttpStatusCode.NoContent, (await table.Dm.PickPortraitAsync(campaignId, characterId, byOwner.Id)).StatusCode);
        var generated = await fixture.App.PortraitAndWaitAsync(table.Dm, campaignId, characterId);

        var list = await table.Player.ListPortraitsAsync(campaignId, characterId);
        Assert.Equal([generated.Id, byDm.Id, byOwner.Id], list.Versions.Select(v => v.Id));
        Assert.Equal(generated.Id, list.PickedAssetId);
    }

    [Fact]
    public async Task A_character_of_another_campaign_is_not_found()
    {
        var table = await fixture.App.CreateTokenTableAsync();
        var other = await fixture.App.CreateTokenTableAsync();

        Assert.Equal(HttpStatusCode.NotFound, (await table.Dm.Client.GetAsync(TokenImageTestApi.PortraitsUrl(table.CampaignId, other.CharacterId))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await table.Dm.GeneratePortraitAsync(table.CampaignId, other.CharacterId)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await table.Dm.UploadAsync(table.CampaignId, other.CharacterId, TestPictures.SplitJpeg(50, 50), "image/jpeg")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await table.Dm.PickPortraitAsync(table.CampaignId, other.CharacterId, null)).StatusCode);
    }

    [Fact]
    public async Task Generating_needs_an_appearance()
    {
        var table = await fixture.App.CreateTokenTableAsync(appearance: "   ");

        var response = await table.Player.GeneratePortraitAsync(table.CampaignId, table.CharacterId);

        await response.AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.AppearanceMissing);
    }

    [Fact]
    public async Task A_restyle_needs_an_uploaded_version_of_the_character()
    {
        fixture.App.ResetFakeTokens();
        var table = await fixture.App.CreateTokenTableAsync(appearance: "");
        var other = await fixture.App.CreateTokenTableAsync();
        var foreignUpload = await other.Player.UploadOkAsync(other.CampaignId, other.CharacterId);
        var ownUpload = await table.Player.UploadOkAsync(table.CampaignId, table.CharacterId);
        var restyled = await fixture.App.PortraitAndWaitAsync(table.Player, table.CampaignId, table.CharacterId, ownUpload.Id);
        Assert.Equal(AssetStatus.Done, restyled.Status);

        foreach (var id in new[] { Guid.NewGuid(), foreignUpload.Id, restyled.Id })
        {
            await (await table.Player.GeneratePortraitAsync(table.CampaignId, table.CharacterId, id))
                .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ImageNotFound);
        }
    }

    [Fact]
    public async Task An_upload_becomes_a_finished_picked_square_webp()
    {
        var table = await fixture.App.CreateTokenTableAsync();
        await table.Player.UploadOkAsync(table.CampaignId, table.CharacterId);

        var response = await table.Player.UploadAsync(table.CampaignId, table.CharacterId, TestPictures.SplitJpeg(300, 200), "image/jpeg");

        var upload = await response.ReadAsync<TokenImage>(HttpStatusCode.Created);
        Assert.Equal(PortraitsUrl(table), response.Headers.Location?.OriginalString);
        Assert.Equal(
            (AssetOwnerType.Character, table.CharacterId, AssetOrigin.Uploaded, AssetStatus.Done, $"/api/assets/{upload.Id}", (AssetFailure?)null),
            (upload.OwnerType, upload.OwnerId, upload.Origin, upload.Status, upload.Url, upload.Failure));
        Assert.NotNull(upload.FinishedAt);
        var asset = await fixture.App.AssetAsync(upload.Id);
        Assert.Equal(
            ($"tokens/character/{table.CharacterId}/{upload.Id}.webp", "image/webp", (decimal?)null, (string?)null, (Guid?)table.Player.Id),
            (asset.BlobName, asset.ContentType, asset.CostUsd, asset.Prompt, asset.CreatedByUserId));

        var list = await table.Player.ListPortraitsAsync(table.CampaignId, table.CharacterId);
        Assert.Equal(upload.Id, list.PickedAssetId);
        Assert.Equal(2, list.Versions.Count);
        var character = Assert.Single(
            (await table.Player.Client.GetFromJsonAsync<List<CharacterResponse>>($"/api/campaigns/{table.CampaignId}/characters", Json))!,
            c => c.Id == table.CharacterId);
        Assert.Equal($"/api/assets/{upload.Id}", character.PortraitUrl);

        var image = await table.Player.GetAssetAsync(upload.Id);
        Assert.Equal(HttpStatusCode.OK, image.StatusCode);
        Assert.Equal("image/webp", image.Content.Headers.ContentType?.MediaType);
        using var bitmap = TestPictures.Decode(await image.Content.ReadAsByteArrayAsync());
        Assert.Equal((512, 512), (bitmap.Width, bitmap.Height));
    }

    [Fact]
    public async Task An_upload_is_turned_upright_and_loses_its_metadata()
    {
        var table = await fixture.App.CreateTokenTableAsync();
        var photo = TestPictures.WithExif(TestPictures.SplitJpeg(80, 40), orientation: 6);

        var upload = await table.Player.UploadOkAsync(table.CampaignId, table.CharacterId, photo);

        var stored = await (await table.Player.GetAssetAsync(upload.Id)).Content.ReadAsByteArrayAsync();
        Assert.False(TestPictures.Contains(stored, "Exif"u8));
        Assert.All(TestPictures.WebpChunks(stored), chunk => Assert.Contains(chunk, new[] { "VP8 ", "VP8L", "VP8X", "ALPH" }));
        using var bitmap = TestPictures.Decode(stored);
        var top = bitmap.GetPixel(256, 100);
        var bottom = bitmap.GetPixel(256, 412);
        Assert.True(top.Red > 150 && top.Blue < 100, $"Expected red at the top, got {top}.");
        Assert.True(bottom.Blue > 150 && bottom.Red < 100, $"Expected blue at the bottom, got {bottom}.");
    }

    [Fact]
    public async Task Png_and_webp_uploads_are_accepted()
    {
        var table = await fixture.App.CreateTokenTableAsync();

        var png = await table.Player.UploadAsync(table.CampaignId, table.CharacterId, TestPictures.TransparentPng(100, 100), "image/png");
        var webp = await table.Player.UploadAsync(table.CampaignId, table.CharacterId, TestPictures.Webp(100, 100), "image/webp");

        Assert.Equal(HttpStatusCode.Created, png.StatusCode);
        Assert.Equal(HttpStatusCode.Created, webp.StatusCode);
    }

    [Fact]
    public async Task Other_types_and_unreadable_pictures_are_refused()
    {
        var table = await fixture.App.CreateTokenTableAsync();
        var (campaignId, characterId) = (table.CampaignId, table.CharacterId);
        var jpeg = TestPictures.SplitJpeg(100, 100);

        var cases = new[]
        {
            await table.Player.UploadAsync(campaignId, characterId, "GIF89a\x01\x00\x01\x00"u8.ToArray(), "image/gif"),
            await table.Player.UploadAsync(campaignId, characterId, jpeg, "text/plain"),
            await table.Player.UploadAsync(campaignId, characterId, "<svg/>"u8.ToArray(), "image/svg+xml"),
            // The bytes aren't the picture the Content-Type says.
            await table.Player.UploadAsync(campaignId, characterId, jpeg, "image/png"),
            await table.Player.UploadAsync(campaignId, characterId, "not a picture"u8.ToArray(), "image/jpeg"),
            await table.Player.UploadAsync(campaignId, characterId, jpeg[..(jpeg.Length / 2)], "image/jpeg"),
            await table.Player.UploadAsync(campaignId, characterId, [], "image/jpeg"),
            await table.Player.Client.PostAsync($"{PortraitsUrl(table)}/upload", new ByteArrayContent(jpeg)),
        };

        foreach (var response in cases)
        {
            await response.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.UploadInvalid);
        }

        Assert.Empty((await table.Player.ListPortraitsAsync(campaignId, characterId)).Versions);
    }

    [Fact]
    public async Task A_picture_larger_than_the_limit_is_refused()
    {
        await using var app = fixture.CreateApp(configuration: new Dictionary<string, string?>
        {
            ["Images:UploadMaxBytes"] = "2000",
            ["Images:UploadMaxPixels"] = "100",
        });
        var table = await app.CreateTokenTableAsync();
        var (campaignId, characterId) = (table.CampaignId, table.CharacterId);
        var large = TestPictures.Encode(90, 90, SKEncodedImageFormat.Png, canvas =>
        {
            // Noise, so the PNG doesn't compress below the limit.
            var random = new Random(7);
            for (var i = 0; i < 2000; i++)
            {
                using var paint = new SKPaint { Color = new SKColor((uint)random.Next() | 0xFF000000) };
                canvas.DrawPoint(random.Next(90), random.Next(90), paint);
            }
        });
        Assert.True(large.Length > 2000);

        var declared = await table.Player.UploadAsync(campaignId, characterId, large, "image/png");
        // Without a Content-Length the server stops reading after the limit.
        var streamed = new StreamContent(new MemoryStream(large));
        streamed.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        var chunked = new HttpRequestMessage(HttpMethod.Post, $"{PortraitsUrl(table)}/upload") { Content = streamed };
        chunked.Headers.TransferEncodingChunked = true;
        var undeclared = await table.Player.Client.SendAsync(chunked);
        var tooWide = await table.Player.UploadAsync(campaignId, characterId, TestPictures.OpaquePng(101, 20), "image/png");

        await declared.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.UploadTooLarge);
        await undeclared.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.UploadTooLarge);
        await tooWide.AssertErrorAsync(HttpStatusCode.BadRequest, ApiErrorCode.UploadInvalid);
        Assert.Equal(HttpStatusCode.Created, (await table.Player.UploadAsync(campaignId, characterId, TestPictures.OpaquePng(100, 20), "image/png")).StatusCode);
    }

    [Fact]
    public async Task Picking_and_unpicking_a_portrait()
    {
        var table = await fixture.App.CreateTokenTableAsync();
        var other = await fixture.App.CreateTokenTableAsync();
        var first = await table.Player.UploadOkAsync(table.CampaignId, table.CharacterId);
        await table.Player.UploadOkAsync(table.CampaignId, table.CharacterId);
        var foreign = await other.Player.UploadOkAsync(other.CampaignId, other.CharacterId);

        Assert.Equal(HttpStatusCode.NoContent, (await table.Player.PickPortraitAsync(table.CampaignId, table.CharacterId, first.Id)).StatusCode);
        Assert.Equal(first.Id, (await table.Player.ListPortraitsAsync(table.CampaignId, table.CharacterId)).PickedAssetId);
        await (await table.Player.PickPortraitAsync(table.CampaignId, table.CharacterId, foreign.Id))
            .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ImageNotFound);
        await (await table.Player.PickPortraitAsync(table.CampaignId, table.CharacterId, Guid.NewGuid()))
            .AssertErrorAsync(HttpStatusCode.Conflict, ApiErrorCode.ImageNotFound);
        Assert.Equal(HttpStatusCode.NoContent, (await table.Dm.PickPortraitAsync(table.CampaignId, table.CharacterId, null)).StatusCode);

        Assert.Null((await table.Player.ListPortraitsAsync(table.CampaignId, table.CharacterId)).PickedAssetId);
        var character = Assert.Single(
            (await table.Player.Client.GetFromJsonAsync<List<CharacterResponse>>($"/api/campaigns/{table.CampaignId}/characters", Json))!,
            c => c.Id == table.CharacterId);
        Assert.Null(character.PortraitUrl);
    }

    private static string PortraitsUrl(TokenTable table) => TokenImageTestApi.PortraitsUrl(table.CampaignId, table.CharacterId);
}
