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
                name: "EncounterChanges",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    EncounterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Payload = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    At = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UndoneAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EncounterChanges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EncounterChanges_AspNetUsers_ByUserId",
                        column: x => x.ByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

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
                name: "IX_EncounterChanges_ByUserId",
                table: "EncounterChanges",
                column: "ByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_EncounterChanges_EncounterId_Id",
                table: "EncounterChanges",
                columns: new[] { "EncounterId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_SessionSpectators_UserId",
                table: "SessionSpectators",
                column: "UserId");

            // knowledge/domain/token.md: a creature's label becomes Number and the DM's own name.
            // "Goblin 3" of type "Goblin" gives Number 3 and no name; the bare type name gives
            // neither; any other label stays as the DM's name.
            migrationBuilder.Sql(@"
UPDATE t SET t.Number = TRY_CAST(RIGHT(t.Label, LEN(t.Label) - LEN(ct.Name) - 1) AS int), t.Label = NULL
FROM Tokens t JOIN CreatureTypes ct ON ct.Id = t.CreatureTypeId
WHERE t.Kind = N'Creature' AND t.Label LIKE ct.Name + N' [0-9]%'
  AND TRY_CAST(RIGHT(t.Label, LEN(t.Label) - LEN(ct.Name) - 1) AS int) > 0;
UPDATE t SET t.Label = NULL
FROM Tokens t JOIN CreatureTypes ct ON ct.Id = t.CreatureTypeId
WHERE t.Kind = N'Creature' AND t.Label = ct.Name;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EncounterChanges");

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
