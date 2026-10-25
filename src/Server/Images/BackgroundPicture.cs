using SkiaSharp;

namespace OreanasOffice.Server.Images;

// Uploaded map backgrounds (knowledge/features/ai-map-generation.md, "Uploads"): a PNG,
// WebP or JPEG is turned the right way up (EXIF orientation), shrunk so its long edge is at
// most ImageOptions.BackgroundPixels (never enlarged) and stored as WebP with its alpha
// channel. Encoded from the pixels alone, so no metadata of the original reaches it.
public static class BackgroundPicture
{
    public const string ContentType = "image/webp";

    private const int WebpQuality = 85;

    public sealed record Stored(byte[] Bytes, int Width, int Height);

    // The stored picture, or null when the bytes aren't the declared format, don't decode
    // completely, or an edge is longer than maxPixels (read from the header first).
    public static Stored? FromUpload(byte[] bytes, SKEncodedImageFormat declared, int longEdge, int maxPixels)
    {
        if (TokenPicture.Identify(bytes) != declared)
        {
            return null;
        }

        using var data = SKData.CreateCopy(bytes);
        using var codec = SKCodec.Create(data);
        if (codec is null || codec.EncodedFormat != declared)
        {
            return null;
        }

        var info = codec.Info;
        if (info.Width <= 0 || info.Height <= 0 || info.Width > maxPixels || info.Height > maxPixels)
        {
            return null;
        }

        // A large JPEG decodes straight at a smaller scale, as long as it still covers the target.
        var scale = Math.Min(1f, (float)longEdge / Math.Max(info.Width, info.Height));
        var decoded = codec.GetScaledDimensions(scale);
        if (Math.Max(decoded.Width, decoded.Height) < Math.Min(longEdge, Math.Max(info.Width, info.Height)))
        {
            decoded = info.Size;
        }

        using var source = new SKBitmap(new SKImageInfo(decoded.Width, decoded.Height, SKColorType.Rgba8888, SKAlphaType.Premul));
        if (codec.GetPixels(source.Info, source.GetPixels()) != SKCodecResult.Success)
        {
            return null;
        }

        var origin = codec.EncodedOrigin;
        var swaps = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop
            or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var (uprightWidth, uprightHeight) = swaps ? (source.Height, source.Width) : (source.Width, source.Height);
        var fit = Math.Min(1f, (float)longEdge / Math.Max(uprightWidth, uprightHeight));
        var width = Math.Max(1, (int)Math.Round(uprightWidth * fit));
        var height = Math.Max(1, (int)Math.Round(uprightHeight * fit));

        using var image = SKImage.FromBitmap(source);
        using var target = new SKBitmap(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul));
        using (var canvas = new SKCanvas(target))
        {
            canvas.Clear(SKColors.Transparent);
            canvas.Scale((float)width / uprightWidth, (float)height / uprightHeight);
            TokenPicture.Orient(canvas, origin, source.Width, source.Height);
            canvas.DrawImage(image, 0, 0, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        }

        using var pixmap = target.PeekPixels();
        using var webp = pixmap.Encode(new SKWebpEncoderOptions(SKWebpEncoderCompression.Lossy, WebpQuality));
        return webp is null ? null : new Stored(webp.ToArray(), width, height);
    }
}
