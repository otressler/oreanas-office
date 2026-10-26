using OreanasOffice.Server.Images;
using OreanasOffice.Server.Maps;
using SkiaSharp;
using static OreanasOffice.Server.Tests.Images.TestPictures;

namespace OreanasOffice.Server.Tests.Images;

// Uploaded map backgrounds become WebPs no larger than ImageOptions.BackgroundPixels, the
// right way up; their first frame keeps the picture's aspect, and the DM's placement is
// checked against the server's limits (knowledge/features/ai-map-generation.md, "Uploads").
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class BackgroundPictureTests
{
    private const int LongEdge = 4096;
    private const int MaxPixels = 8192;

    [Fact]
    public void A_large_upload_is_shrunk_to_the_long_edge_keeping_its_aspect()
    {
        var stored = BackgroundPicture.FromUpload(OpaquePng(5000, 2500), SKEncodedImageFormat.Png, LongEdge, MaxPixels);

        Assert.NotNull(stored);
        Assert.Equal(SKEncodedImageFormat.Webp, TokenPicture.Identify(stored.Bytes));
        Assert.Equal((4096, 2048), (stored.Width, stored.Height));
        using var bitmap = Decode(stored.Bytes);
        Assert.Equal((4096, 2048), (bitmap.Width, bitmap.Height));
    }

    [Fact]
    public void A_small_upload_keeps_its_size_and_its_alpha()
    {
        var stored = BackgroundPicture.FromUpload(TransparentPng(300, 200), SKEncodedImageFormat.Png, LongEdge, MaxPixels);

        Assert.NotNull(stored);
        Assert.Equal((300, 200), (stored.Width, stored.Height));
        using var bitmap = Decode(stored.Bytes);
        Assert.Equal(0, bitmap.GetPixel(2, 2).Alpha);
    }

    [Fact]
    public void Webp_and_jpeg_uploads_are_taken()
    {
        Assert.NotNull(BackgroundPicture.FromUpload(Webp(64, 32), SKEncodedImageFormat.Webp, LongEdge, MaxPixels));
        Assert.NotNull(BackgroundPicture.FromUpload(SplitJpeg(64, 32), SKEncodedImageFormat.Jpeg, LongEdge, MaxPixels));
    }

    [Fact]
    public void An_upload_turned_by_its_exif_orientation_is_stored_upright()
    {
        // Orientation 6: the stored pixels are turned; upright the picture is taller than wide.
        var stored = BackgroundPicture.FromUpload(WithExif(SplitJpeg(400, 200), 6), SKEncodedImageFormat.Jpeg, LongEdge, MaxPixels);

        Assert.NotNull(stored);
        Assert.Equal((200, 400), (stored.Width, stored.Height));
    }

    [Fact]
    public void Bytes_that_are_not_the_declared_format_or_too_wide_are_refused()
    {
        Assert.Null(BackgroundPicture.FromUpload(OpaquePng(64, 64), SKEncodedImageFormat.Jpeg, LongEdge, MaxPixels));
        Assert.Null(BackgroundPicture.FromUpload("GIF89a"u8.ToArray(), SKEncodedImageFormat.Png, LongEdge, MaxPixels));
        Assert.Null(BackgroundPicture.FromUpload(OpaquePng(200, 10), SKEncodedImageFormat.Png, LongEdge, 100));
    }

    [Fact]
    public void An_uploads_first_frame_fits_into_the_map_it_was_uploaded_for_centred()
    {
        var wide = new Asset { Origin = AssetOrigin.Uploaded, GridWidth = 8, GridHeight = 5, PixelWidth = 400, PixelHeight = 200 };
        var tall = new Asset { Origin = AssetOrigin.Uploaded, GridWidth = 8, GridHeight = 5, PixelWidth = 100, PixelHeight = 200 };

        Assert.Equal((0d, 0.5d, 8d, 4d), MapBackgrounds.Frame(wide));
        Assert.Equal((2.75d, 0d, 2.5d, 5d), MapBackgrounds.Frame(tall));
    }

    [Fact]
    public void An_upload_fits_every_map_size_and_a_generated_one_only_its_own()
    {
        var uploaded = new Asset { Origin = AssetOrigin.Uploaded, GridWidth = 8, GridHeight = 5 };
        var generated = new Asset { Origin = AssetOrigin.Generated, GridWidth = 8, GridHeight = 5 };

        Assert.True(MapBackgrounds.Fits(uploaded, 12, 3));
        Assert.True(MapBackgrounds.Fits(generated, 8, 5));
        Assert.False(MapBackgrounds.Fits(generated, 9, 5));
    }

    [Theory]
    [InlineData(0, 0, 8, 5, 0, true)]
    [InlineData(-3.5, 2.25, 10.5, 6, -1.5, true)]
    [InlineData(0, 0, 0, 5, 0, false)]
    [InlineData(0, 0, 8, 401, 0, false)]
    [InlineData(401, 0, 8, 5, 0, false)]
    [InlineData(0, 0, 8, 5, 400, false)]
    [InlineData(double.NaN, 0, 8, 5, 0, false)]
    public void A_placement_must_stay_within_the_limits(double x, double y, double width, double height, double rotation, bool valid) =>
        Assert.Equal(valid, new BackgroundPlacement(Guid.NewGuid(), x, y, width, height, rotation).IsValid());
}
