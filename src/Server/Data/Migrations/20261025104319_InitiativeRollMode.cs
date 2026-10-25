using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitiativeRollMode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "InitiativeRollMode",
                table: "Tokens",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InitiativeRollMode",
                table: "CreatureTypes",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Normal");

            // Advantage becomes a roll mode, in the columns and in saved initiative lists, whose
            // entries System.Text.Json writes without spaces.
            migrationBuilder.Sql("UPDATE CreatureTypes SET InitiativeRollMode = N'Advantage' WHERE InitiativeAdvantage = 1");
            migrationBuilder.Sql(
                "UPDATE Tokens SET InitiativeRollMode = CASE InitiativeAdvantage WHEN 1 THEN N'Advantage' ELSE N'Normal' END"
                + " WHERE InitiativeAdvantage IS NOT NULL");
            migrationBuilder.Sql(
                "UPDATE Encounters SET InitiativeJson = REPLACE(REPLACE(InitiativeJson, N'\"advantage\":true', N'\"mode\":\"advantage\"'),"
                + " N'\"advantage\":false', N'\"mode\":\"normal\"') WHERE InitiativeJson IS NOT NULL");

            migrationBuilder.DropColumn(
                name: "InitiativeAdvantage",
                table: "Tokens");

            migrationBuilder.DropColumn(
                name: "InitiativeAdvantage",
                table: "CreatureTypes");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "InitiativeAdvantage",
                table: "Tokens",
                type: "bit",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "InitiativeAdvantage",
                table: "CreatureTypes",
                type: "bit",
                nullable: false,
                defaultValue: false);

            // Disadvantage has no place in the old columns and becomes a normal roll.
            migrationBuilder.Sql("UPDATE CreatureTypes SET InitiativeAdvantage = 1 WHERE InitiativeRollMode = N'Advantage'");
            migrationBuilder.Sql(
                "UPDATE Tokens SET InitiativeAdvantage = CASE InitiativeRollMode WHEN N'Advantage' THEN 1 ELSE 0 END"
                + " WHERE InitiativeRollMode IS NOT NULL");
            migrationBuilder.Sql(
                "UPDATE Encounters SET InitiativeJson = REPLACE(REPLACE(REPLACE(InitiativeJson, N'\"mode\":\"advantage\"', N'\"advantage\":true'),"
                + " N'\"mode\":\"disadvantage\"', N'\"advantage\":false'), N'\"mode\":\"normal\"', N'\"advantage\":false') WHERE InitiativeJson IS NOT NULL");

            migrationBuilder.DropColumn(
                name: "InitiativeRollMode",
                table: "Tokens");

            migrationBuilder.DropColumn(
                name: "InitiativeRollMode",
                table: "CreatureTypes");
        }
    }
}
