using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using OreanasOffice.Server.Maps;

namespace OreanasOffice.Server.Images;

// A hash of a map's size and layout (Asset.LayoutHash): equal while nothing the picture
// shows has changed. Names and scene texts don't count.
public static class LayoutFingerprint
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public static string Of(int width, int height, MapLayout layout)
    {
        var normalised = layout with
        {
            Cells = [.. layout.Cells.OrderBy(c => c.Y).ThenBy(c => c.X)],
            Features = [.. layout.Features.OrderBy(f => f.Id, StringComparer.Ordinal)],
            Entrances = [.. layout.Entrances.OrderBy(e => e.Id, StringComparer.Ordinal)],
        };
        var json = JsonSerializer.Serialize(new { width, height, layout = normalised }, Json);
        return Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(json)));
    }
}
