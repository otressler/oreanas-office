using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class SpellStatuses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SpellIcon",
                table: "StatusDefinitions",
                type: "varchar(20)",
                unicode: false,
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SpellId",
                table: "StatusDefinitions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-000000000001"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-000000000002"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-000000000003"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-000000000004"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-000000000005"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-000000000006"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-000000000007"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-000000000008"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-000000000009"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-00000000000a"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-00000000000b"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-00000000000c"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-00000000000d"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-00000000000e"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.UpdateData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-00000000000f"),
                columns: new[] { "SpellIcon", "SpellId" },
                values: new object[] { null, null });

            migrationBuilder.InsertData(
                table: "StatusDefinitions",
                columns: new[] { "Id", "CampaignId", "CharacterId", "CreatedAt", "CreatedByUserId", "HasLevels", "IconAssetId", "IconDescription", "LibraryKey", "Name", "SpellIcon", "SpellId" },
                values: new object[] { new Guid("5a7d0000-0000-4000-8000-000000000010"), null, null, new DateTimeOffset(new DateTime(2026, 11, 25, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "concentration", "Konzentration", null, null });

            migrationBuilder.CreateIndex(
                name: "IX_StatusDefinitions_CampaignId_SpellId",
                table: "StatusDefinitions",
                columns: new[] { "CampaignId", "SpellId" },
                unique: true,
                filter: "[SpellId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_StatusDefinitions_SpellId",
                table: "StatusDefinitions",
                column: "SpellId");

            migrationBuilder.AddForeignKey(
                name: "FK_StatusDefinitions_Spells_SpellId",
                table: "StatusDefinitions",
                column: "SpellId",
                principalTable: "Spells",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StatusDefinitions_Spells_SpellId",
                table: "StatusDefinitions");

            migrationBuilder.DropIndex(
                name: "IX_StatusDefinitions_CampaignId_SpellId",
                table: "StatusDefinitions");

            migrationBuilder.DropIndex(
                name: "IX_StatusDefinitions_SpellId",
                table: "StatusDefinitions");

            migrationBuilder.DeleteData(
                table: "StatusDefinitions",
                keyColumn: "Id",
                keyValue: new Guid("5a7d0000-0000-4000-8000-000000000010"));

            migrationBuilder.DropColumn(
                name: "SpellIcon",
                table: "StatusDefinitions");

            migrationBuilder.DropColumn(
                name: "SpellId",
                table: "StatusDefinitions");
        }
    }
}
