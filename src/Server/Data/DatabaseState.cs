namespace OreanasOffice.Server.Data;

// Whether the startup migration has finished. Set once by DatabaseMigrator;
// a restart starts over at false and migrates again (a no-op when up to date).
public sealed class DatabaseState
{
    private volatile bool _isMigrated;

    public bool IsMigrated => _isMigrated;

    public void MarkMigrated() => _isMigrated = true;
}
