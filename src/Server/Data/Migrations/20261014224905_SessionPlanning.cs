using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class SessionPlanning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Every fight now belongs to a session (knowledge/features/session-planning.md).
            // The app isn't in real use yet, so the old sessions and fights go rather than
            // being migrated; maps, creature types and characters stay.
            migrationBuilder.Sql("DELETE FROM [TokenMoves]; DELETE FROM [Tokens]; DELETE FROM [Encounters]; DELETE FROM [Sessions];");

            migrationBuilder.AddColumn<Guid>(
                name: "InterruptedEncounterId",
                table: "Sessions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "SessionId",
                table: "Encounters",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InterruptedEncounterId",
                table: "Sessions");

            migrationBuilder.AlterColumn<Guid>(
                name: "SessionId",
                table: "Encounters",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");
        }
    }
}
