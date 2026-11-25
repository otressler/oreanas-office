using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OreanasOffice.Server.Data.Migrations
{
    /// <inheritdoc />
    public partial class RulesGlossary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GlossaryEntries",
                columns: table => new
                {
                    Name = table.Column<string>(type: "nvarchar(60)", maxLength: 60, nullable: false),
                    Tag = table.Column<string>(type: "nvarchar(30)", maxLength: 30, nullable: true),
                    Text = table.Column<string>(type: "nvarchar(max)", maxLength: 8000, nullable: false),
                    Position = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GlossaryEntries", x => x.Name);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GlossaryEntries");
        }
    }
}
