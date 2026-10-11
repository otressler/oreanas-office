using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace OreanasOffice.Server.Campaigns;

public static class UniqueIndex
{
    // SQL Server 2601: duplicate key in a unique index; 2627: in a unique or
    // primary key constraint. Endpoints that rely on the database to settle a race
    // (join codes, membership, the one active session) turn these into answers.
    // SaveChanges wraps the SqlException in a DbUpdateException; ExecuteUpdate
    // throws it as it is.
    public static bool IsViolation(Exception ex) =>
        (ex is DbUpdateException ? ex.InnerException : ex) is SqlException { Number: 2601 or 2627 };
}
