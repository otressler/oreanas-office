using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    // The 2024 Player's Handbook's classes and spell lists (knowledge/rules/handbook-classes.md).
    // Drops the free-text Characters.CharacterClass on purpose: the project owner chose to throw
    // it away for the class picker (2026-11-24). HandbookSync fills the new tables after it runs.
    public partial class HandbookClasses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Spells_AspNetUsers_CreatedByUserId",
                table: "Spells");

            migrationBuilder.DropIndex(
                name: "IX_Spells_CreatedByUserId",
                table: "Spells");

            migrationBuilder.DropColumn(
                name: "CreatedByUserId",
                table: "Spells");

            migrationBuilder.DropColumn(
                name: "CharacterClass",
                table: "Characters");

            migrationBuilder.AddColumn<bool>(
                name: "InHandbook",
                table: "Spells",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Slug",
                table: "Spells",
                type: "varchar(60)",
                unicode: false,
                maxLength: 60,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CharacterClasses",
                columns: table => new
                {
                    Id = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    NameEn = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    NameDe = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Caster = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: true),
                    Position = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CharacterClasses", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ReferenceDataVersions",
                columns: table => new
                {
                    Key = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Hash = table.Column<string>(type: "varchar(64)", unicode: false, maxLength: 64, nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReferenceDataVersions", x => x.Key);
                });

            migrationBuilder.CreateTable(
                name: "CharacterSubclasses",
                columns: table => new
                {
                    Id = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    ClassId = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    NameEn = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    NameDe = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    SpellListClassId = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: true),
                    Position = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CharacterSubclasses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CharacterSubclasses_CharacterClasses_ClassId",
                        column: x => x.ClassId,
                        principalTable: "CharacterClasses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CharacterSubclasses_CharacterClasses_SpellListClassId",
                        column: x => x.SpellListClassId,
                        principalTable: "CharacterClasses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "CharacterClassLevels",
                columns: table => new
                {
                    CharacterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClassId = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    Level = table.Column<int>(type: "int", nullable: false),
                    SubclassId = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: true),
                    Position = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CharacterClassLevels", x => new { x.CharacterId, x.ClassId });
                    table.ForeignKey(
                        name: "FK_CharacterClassLevels_CharacterClasses_ClassId",
                        column: x => x.ClassId,
                        principalTable: "CharacterClasses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CharacterClassLevels_CharacterSubclasses_SubclassId",
                        column: x => x.SubclassId,
                        principalTable: "CharacterSubclasses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CharacterClassLevels_Characters_CharacterId",
                        column: x => x.CharacterId,
                        principalTable: "Characters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SpellListEntries",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    SpellId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ClassId = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: false),
                    SubclassId = table.Column<string>(type: "varchar(40)", unicode: false, maxLength: 40, nullable: true),
                    ClassLevel = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpellListEntries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpellListEntries_CharacterClasses_ClassId",
                        column: x => x.ClassId,
                        principalTable: "CharacterClasses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SpellListEntries_CharacterSubclasses_SubclassId",
                        column: x => x.SubclassId,
                        principalTable: "CharacterSubclasses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SpellListEntries_Spells_SpellId",
                        column: x => x.SpellId,
                        principalTable: "Spells",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CharacterClassLevels_ClassId",
                table: "CharacterClassLevels",
                column: "ClassId");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterClassLevels_SubclassId",
                table: "CharacterClassLevels",
                column: "SubclassId");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterSubclasses_ClassId",
                table: "CharacterSubclasses",
                column: "ClassId");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterSubclasses_SpellListClassId",
                table: "CharacterSubclasses",
                column: "SpellListClassId");

            migrationBuilder.CreateIndex(
                name: "IX_SpellListEntries_ClassId",
                table: "SpellListEntries",
                column: "ClassId");

            migrationBuilder.CreateIndex(
                name: "IX_SpellListEntries_SpellId_ClassId_SubclassId",
                table: "SpellListEntries",
                columns: new[] { "SpellId", "ClassId", "SubclassId" },
                unique: true,
                filter: "[SubclassId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SpellListEntries_SubclassId",
                table: "SpellListEntries",
                column: "SubclassId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CharacterClassLevels");

            migrationBuilder.DropTable(
                name: "ReferenceDataVersions");

            migrationBuilder.DropTable(
                name: "SpellListEntries");

            migrationBuilder.DropTable(
                name: "CharacterSubclasses");

            migrationBuilder.DropTable(
                name: "CharacterClasses");

            migrationBuilder.DropColumn(
                name: "InHandbook",
                table: "Spells");

            migrationBuilder.DropColumn(
                name: "Slug",
                table: "Spells");

            migrationBuilder.AddColumn<Guid>(
                name: "CreatedByUserId",
                table: "Spells",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<string>(
                name: "CharacterClass",
                table: "Characters",
                type: "nvarchar(40)",
                maxLength: 40,
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_Spells_CreatedByUserId",
                table: "Spells",
                column: "CreatedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_Spells_AspNetUsers_CreatedByUserId",
                table: "Spells",
                column: "CreatedByUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
