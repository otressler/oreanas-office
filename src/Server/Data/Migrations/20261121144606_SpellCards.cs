using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class SpellCards : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "CampaignId",
                table: "Assets",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<Guid>(
                name: "SpellArtPromptId",
                table: "Assets",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Spells",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    NameEn = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    NameKey = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Level = table.Column<int>(type: "int", nullable: false),
                    School = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Spells", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Spells_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TextModelCalls",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Purpose = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    Model = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    InputTokens = table.Column<int>(type: "int", nullable: false),
                    OutputTokens = table.Column<int>(type: "int", nullable: false),
                    CostUsd = table.Column<decimal>(type: "decimal(10,6)", precision: 10, scale: 6, nullable: false),
                    Succeeded = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TextModelCalls", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TextModelCalls_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "SpellVariants",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SpellId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AuthorUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    BasedOnVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Origin = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    CardJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ArtAssetId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ArtApproved = table.Column<bool>(type: "bit", nullable: false),
                    SeedKey = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpellVariants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpellVariants_AspNetUsers_AuthorUserId",
                        column: x => x.AuthorUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SpellVariants_SpellVariants_BasedOnVariantId",
                        column: x => x.BasedOnVariantId,
                        principalTable: "SpellVariants",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_SpellVariants_Spells_SpellId",
                        column: x => x.SpellId,
                        principalTable: "Spells",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CharacterSpells",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    CharacterId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SpellId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Prepared = table.Column<bool>(type: "bit", nullable: false),
                    AddedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CharacterSpells", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CharacterSpells_Characters_CharacterId",
                        column: x => x.CharacterId,
                        principalTable: "Characters",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_CharacterSpells_SpellVariants_VariantId",
                        column: x => x.VariantId,
                        principalTable: "SpellVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_CharacterSpells_Spells_SpellId",
                        column: x => x.SpellId,
                        principalTable: "Spells",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "SpellArtEvents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AssetId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Kind = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Value = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpellArtEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpellArtEvents_AspNetUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SpellArtEvents_SpellVariants_VariantId",
                        column: x => x.VariantId,
                        principalTable: "SpellVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SpellArtPrompts",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    VariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Letter = table.Column<string>(type: "varchar(1)", unicode: false, maxLength: 1, nullable: false),
                    Subject = table.Column<string>(type: "nvarchar(1500)", maxLength: 1500, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SpellArtPrompts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SpellArtPrompts_AspNetUsers_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SpellArtPrompts_SpellVariants_VariantId",
                        column: x => x.VariantId,
                        principalTable: "SpellVariants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CharacterSpells_CharacterId_SpellId",
                table: "CharacterSpells",
                columns: new[] { "CharacterId", "SpellId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CharacterSpells_SpellId",
                table: "CharacterSpells",
                column: "SpellId");

            migrationBuilder.CreateIndex(
                name: "IX_CharacterSpells_VariantId",
                table: "CharacterSpells",
                column: "VariantId");

            migrationBuilder.CreateIndex(
                name: "IX_SpellArtEvents_UserId",
                table: "SpellArtEvents",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_SpellArtEvents_VariantId_CreatedAt",
                table: "SpellArtEvents",
                columns: new[] { "VariantId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_SpellArtPrompts_CreatedByUserId",
                table: "SpellArtPrompts",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SpellArtPrompts_VariantId_Letter_CreatedAt",
                table: "SpellArtPrompts",
                columns: new[] { "VariantId", "Letter", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Spells_CreatedByUserId",
                table: "Spells",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_Spells_NameKey",
                table: "Spells",
                column: "NameKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SpellVariants_ArtAssetId",
                table: "SpellVariants",
                column: "ArtAssetId");

            migrationBuilder.CreateIndex(
                name: "IX_SpellVariants_AuthorUserId",
                table: "SpellVariants",
                column: "AuthorUserId");

            migrationBuilder.CreateIndex(
                name: "IX_SpellVariants_BasedOnVariantId",
                table: "SpellVariants",
                column: "BasedOnVariantId");

            migrationBuilder.CreateIndex(
                name: "IX_SpellVariants_SeedKey",
                table: "SpellVariants",
                column: "SeedKey",
                unique: true,
                filter: "[SeedKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_SpellVariants_SpellId",
                table: "SpellVariants",
                column: "SpellId");

            migrationBuilder.CreateIndex(
                name: "IX_TextModelCalls_CreatedAt",
                table: "TextModelCalls",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_TextModelCalls_UserId",
                table: "TextModelCalls",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CharacterSpells");

            migrationBuilder.DropTable(
                name: "SpellArtEvents");

            migrationBuilder.DropTable(
                name: "SpellArtPrompts");

            migrationBuilder.DropTable(
                name: "TextModelCalls");

            migrationBuilder.DropTable(
                name: "SpellVariants");

            migrationBuilder.DropTable(
                name: "Spells");

            migrationBuilder.DropColumn(
                name: "SpellArtPromptId",
                table: "Assets");

            migrationBuilder.AlterColumn<Guid>(
                name: "CampaignId",
                table: "Assets",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);
        }
    }
}
