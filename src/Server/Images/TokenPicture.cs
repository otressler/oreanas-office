using SkiaSharp;

namespace OreanasOffice.Server.Images;

// Pictures for token icons and portraits (knowledge/features/token-icons.md): every version
// is kept as a square WebP of ImageOptions.TokenPixels with its alpha channel. An upload is
// turned the right way up (EXIF orientation), cropped to its middle square and scaled to
// exactly that size, larger or smaller; the model's transparent PNG goes the same way.
// The WebP is encoded from the pixels alone, so nothing of the original file's metadata
// (EXIF, GPS position, XMP, ICC) reaches it.
public static class TokenPicture
{
    public const string ContentType = "image/webp";

    private const int WebpQuality = 85;

    // The formats an upload may have, by content type.
    public static readonly IReadOnlyDictionary<string, SKEncodedImageFormat> UploadFormats =
        new Dictionary<string, SKEncodedImageFormat>(StringComparer.OrdinalIgnoreCase)
        {
            ["image/jpeg"] = SKEncodedImageFormat.Jpeg,
            ["image/png"] = SKEncodedImageFormat.Png,
            ["image/webp"] = SKEncodedImageFormat.Webp,
        };

    // JPEG, PNG or WebP by the file's first bytes; null for anything else.
    public static SKEncodedImageFormat? Identify(ReadOnlySpan<byte> bytes)
    {
        if (bytes is [0xFF, 0xD8, 0xFF, ..])
        {
            return SKEncodedImageFormat.Jpeg;
        }

        if (bytes is [0x89, (byte)'P', (byte)'N', (byte)'G', 0x0D, 0x0A, 0x1A, 0x0A, ..])
        {
            return SKEncodedImageFormat.Png;
        }

        if (bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes[8..12].SequenceEqual("WEBP"u8))
        {
            return SKEncodedImageFormat.Webp;
        }

        return null;
    }

    // An uploaded picture as the stored square WebP, or null when it isn't a JPEG, PNG or
    // WebP that decodes completely, or an edge is longer than maxPixels. The size is read from
    // the header before any pixels are decoded.
    public static byte[]? FromUpload(byte[] bytes, int size, int maxPixels) =>
        Identify(bytes) is { } format ? Square(bytes, format, size, maxPixels) : null;

    // The model's picture (a transparent PNG) as the stored square WebP. Throws when it
    // can't be read, which the worker treats like any failed attempt.
    public static byte[] FromModel(byte[] bytes, int size) =>
        (Identify(bytes) is { } format ? Square(bytes, format, size, int.MaxValue) : null)
        ?? throw new InvalidOperationException("The image model's picture couldn't be read.");

    // A stored version as PNG, the input image of a restyle (the edits endpoint takes PNG
    // or JPEG, not WebP).
    public static byte[] ToPng(byte[] bytes)
    {
        using var bitmap = SKBitmap.Decode(bytes) ?? throw new InvalidOperationException("The stored picture couldn't be read.");
        using var pixmap = bitmap.PeekPixels();
        using var png = pixmap.Encode(SKEncodedImageFormat.Png, 100)
            ?? throw new InvalidOperationException("The picture couldn't be encoded as PNG.");
        return png.ToArray();
    }

    private static byte[]? Square(byte[] bytes, SKEncodedImageFormat format, int size, int maxPixels)
    {
        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data);
        if (codec is null || codec.EncodedFormat != format)
        {
            return null;
        }

        var info = codec.Info;
        if (info.Width <= 0 || info.Height <= 0 || info.Width > maxPixels || info.Height > maxPixels)
        {
            return null;
        }

        // A large JPEG decodes straight at a smaller scale, as long as its short edge still
        // covers the target size.
        var scale = (float)size / Math.Min(info.Width, info.Height);
        var decoded = codec.GetScaledDimensions(Math.Min(scale, 1f));
        if (Math.Min(decoded.Width, decoded.Height) < Math.Min(size, Math.Min(info.Width, info.Height)))
        {
            decoded = info.Size;
        }

        using var source = new SKBitmap(new SKImageInfo(decoded.Width, decoded.Height, SKColorType.Rgba8888, SKAlphaType.Premul));
        if (codec.GetPixels(source.Info, source.GetPixels()) != SKCodecResult.Success)
        {
            return null;
        }

        using var image = SKImage.FromBitmap(source);
        using var square = new SKBitmap(new SKImageInfo(size, size, SKColorType.Rgba8888, SKAlphaType.Premul));
        using (var canvas = new SKCanvas(square))
        {
            canvas.Clear(SKColors.Transparent);

            // Upright size, then the middle square of it scaled to size × size.
            var origin = codec.EncodedOrigin;
            var swaps = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop
                or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
            var (width, height) = swaps ? (source.Height, source.Width) : (source.Width, source.Height);
            var side = Math.Min(width, height);
            canvas.Scale((float)size / side);
            canvas.Translate(-(width - side) / 2f, -(height - side) / 2f);
            Orient(canvas, origin, source.Width, source.Height);
            canvas.DrawImage(image, 0, 0, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        }

        using var pixmap = square.PeekPixels();
        using var webp = pixmap.Encode(new SKWebpEncoderOptions(SKWebpEncoderCompression.Lossy, WebpQuality));
        return webp?.ToArray();
    }

    // Maps the stored pixels (width × height) onto the upright picture (TIFF orientation
    // tags 2–8). The last transform set is applied first.
    private static void Orient(SKCanvas canvas, SKEncodedOrigin origin, int width, int height)
    {
        switch (origin)
        {
            case SKEncodedOrigin.TopRight:
                canvas.Translate(width, 0);
                canvas.Scale(-1, 1);
                break;
            case SKEncodedOrigin.BottomRight:
                canvas.Translate(width, height);
                canvas.RotateDegrees(180);
                break;
            case SKEncodedOrigin.BottomLeft:
                canvas.Translate(0, height);
                canvas.Scale(1, -1);
                break;
            case SKEncodedOrigin.LeftTop:
                canvas.RotateDegrees(90);
                canvas.Scale(1, -1);
                break;
            case SKEncodedOrigin.RightTop:
                canvas.Translate(height, 0);
                canvas.RotateDegrees(90);
                break;
            case SKEncodedOrigin.RightBottom:
                canvas.Translate(height, width);
                canvas.RotateDegrees(-90);
                canvas.Scale(1, -1);
                break;
            case SKEncodedOrigin.LeftBottom:
                canvas.Translate(0, width);
                canvas.RotateDegrees(-90);
                break;
        }
    }
}
