using System.Buffers.Binary;
using SkiaSharp;

namespace OreanasOffice.Server.Tests.Images;

// Small pictures for the token image tests, made with SkiaSharp, and a hand-built EXIF
// segment with an orientation and a GPS position, as a phone writes into a photo.
public static class TestPictures
{
    public static readonly SKColor Red = new(220, 30, 30);
    public static readonly SKColor Blue = new(30, 30, 220);

    // Left half red, right half blue.
    public static byte[] SplitJpeg(int width, int height) => Encode(width, height, SKEncodedImageFormat.Jpeg, canvas =>
    {
        using var red = new SKPaint { Color = Red };
        using var blue = new SKPaint { Color = Blue };
        canvas.DrawRect(0, 0, width / 2f, height, red);
        canvas.DrawRect(width / 2f, 0, width / 2f, height, blue);
    });

    // A red disc on a transparent background, like the model's token pictures.
    public static byte[] TransparentPng(int width = 64, int height = 64) => Encode(width, height, SKEncodedImageFormat.Png, canvas =>
    {
        using var red = new SKPaint { Color = Red, IsAntialias = true };
        canvas.DrawCircle(width / 2f, height / 2f, Math.Min(width, height) / 4f, red);
    });

    public static byte[] OpaquePng(int width, int height) => Encode(width, height, SKEncodedImageFormat.Png, canvas => canvas.Clear(Blue));

    public static byte[] Webp(int width, int height) => Encode(width, height, SKEncodedImageFormat.Webp, canvas => canvas.Clear(Blue));

    public static byte[] Encode(int width, int height, SKEncodedImageFormat format, Action<SKCanvas> draw)
    {
        using var bitmap = new SKBitmap(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul));
        using (var canvas = new SKCanvas(bitmap))
        {
            canvas.Clear(SKColors.Transparent);
            draw(canvas);
        }

        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(format, 100);
        return data.ToArray();
    }

    public static SKBitmap Decode(byte[] bytes) => SKBitmap.Decode(bytes) ?? throw new InvalidOperationException("Not a picture.");

    // The JPEG with an EXIF APP1 segment right after SOI: IFD0 holds the orientation and a
    // pointer to a GPS IFD with GPSLatitudeRef "N" and GPSLatitude 52° 31' 12".
    public static byte[] WithExif(byte[] jpeg, ushort orientation)
    {
        var tiff = new byte[92];
        "MM"u8.CopyTo(tiff);
        BinaryPrimitives.WriteUInt16BigEndian(tiff.AsSpan(2), 42);
        BinaryPrimitives.WriteUInt32BigEndian(tiff.AsSpan(4), 8);

        // IFD0 at 8: Orientation (SHORT) and the GPS IFD pointer (LONG).
        BinaryPrimitives.WriteUInt16BigEndian(tiff.AsSpan(8), 2);
        Entry(tiff, 10, 0x0112, 3, 1, (uint)orientation << 16);
        Entry(tiff, 22, 0x8825, 4, 1, 38);
        BinaryPrimitives.WriteUInt32BigEndian(tiff.AsSpan(34), 0);

        // GPS IFD at 38: GPSLatitudeRef (ASCII "N") and GPSLatitude (3 RATIONALs at 68).
        BinaryPrimitives.WriteUInt16BigEndian(tiff.AsSpan(38), 2);
        Entry(tiff, 40, 0x0001, 2, 2, (uint)'N' << 24);
        Entry(tiff, 52, 0x0002, 5, 3, 68);
        BinaryPrimitives.WriteUInt32BigEndian(tiff.AsSpan(64), 0);
        uint[] latitude = [52, 1, 31, 1, 12, 1];
        for (var i = 0; i < latitude.Length; i++)
        {
            BinaryPrimitives.WriteUInt32BigEndian(tiff.AsSpan(68 + (i * 4)), latitude[i]);
        }

        byte[] payload = [.. "Exif\0\0"u8, .. tiff];
        var segment = new byte[4 + payload.Length];
        segment[0] = 0xFF;
        segment[1] = 0xE1;
        BinaryPrimitives.WriteUInt16BigEndian(segment.AsSpan(2), (ushort)(2 + payload.Length));
        payload.CopyTo(segment, 4);
        return [.. jpeg[..2], .. segment, .. jpeg[2..]];
    }

    // The four-character codes of a WebP file's RIFF chunks.
    public static List<string> WebpChunks(byte[] webp)
    {
        var chunks = new List<string>();
        var offset = 12;
        while (offset + 8 <= webp.Length)
        {
            chunks.Add(System.Text.Encoding.ASCII.GetString(webp, offset, 4));
            var size = BinaryPrimitives.ReadInt32LittleEndian(webp.AsSpan(offset + 4));
            offset += 8 + size + (size % 2);
        }

        return chunks;
    }

    public static bool Contains(byte[] haystack, ReadOnlySpan<byte> needle) => haystack.AsSpan().IndexOf(needle) >= 0;

    private static void Entry(byte[] tiff, int at, ushort tag, ushort type, uint count, uint value)
    {
        BinaryPrimitives.WriteUInt16BigEndian(tiff.AsSpan(at), tag);
        BinaryPrimitives.WriteUInt16BigEndian(tiff.AsSpan(at + 2), type);
        BinaryPrimitives.WriteUInt32BigEndian(tiff.AsSpan(at + 4), count);
        BinaryPrimitives.WriteUInt32BigEndian(tiff.AsSpan(at + 8), value);
    }
}
