namespace OreanasOffice.Server.Data;

// How the startup migration went. Set once by DatabaseMigrator; a restart starts
// over at Migrating and migrates again (a no-op when up to date).
public sealed class DatabaseState
{
    private volatile MigrationStatus _status = MigrationStatus.Migrating;

    public MigrationStatus Status => _status;

    public bool IsMigrated => _status == MigrationStatus.Migrated;

    public void MarkMigrated() => _status = MigrationStatus.Migrated;

    public void MarkFailed() => _status = MigrationStatus.Failed;
}

public enum MigrationStatus
{
    Migrating,
    Migrated,
    // Gave up: an error that waiting won't fix (for example the app's identity
    // has no database access yet), or the database stayed unreachable too long.
    Failed,
}
