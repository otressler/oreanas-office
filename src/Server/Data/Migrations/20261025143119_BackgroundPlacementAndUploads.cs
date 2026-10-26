using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class BackgroundPlacementAndUploads : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BackgroundPlacementJson",
                table: "BattleMaps",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "GridStyle",
                table: "BattleMaps",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Normal");

            migrationBuilder.AddColumn<int>(
                name: "PixelHeight",
                table: "Assets",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PixelWidth",
                table: "Assets",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BackgroundPlacementJson",
                table: "BattleMaps");

            migrationBuilder.DropColumn(
                name: "GridStyle",
                table: "BattleMaps");

            migrationBuilder.DropColumn(
                name: "PixelHeight",
                table: "Assets");

            migrationBuilder.DropColumn(
                name: "PixelWidth",
                table: "Assets");
        }
    }
}
