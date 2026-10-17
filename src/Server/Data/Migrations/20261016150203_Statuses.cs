using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class Statuses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "RemovedAt",
                table: "Tokens",
                type: "datetimeoffset",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RemovedByUserId",
                table: "Tokens",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "StatusDefinitions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LibraryKey = table.Column<string>(type: "varchar(20)", unicode: false, maxLength: 20, nullable: true),
                    CampaignId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Name = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    IconDescription = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: true),
                    HasLevels = table.Column<bool>(type: "bit", nullable: false),
                    IconAssetId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CharacterId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatusDefinitions", x => x.Id);
                    table.CheckConstraint("CK_StatusDefinitions_Library", "([LibraryKey] IS NOT NULL AND [CampaignId] IS NULL) OR ([LibraryKey] IS NULL AND [CampaignId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_StatusDefinitions_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StatusDefinitions_Campaigns_CampaignId",
                        column: x => x.CampaignId,
                        principalTable: "Campaigns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StatusDefinitions_Characters_CharacterId",
                        column: x => x.CharacterId,
                        principalTable: "Characters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StatusLists",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CharacterId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CampaignId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatusLists", x => x.Id);
                    table.CheckConstraint("CK_StatusLists_Owner", "([CharacterId] IS NOT NULL AND [UserId] IS NULL) OR ([CharacterId] IS NULL AND [UserId] IS NOT NULL)");
                    table.ForeignKey(
                        name: "FK_StatusLists_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StatusLists_Campaigns_CampaignId",
                        column: x => x.CampaignId,
                        principalTable: "Campaigns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_StatusLists_Characters_CharacterId",
                        column: x => x.CharacterId,
                        principalTable: "Characters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TokenStatuses",
                columns: table => new
                {
                    TokenId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StatusId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Level = table.Column<int>(type: "int", nullable: true),
                    AppliedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AppliedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TokenStatuses", x => new { x.TokenId, x.StatusId });
                    table.ForeignKey(
                        name: "FK_TokenStatuses_AspNetUsers_AppliedByUserId",
                        column: x => x.AppliedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TokenStatuses_StatusDefinitions_StatusId",
                        column: x => x.StatusId,
                        principalTable: "StatusDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TokenStatuses_Tokens_TokenId",
                        column: x => x.TokenId,
                        principalTable: "Tokens",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "StatusListEntries",
                columns: table => new
                {
                    StatusListId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StatusId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Position = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatusListEntries", x => new { x.StatusListId, x.StatusId });
                    table.ForeignKey(
                        name: "FK_StatusListEntries_StatusDefinitions_StatusId",
                        column: x => x.StatusId,
                        principalTable: "StatusDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_StatusListEntries_StatusLists_StatusListId",
                        column: x => x.StatusListId,
                        principalTable: "StatusLists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "StatusDefinitions",
                columns: new[] { "Id", "CampaignId", "CharacterId", "CreatedAt", "CreatedByUserId", "HasLevels", "IconAssetId", "IconDescription", "LibraryKey", "Name" },
                values: new object[,]
                {
                    { new Guid("5a7d0000-0000-4000-8000-000000000001"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "blinded", "Blind" },
                    { new Guid("5a7d0000-0000-4000-8000-000000000002"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "charmed", "Bezaubert" },
                    { new Guid("5a7d0000-0000-4000-8000-000000000003"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "deafened", "Taub" },
                    { new Guid("5a7d0000-0000-4000-8000-000000000004"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, true, null, null, "exhaustion", "Erschöpfung" },
                    { new Guid("5a7d0000-0000-4000-8000-000000000005"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "frightened", "Verängstigt" },
                    { new Guid("5a7d0000-0000-4000-8000-000000000006"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "grappled", "Gepackt" },
                    { new Guid("5a7d0000-0000-4000-8000-000000000007"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "incapacitated", "Kampfunfähig" },
                    { new Guid("5a7d0000-0000-4000-8000-000000000008"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "invisible", "Unsichtbar" },
                    { new Guid("5a7d0000-0000-4000-8000-000000000009"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "paralyzed", "Gelähmt" },
                    { new Guid("5a7d0000-0000-4000-8000-00000000000a"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "petrified", "Versteinert" },
                    { new Guid("5a7d0000-0000-4000-8000-00000000000b"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "poisoned", "Vergiftet" },
                    { new Guid("5a7d0000-0000-4000-8000-00000000000c"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "prone", "Liegend" },
                    { new Guid("5a7d0000-0000-4000-8000-00000000000d"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "restrained", "Festgesetzt" },
                    { new Guid("5a7d0000-0000-4000-8000-00000000000e"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "stunned", "Betäubt" },
                    { new Guid("5a7d0000-0000-4000-8000-00000000000f"), null, null, new DateTimeOffset(new DateTime(2026, 10, 16, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), null, false, null, null, "unconscious", "Bewusstlos" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_Tokens_RemovedByUserId",
                table: "Tokens",
                column: "RemovedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_StatusDefinitions_CampaignId",
                table: "StatusDefinitions",
                column: "CampaignId");

            migrationBuilder.CreateIndex(
                name: "IX_StatusDefinitions_CharacterId",
                table: "StatusDefinitions",
                column: "CharacterId");

            migrationBuilder.CreateIndex(
                name: "IX_StatusDefinitions_CreatedByUserId",
                table: "StatusDefinitions",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_StatusDefinitions_IconAssetId",
                table: "StatusDefinitions",
                column: "IconAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_StatusDefinitions_LibraryKey",
                table: "StatusDefinitions",
                column: "LibraryKey",
                unique: true,
                filter: "[LibraryKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_StatusListEntries_StatusId",
                table: "StatusListEntries",
                column: "StatusId");

            migrationBuilder.CreateIndex(
                name: "IX_StatusLists_CampaignId_UserId",
                table: "StatusLists",
                columns: new[] { "CampaignId", "UserId" },
                unique: true,
                filter: "[UserId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_StatusLists_CharacterId",
                table: "StatusLists",
                column: "CharacterId",
                unique: true,
                filter: "[CharacterId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_StatusLists_UserId",
                table: "StatusLists",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_TokenStatuses_AppliedByUserId",
                table: "TokenStatuses",
                column: "AppliedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TokenStatuses_StatusId",
                table: "TokenStatuses",
                column: "StatusId");

            migrationBuilder.AddForeignKey(
                name: "FK_Tokens_AspNetUsers_RemovedByUserId",
                table: "Tokens",
                column: "RemovedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Tokens_AspNetUsers_RemovedByUserId",
                table: "Tokens");

            migrationBuilder.DropTable(
                name: "StatusListEntries");

            migrationBuilder.DropTable(
                name: "TokenStatuses");

            migrationBuilder.DropTable(
                name: "StatusLists");

            migrationBuilder.DropTable(
                name: "StatusDefinitions");

            migrationBuilder.DropIndex(
                name: "IX_Tokens_RemovedByUserId",
                table: "Tokens");

            migrationBuilder.DropColumn(
                name: "RemovedAt",
                table: "Tokens");

            migrationBuilder.DropColumn(
                name: "RemovedByUserId",
                table: "Tokens");
        }
    }
}
