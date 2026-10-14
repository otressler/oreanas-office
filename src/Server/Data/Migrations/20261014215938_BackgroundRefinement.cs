using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class BackgroundRefinement : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Instruction",
                table: "Assets",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RefinedFromAssetId",
                table: "Assets",
                type: "uniqueidentifier",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Instruction",
                table: "Assets");

            migrationBuilder.DropColumn(
                name: "RefinedFromAssetId",
                table: "Assets");
        }
    }
}
