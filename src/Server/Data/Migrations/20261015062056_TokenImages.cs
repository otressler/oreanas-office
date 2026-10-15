using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class TokenImages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "IconAssetId",
                table: "CreatureTypes",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Appearance",
                table: "Characters",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<Guid>(
                name: "TokenAssetId",
                table: "Characters",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceAssetId",
                table: "Assets",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_CreatureTypes_IconAssetId",
                table: "CreatureTypes",
                column: "IconAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_Characters_TokenAssetId",
                table: "Characters",
                column: "TokenAssetId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CreatureTypes_IconAssetId",
                table: "CreatureTypes");

            migrationBuilder.DropIndex(
                name: "IX_Characters_TokenAssetId",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "IconAssetId",
                table: "CreatureTypes");

            migrationBuilder.DropColumn(
                name: "Appearance",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "TokenAssetId",
                table: "Characters");

            migrationBuilder.DropColumn(
                name: "SourceAssetId",
                table: "Assets");
        }
    }
}
