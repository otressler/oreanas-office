using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Serialization;
using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Tests.Images;

// Test-only decoder for the 8-bit RGB PNGs the guide renderer and render_guide.py write:
// inflates the IDAT data and undoes the per-row filters, so pixels can be compared
// whatever the compressor did.
public static class TestPng
{
    public static (int Width, int Height, byte[] Rgb) Decode(byte[] png)
    {
        byte[] signature = [0x89, (byte)'P', (byte)'N', (byte)'G', 0x0D, 0x0A, 0x1A, 0x0A];
        Assert.True(png.AsSpan(0, 8).SequenceEqual(signature));

        int width = 0, height = 0;
        using var idat = new MemoryStream();
        var pos = 8;
        while (pos < png.Length)
        {
            var length = (int)System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(png.AsSpan(pos));
            var type = System.Text.Encoding.ASCII.GetString(png, pos + 4, 4);
            var data = png.AsSpan(pos + 8, length);
            if (type == "IHDR")
            {
                width = (int)System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(data);
                height = (int)System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(data[4..]);
                Assert.Equal(8, data[8]);
                Assert.Equal(2, data[9]);
            }
            else if (type == "IDAT")
            {
                idat.Write(data);
            }

            pos += 12 + length;
        }

        idat.Position = 0;
        using var inflated = new MemoryStream();
        using (var zlib = new ZLibStream(idat, CompressionMode.Decompress))
        {
            zlib.CopyTo(inflated);
        }

        var raw = inflated.ToArray();
        var stride = width * 3;
        Assert.Equal(height * (stride + 1), raw.Length);
        var rgb = new byte[height * stride];
        for (var y = 0; y < height; y++)
        {
            var filter = raw[y * (stride + 1)];
            for (var i = 0; i < stride; i++)
            {
                var x = raw[y * (stride + 1) + 1 + i];
                int left = i >= 3 ? rgb[y * stride + i - 3] : 0;
                int up = y > 0 ? rgb[(y - 1) * stride + i] : 0;
                int upLeft = y > 0 && i >= 3 ? rgb[(y - 1) * stride + i - 3] : 0;
                rgb[y * stride + i] = (byte)(x + filter switch
                {
                    0 => 0,
                    1 => left,
                    2 => up,
                    3 => (left + up) / 2,
                    4 => Paeth(left, up, upLeft),
                    _ => throw new InvalidDataException($"Unknown PNG filter {filter}."),
                });
            }
        }

        return (width, height, rgb);
    }

    public static (byte R, byte G, byte B) PixelAt((int Width, int Height, byte[] Rgb) image, int x, int y)
    {
        var i = (y * image.Width + x) * 3;
        return (image.Rgb[i], image.Rgb[i + 1], image.Rgb[i + 2]);
    }

    private static int Paeth(int a, int b, int c)
    {
        var p = a + b - c;
        var (pa, pb, pc) = (Math.Abs(p - a), Math.Abs(p - b), Math.Abs(p - c));
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }
}

// The four sample maps and the golden output render_guide.py made from them
// (tests/Server.Tests/Images/Golden, copied to the test output).
public static class GuideSamples
{
    public static readonly string[] Names = ["gorge-crossing", "crypt", "river-ford", "open-field"];

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static TheoryData<string> Theory()
    {
        var data = new TheoryData<string>();
        foreach (var name in Names)
        {
            data.Add(name);
        }

        return data;
    }

    public record Sample(string Scene, string Vibe, string Lighting, int Width, int Height, MapLayout Layout);

    public static Sample Load(string name)
    {
        var path = Path.Combine(AppContext.BaseDirectory, "SampleMaps", $"{name}.json");
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var root = doc.RootElement;
        var layout = root.GetProperty("layout").Deserialize<MapLayout>(Json)!;
        return new Sample(
            root.GetProperty("scene").GetString()!,
            root.GetProperty("vibe").GetString()!,
            root.GetProperty("lighting").GetString()!,
            root.GetProperty("width").GetInt32(),
            root.GetProperty("height").GetInt32(),
            layout);
    }

    public record Golden(string Size, int CellPx, string[] Legend, (int Width, int Height, byte[] Rgb) Image);

    public static Golden LoadGolden(string name)
    {
        var dir = Path.Combine(AppContext.BaseDirectory, "Images", "Golden");
        using var doc = JsonDocument.Parse(File.ReadAllText(Path.Combine(dir, $"{name}.json")));
        var root = doc.RootElement;
        return new Golden(
            root.GetProperty("size").GetString()!,
            root.GetProperty("cell_px").GetInt32(),
            root.GetProperty("legend").EnumerateArray().Select(l => l.GetString()!).ToArray(),
            TestPng.Decode(File.ReadAllBytes(Path.Combine(dir, $"{name}.png"))));
    }

    // A map of the given size filled with floor (so no void to flood).
    public static MapLayout Floor(int width, int height) => new(
        MapLayout.CurrentSchemaVersion,
        [.. Enumerable.Range(0, width * height).Select(i => new LayoutCell(i % width, i / width, Terrain.Floor, 0m))],
        [],
        []);
}
