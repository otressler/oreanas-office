using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class OfflineSync : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_BattleMaps_CampaignId",
                table: "BattleMaps");

            migrationBuilder.AddColumn<string>(
                name: "Size",
                table: "Tokens",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Medium");

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ArchivedAt",
                table: "Encounters",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MapCopyJson",
                table: "Encounters",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UpdatedAt",
                table: "Encounters",
                type: "datetimeoffset",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "UpdatedByUserId",
                table: "Encounters",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "Encounters",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ArchivedAt",
                table: "CreatureTypes",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UpdatedAt",
                table: "CreatureTypes",
                type: "datetimeoffset",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "UpdatedByUserId",
                table: "CreatureTypes",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "CreatureTypes",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ArchivedAt",
                table: "BattleMaps",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CopiedFromMapId",
                table: "BattleMaps",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "UpdatedAt",
                table: "BattleMaps",
                type: "datetimeoffset",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<Guid>(
                name: "UpdatedByUserId",
                table: "BattleMaps",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "BattleMaps",
                type: "int",
                nullable: false,
                defaultValue: 1);

            // Existing rows: version 1 (the column default), last change = creation.
            migrationBuilder.Sql("UPDATE [CreatureTypes] SET [UpdatedAt] = [CreatedAt]");
            migrationBuilder.Sql("UPDATE [BattleMaps] SET [UpdatedAt] = [CreatedAt]");
            migrationBuilder.Sql("UPDATE [Encounters] SET [UpdatedAt] = [CreatedAt]");

            // A token keeps the size its character or type had when it was made.
            migrationBuilder.Sql(
                """
                UPDATE t SET t.[Size] = c.[Size]
                FROM [Tokens] t JOIN [Characters] c ON c.[Id] = t.[CharacterId]
                """);
            migrationBuilder.Sql(
                """
                UPDATE t SET t.[Size] = ct.[Size]
                FROM [Tokens] t JOIN [CreatureTypes] ct ON ct.[Id] = t.[CreatureTypeId]
                """);

            // Started and ended encounters keep the map as it is now (EncounterMapCopy).
            migrationBuilder.Sql(
                """
                UPDATE e SET e.[MapCopyJson] =
                    N'{"width":' + CAST(m.[Width] AS nvarchar(10)) + N',"height":' + CAST(m.[Height] AS nvarchar(10))
                    + N',"layout":' + m.[LayoutJson] + N'}'
                FROM [Encounters] e JOIN [BattleMaps] m ON m.[Id] = e.[BattleMapId]
                WHERE e.[Status] IN (N'Active', N'Ended')
                """);

            migrationBuilder.CreateIndex(
                name: "IX_Encounters_UpdatedByUserId",
                table: "Encounters",
                column: "UpdatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_CreatureTypes_UpdatedByUserId",
                table: "CreatureTypes",
                column: "UpdatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_BattleMaps_CampaignId_CopiedFromMapId",
                table: "BattleMaps",
                columns: new[] { "CampaignId", "CopiedFromMapId" });

            migrationBuilder.CreateIndex(
                name: "IX_BattleMaps_UpdatedByUserId",
                table: "BattleMaps",
                column: "UpdatedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_BattleMaps_AspNetUsers_UpdatedByUserId",
                table: "BattleMaps",
                column: "UpdatedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_CreatureTypes_AspNetUsers_UpdatedByUserId",
                table: "CreatureTypes",
                column: "UpdatedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_Encounters_AspNetUsers_UpdatedByUserId",
                table: "Encounters",
                column: "UpdatedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_BattleMaps_AspNetUsers_UpdatedByUserId",
                table: "BattleMaps");

            migrationBuilder.DropForeignKey(
                name: "FK_CreatureTypes_AspNetUsers_UpdatedByUserId",
                table: "CreatureTypes");

            migrationBuilder.DropForeignKey(
                name: "FK_Encounters_AspNetUsers_UpdatedByUserId",
                table: "Encounters");

            migrationBuilder.DropIndex(
                name: "IX_Encounters_UpdatedByUserId",
                table: "Encounters");

            migrationBuilder.DropIndex(
                name: "IX_CreatureTypes_UpdatedByUserId",
                table: "CreatureTypes");

            migrationBuilder.DropIndex(
                name: "IX_BattleMaps_CampaignId_CopiedFromMapId",
                table: "BattleMaps");

            migrationBuilder.DropIndex(
                name: "IX_BattleMaps_UpdatedByUserId",
                table: "BattleMaps");

            migrationBuilder.DropColumn(
                name: "Size",
                table: "Tokens");

            migrationBuilder.DropColumn(
                name: "ArchivedAt",
                table: "Encounters");

            migrationBuilder.DropColumn(
                name: "MapCopyJson",
                table: "Encounters");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "Encounters");

            migrationBuilder.DropColumn(
                name: "UpdatedByUserId",
                table: "Encounters");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "Encounters");

            migrationBuilder.DropColumn(
                name: "ArchivedAt",
                table: "CreatureTypes");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "CreatureTypes");

            migrationBuilder.DropColumn(
                name: "UpdatedByUserId",
                table: "CreatureTypes");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "CreatureTypes");

            migrationBuilder.DropColumn(
                name: "ArchivedAt",
                table: "BattleMaps");

            migrationBuilder.DropColumn(
                name: "CopiedFromMapId",
                table: "BattleMaps");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                table: "BattleMaps");

            migrationBuilder.DropColumn(
                name: "UpdatedByUserId",
                table: "BattleMaps");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "BattleMaps");

            migrationBuilder.CreateIndex(
                name: "IX_BattleMaps_CampaignId",
                table: "BattleMaps",
                column: "CampaignId");
        }
    }
}
