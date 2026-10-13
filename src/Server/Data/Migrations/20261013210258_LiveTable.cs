using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class LiveTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "Tokens",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "TokenMoves",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    EncounterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    TokenId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FromX = table.Column<int>(type: "int", nullable: false),
                    FromY = table.Column<int>(type: "int", nullable: false),
                    FromElevation = table.Column<decimal>(type: "decimal(6,1)", precision: 6, scale: 1, nullable: false),
                    ToX = table.Column<int>(type: "int", nullable: false),
                    ToY = table.Column<int>(type: "int", nullable: false),
                    ToElevation = table.Column<decimal>(type: "decimal(6,1)", precision: 6, scale: 1, nullable: false),
                    Version = table.Column<int>(type: "int", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UndoneAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TokenMoves", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TokenMoves_AspNetUsers_ByUserId",
                        column: x => x.ByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TokenMoves_Tokens_TokenId",
                        column: x => x.TokenId,
                        principalTable: "Tokens",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TokenMoves_ByUserId",
                table: "TokenMoves",
                column: "ByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TokenMoves_EncounterId_ByUserId_Id",
                table: "TokenMoves",
                columns: new[] { "EncounterId", "ByUserId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_TokenMoves_TokenId_Id",
                table: "TokenMoves",
                columns: new[] { "TokenId", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TokenMoves");

            migrationBuilder.DropColumn(
                name: "Version",
                table: "Tokens");
        }
    }
}
