using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class FogSpectatorsSharedTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "FromSharedScreen",
                table: "TokenStatuses",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "Number",
                table: "Tokens",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "FromSharedScreen",
                table: "TokenMoves",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PlayMode",
                table: "Sessions",
                type: "nvarchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "Byod");

            migrationBuilder.AddColumn<string>(
                name: "FogJson",
                table: "Encounters",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "FogVersion",
                table: "Encounters",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "SessionSpectators",
                columns: table => new
                {
                    SessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    JoinedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SessionSpectators", x => new { x.SessionId, x.UserId });
                    table.ForeignKey(
                        name: "FK_SessionSpectators_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SessionSpectators_Sessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "Sessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SessionSpectators_UserId",
                table: "SessionSpectators",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SessionSpectators");

            migrationBuilder.DropColumn(
                name: "FromSharedScreen",
                table: "TokenStatuses");

            migrationBuilder.DropColumn(
                name: "Number",
                table: "Tokens");

            migrationBuilder.DropColumn(
                name: "FromSharedScreen",
                table: "TokenMoves");

            migrationBuilder.DropColumn(
                name: "PlayMode",
                table: "Sessions");

            migrationBuilder.DropColumn(
                name: "FogJson",
                table: "Encounters");

            migrationBuilder.DropColumn(
                name: "FogVersion",
                table: "Encounters");
        }
    }
}
