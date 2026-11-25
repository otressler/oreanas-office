using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class SpellSuggestions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SpellCardDrafts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SpellId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CardJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    MotifSubject = table.Column<string>(type: "nvarchar(1500)", maxLength: 1500, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpellCardDrafts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpellCardDrafts_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SpellCardDrafts_Spells_SpellId",
                        column: x => x.SpellId,
                        principalTable: "Spells",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SpellCardRevisions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PreviousJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    RevertedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpellCardRevisions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpellCardRevisions_SpellVariants_VariantId",
                        column: x => x.VariantId,
                        principalTable: "SpellVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SpellJobs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    SpellId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Outcome = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    Error = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Detail = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    Attempts = table.Column<int>(type: "int", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    StartedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    FinishedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpellJobs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpellJobs_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SpellJobs_SpellVariants_VariantId",
                        column: x => x.VariantId,
                        principalTable: "SpellVariants",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SpellJobs_Spells_SpellId",
                        column: x => x.SpellId,
                        principalTable: "Spells",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SpellCardDrafts_CreatedByUserId",
                table: "SpellCardDrafts",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SpellCardDrafts_SpellId",
                table: "SpellCardDrafts",
                column: "SpellId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SpellCardRevisions_VariantId_CreatedAt",
                table: "SpellCardRevisions",
                columns: new[] { "VariantId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SpellJobs_CreatedByUserId",
                table: "SpellJobs",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SpellJobs_SpellId_Kind",
                table: "SpellJobs",
                columns: new[] { "SpellId", "Kind" });

            migrationBuilder.CreateIndex(
                name: "IX_SpellJobs_Status_CreatedAt",
                table: "SpellJobs",
                columns: new[] { "Status", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SpellJobs_VariantId",
                table: "SpellJobs",
                column: "VariantId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SpellCardDrafts");

            migrationBuilder.DropTable(
                name: "SpellCardRevisions");

            migrationBuilder.DropTable(
                name: "SpellJobs");
        }
    }
}
