using OreanasOffice.Server.Images;
using SkiaSharp;
using static OreanasOffice.Server.Tests.Images.TestPictures;

namespace OreanasOffice.Server.Tests.Images;

// Uploads and model pictures become square WebPs with alpha, the right way up and without
// the photo's metadata (knowledge/features/token-icons.md, requirement 3).
[Trait(TestCategory.Name, TestCategory.Unit)]
public sealed class TokenPictureTests
{
    private const int Size = 512;
    private const int MaxPixels = 8192;

    [Theory]
    [InlineData(new byte[] { 0xFF, 0xD8, 0xFF, 0xE0 }, SKEncodedImageFormat.Jpeg)]
    [InlineData(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0 }, SKEncodedImageFormat.Png)]
    [InlineData(new byte[] { 0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50 }, SKEncodedImageFormat.Webp)]
    public void The_format_is_read_from_the_first_bytes(byte[] start, SKEncodedImageFormat format) =>
        Assert.Equal(format, TokenPicture.Identify(start));

    [Theory]
    [InlineData("GIF89a")]
    [InlineData("<svg xmlns=\"http://www.w3.org/2000/svg\"/>")]
    [InlineData("BM")]
    [InlineData("")]
    public void Other_formats_are_not_identified(string start) =>
        Assert.Null(TokenPicture.Identify(System.Text.Encoding.ASCII.GetBytes(start)));

    [Fact]
    public void An_upload_becomes_a_square_webp_of_the_token_size()
    {
        var webp = TokenPicture.FromUpload(SplitJpeg(400, 200), Size, MaxPixels);

        Assert.NotNull(webp);
        Assert.Equal(SKEncodedImageFormat.Webp, TokenPicture.Identify(webp));
        using var bitmap = Decode(webp);
        Assert.Equal((Size, Size), (bitmap.Width, bitmap.Height));

        // The middle square of a left-red, right-blue picture: still red left, blue right.
        AssertRed(bitmap.GetPixel(100, Size / 2));
        AssertBlue(bitmap.GetPixel(Size - 100, Size / 2));
    }

    [Fact]
    public void A_cover_is_the_middle_of_the_picture_at_the_cover_size()
    {
        // A square left-red, right-blue picture: the 3:2 cover cuts off top and bottom only.
        var webp = TokenPicture.FromUpload(SplitJpeg(400, 400), 300, 200, MaxPixels);

        using var bitmap = Decode(webp!);
        Assert.Equal((300, 200), (bitmap.Width, bitmap.Height));
        AssertRed(bitmap.GetPixel(60, 100));
        AssertBlue(bitmap.GetPixel(240, 100));
    }

    [Fact]
    public void A_small_upload_is_scaled_up_to_the_token_size()
    {
        var webp = TokenPicture.FromUpload(OpaquePng(60, 40), Size, MaxPixels);

        using var bitmap = Decode(webp!);
        Assert.Equal((Size, Size), (bitmap.Width, bitmap.Height));
    }

    [Fact]
    public void Png_and_webp_uploads_are_accepted()
    {
        Assert.NotNull(TokenPicture.FromUpload(OpaquePng(100, 100), Size, MaxPixels));
        Assert.NotNull(TokenPicture.FromUpload(Webp(100, 100), Size, MaxPixels));
    }

    // EXIF orientation (TIFF tag 0x0112): 1 upright, 3 turned upside down, 6 to be turned
    // a quarter clockwise, 8 a quarter anticlockwise. The stored picture is left red, right
    // blue, 80 × 40; the middle square of the upright picture shows the halves where the
    // turn puts them.
    [Theory]
    [InlineData((ushort)1, "left")]
    [InlineData((ushort)3, "right")]
    [InlineData((ushort)6, "top")]
    [InlineData((ushort)8, "bottom")]
    public void The_exif_orientation_turns_the_picture_upright(ushort orientation, string redSide)
    {
        var webp = TokenPicture.FromUpload(WithExif(SplitJpeg(80, 40), orientation), Size, MaxPixels);

        using var bitmap = Decode(webp!);
        var (red, blue) = redSide switch
        {
            "left" => ((100, Size / 2), (Size - 100, Size / 2)),
            "right" => ((Size - 100, Size / 2), (100, Size / 2)),
            "top" => ((Size / 2, 100), (Size / 2, Size - 100)),
            _ => ((Size / 2, Size - 100), (Size / 2, 100)),
        };
        AssertRed(bitmap.GetPixel(red.Item1, red.Item2));
        AssertBlue(bitmap.GetPixel(blue.Item1, blue.Item2));
    }

    [Fact]
    public void The_photos_metadata_and_position_are_dropped()
    {
        var photo = WithExif(SplitJpeg(80, 40), 6);
        Assert.True(Contains(photo, "Exif\0\0"u8));

        var webp = TokenPicture.FromUpload(photo, Size, MaxPixels)!;

        // Only image data: no EXIF, XMP or ICC chunk, and nothing of the EXIF bytes.
        Assert.All(WebpChunks(webp), chunk => Assert.Contains(chunk, new[] { "VP8 ", "VP8L", "VP8X", "ALPH" }));
        Assert.False(Contains(webp, "Exif"u8));
        Assert.False(Contains(webp, "MM\0*"u8));
        using var codec = SKCodec.Create(new SKMemoryStream(webp));
        Assert.Equal(SKEncodedOrigin.TopLeft, codec.EncodedOrigin);
    }

    [Fact]
    public void Transparency_is_kept()
    {
        var webp = TokenPicture.FromUpload(TransparentPng(100, 100), Size, MaxPixels);

        using var bitmap = Decode(webp!);
        Assert.Equal(0, bitmap.GetPixel(5, 5).Alpha);
        Assert.Equal(255, bitmap.GetPixel(Size / 2, Size / 2).Alpha);
        AssertRed(bitmap.GetPixel(Size / 2, Size / 2));
    }

    [Fact]
    public void The_models_transparent_png_becomes_a_square_webp_with_alpha()
    {
        var webp = TokenPicture.FromModel(TransparentPng(1024, 1024), Size, Size);

        using var bitmap = Decode(webp);
        Assert.Equal((Size, Size), (bitmap.Width, bitmap.Height));
        Assert.Equal(0, bitmap.GetPixel(5, Size - 5).Alpha);
        Assert.Equal(255, bitmap.GetPixel(Size / 2, Size / 2).Alpha);
    }

    [Fact]
    public void A_model_answer_that_isnt_a_picture_throws()
    {
        Assert.Throws<InvalidOperationException>(() => TokenPicture.FromModel([], Size, Size));
        Assert.Throws<InvalidOperationException>(() => TokenPicture.FromModel([1, 2, 3], Size, Size));
    }

    [Fact]
    public void Bytes_that_arent_a_readable_picture_are_refused()
    {
        var png = OpaquePng(100, 100);

        Assert.Null(TokenPicture.FromUpload([], Size, MaxPixels));
        Assert.Null(TokenPicture.FromUpload("GIF89a\x01\x00\x01\x00"u8.ToArray(), Size, MaxPixels));
        Assert.Null(TokenPicture.FromUpload([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4, 5, 6, 7, 8], Size, MaxPixels));
        // Cut off halfway.
        Assert.Null(TokenPicture.FromUpload(png[..(png.Length / 2)], Size, MaxPixels));
    }

    [Fact]
    public void A_picture_with_an_edge_over_the_limit_is_refused()
    {
        Assert.Null(TokenPicture.FromUpload(OpaquePng(MaxPixels + 1, 1), Size, MaxPixels));
        Assert.Null(TokenPicture.FromUpload(OpaquePng(1, MaxPixels + 1), Size, MaxPixels));
        Assert.Null(TokenPicture.FromUpload(OpaquePng(60, 40), Size, maxPixels: 50));
        Assert.NotNull(TokenPicture.FromUpload(OpaquePng(50, 40), Size, maxPixels: 50));
    }

    [Fact]
    public void A_stored_version_converts_to_png_for_a_restyle()
    {
        var webp = TokenPicture.FromUpload(TransparentPng(100, 100), Size, MaxPixels)!;

        var png = TokenPicture.ToPng(webp);

        Assert.Equal(SKEncodedImageFormat.Png, TokenPicture.Identify(png));
        using var bitmap = Decode(png);
        Assert.Equal((Size, Size, (byte)0), (bitmap.Width, bitmap.Height, bitmap.GetPixel(5, 5).Alpha));
    }

    private static void AssertRed(SKColor color) =>
        Assert.True(color.Red > 150 && color.Blue < 100, $"Expected red, got {color}.");

    private static void AssertBlue(SKColor color) =>
        Assert.True(color.Blue > 150 && color.Red < 100, $"Expected blue, got {color}.");
}
