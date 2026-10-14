using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class Stage7Assets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BackgroundAssetId",
                table: "Encounters",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "BackgroundAssetId",
                table: "BattleMaps",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Assets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    OwnerType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    OwnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CampaignId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Origin = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Prompt = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    Model = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Quality = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    BlobName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ContentType = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    GridWidth = table.Column<int>(type: "int", nullable: true),
                    GridHeight = table.Column<int>(type: "int", nullable: true),
                    FrameX = table.Column<int>(type: "int", nullable: true),
                    FrameY = table.Column<int>(type: "int", nullable: true),
                    FrameWidth = table.Column<int>(type: "int", nullable: true),
                    FrameHeight = table.Column<int>(type: "int", nullable: true),
                    LayoutHash = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    CostUsd = table.Column<decimal>(type: "decimal(10,6)", precision: 10, scale: 6, nullable: true),
                    Failure = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    Attempts = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    StartedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    FinishedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Assets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Assets_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Assets_Campaigns_CampaignId",
                        column: x => x.CampaignId,
                        principalTable: "Campaigns",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Encounters_BackgroundAssetId",
                table: "Encounters",
                column: "BackgroundAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_BattleMaps_BackgroundAssetId",
                table: "BattleMaps",
                column: "BackgroundAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_Assets_CampaignId",
                table: "Assets",
                column: "CampaignId");

            migrationBuilder.CreateIndex(
                name: "IX_Assets_CreatedByUserId",
                table: "Assets",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Assets_FinishedAt",
                table: "Assets",
                column: "FinishedAt");

            migrationBuilder.CreateIndex(
                name: "IX_Assets_OwnerType_OwnerId_CreatedAt",
                table: "Assets",
                columns: new[] { "OwnerType", "OwnerId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Assets_Status_CreatedAt",
                table: "Assets",
                columns: new[] { "Status", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Assets");

            migrationBuilder.DropIndex(
                name: "IX_Encounters_BackgroundAssetId",
                table: "Encounters");

            migrationBuilder.DropIndex(
                name: "IX_BattleMaps_BackgroundAssetId",
                table: "BattleMaps");

            migrationBuilder.DropColumn(
                name: "BackgroundAssetId",
                table: "Encounters");

            migrationBuilder.DropColumn(
                name: "BackgroundAssetId",
                table: "BattleMaps");
        }
    }
}
