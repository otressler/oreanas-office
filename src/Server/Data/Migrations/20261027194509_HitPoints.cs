using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class HitPoints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "Dead",
                table: "Tokens",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "HitPoints",
                table: "Tokens",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "MaxHitPoints",
                table: "Tokens",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "HitPoints",
                table: "CreatureTypes",
                type: "int",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Dead",
                table: "Tokens");

            migrationBuilder.DropColumn(
                name: "HitPoints",
                table: "Tokens");

            migrationBuilder.DropColumn(
                name: "MaxHitPoints",
                table: "Tokens");

            migrationBuilder.DropColumn(
                name: "HitPoints",
                table: "CreatureTypes");
        }
    }
}
