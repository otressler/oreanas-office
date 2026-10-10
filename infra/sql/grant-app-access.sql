-- Gives the container app's managed identity access to the database.
--
-- Run once after the first deployment, connected to the OreanasOffice database
-- (not master) as the server's Microsoft Entra admin. See infra/README.md.
--
-- [oreanas-office] is the container app name, which is also the display name of
-- its system-assigned managed identity (deployment output appIdentityName).
-- If the container app is ever deleted and recreated it gets a new identity:
-- run DROP USER [oreanas-office]; and then this script again.

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'oreanas-office')
    CREATE USER [oreanas-office] FROM EXTERNAL PROVIDER;

-- Read and write data.
ALTER ROLE db_datareader ADD MEMBER [oreanas-office];
ALTER ROLE db_datawriter ADD MEMBER [oreanas-office];
-- The app applies EF Core migrations on startup, so it creates and alters tables.
ALTER ROLE db_ddladmin ADD MEMBER [oreanas-office];

-- Check: should list the three roles.
SELECT r.name AS role_name
FROM sys.database_role_members AS m
JOIN sys.database_principals AS r ON r.principal_id = m.role_principal_id
JOIN sys.database_principals AS u ON u.principal_id = m.member_principal_id
WHERE u.name = N'oreanas-office';
