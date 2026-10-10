using Microsoft.EntityFrameworkCore;

namespace OreanasOffice.Server.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
}
