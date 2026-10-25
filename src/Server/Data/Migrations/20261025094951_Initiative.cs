using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class Initiative : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "InitiativeAdvantage",
                table: "Tokens",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "InitiativeModifier",
                table: "Tokens",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InitiativeJson",
                table: "Encounters",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "InitiativeVersion",
                table: "Encounters",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<bool>(
                name: "InitiativeAdvantage",
                table: "CreatureTypes",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "InitiativeModifier",
                table: "CreatureTypes",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InitiativeAdvantage",
                table: "Tokens");

            migrationBuilder.DropColumn(
                name: "InitiativeModifier",
                table: "Tokens");

            migrationBuilder.DropColumn(
                name: "InitiativeJson",
                table: "Encounters");

            migrationBuilder.DropColumn(
                name: "InitiativeVersion",
                table: "Encounters");

            migrationBuilder.DropColumn(
                name: "InitiativeAdvantage",
                table: "CreatureTypes");

            migrationBuilder.DropColumn(
                name: "InitiativeModifier",
                table: "CreatureTypes");
        }
    }
}
