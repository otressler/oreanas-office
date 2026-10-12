using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OreanasOffice.Server.Campaigns;

namespace OreanasOffice.Server.Maps;

// knowledge/domain/battle-map.md. The layout is one JSON column, not a table of cells
// (knowledge/decisions/persistence.md). The background image arrives with assets in
// stage 7.
public class BattleMap
{
    public const int NameMaxLength = 80;
    public const int MaxSize = 40;
    public const int DescriptionMaxLength = 500;

    public Guid Id { get; set; }

    public Guid CampaignId { get; set; }

    public required string Name { get; set; }

    public int Width { get; set; }

    public int Height { get; set; }

    public required MapLayout Layout { get; set; }

    public string Scene { get; set; } = "";

    public string Vibe { get; set; } = "";

    public string Lighting { get; set; } = "";

    public DateTimeOffset CreatedAt { get; set; }

    public Campaign Campaign { get; set; } = null!;
}

internal sealed class BattleMapConfiguration : IEntityTypeConfiguration<BattleMap>
{
    // The same shape the API sends: camelCase names and enums.
    private static readonly JsonSerializerOptions LayoutJson = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    public void Configure(EntityTypeBuilder<BattleMap> map)
    {
        map.Property(m => m.Name).HasMaxLength(BattleMap.NameMaxLength);
        map.Property(m => m.Scene).HasMaxLength(BattleMap.DescriptionMaxLength);
        map.Property(m => m.Vibe).HasMaxLength(BattleMap.DescriptionMaxLength);
        map.Property(m => m.Lighting).HasMaxLength(BattleMap.DescriptionMaxLength);
        map.Property(m => m.Layout)
            .HasConversion(
                layout => JsonSerializer.Serialize(layout, LayoutJson),
                json => JsonSerializer.Deserialize<MapLayout>(json, LayoutJson)!,
                new ValueComparer<MapLayout>(
                    (a, b) => JsonSerializer.Serialize(a, LayoutJson) == JsonSerializer.Serialize(b, LayoutJson),
                    layout => JsonSerializer.Serialize(layout, LayoutJson).GetHashCode(),
                    layout => JsonSerializer.Deserialize<MapLayout>(JsonSerializer.Serialize(layout, LayoutJson), LayoutJson)!))
            .HasColumnName("LayoutJson");
        map.HasOne(m => m.Campaign).WithMany().HasForeignKey(m => m.CampaignId).OnDelete(DeleteBehavior.Cascade);
    }
}
