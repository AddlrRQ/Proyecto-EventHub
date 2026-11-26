/* =============================================================================
   EventHub - Script OPCIONAL de usuario SQL Server de mínimo privilegio
   -----------------------------------------------------------------------------
   ADVERTENCIA IMPORTANTE:
   1. NO ejecutar automáticamente ni sin revisar antes en SSMS.
   2. REEMPLAZA el placeholder de contraseña antes de ejecutar este script.
   3. La aplicación NO requiere sysadmin, NO requiere db_owner y NO debe usar sa.
   4. Este usuario otorga únicamente los permisos DML mínimos necesarios sobre
      las tablas de EventHubDB que utiliza backend/server.js.
   ============================================================================= */

USE master;
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = N'eventhub_app')
BEGIN
    CREATE LOGIN [eventhub_app]
        WITH PASSWORD = N'REEMPLAZAR_CON_CONTRASENA_SEGURA_ANTES_DE_EJECUTAR',
        DEFAULT_DATABASE = [EventHubDB],
        CHECK_EXPIRATION = OFF,
        CHECK_POLICY = ON;
END
GO

USE EventHubDB;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'eventhub_app')
BEGIN
    CREATE USER [eventhub_app] FOR LOGIN [eventhub_app];
END
GO

/* Permisos mínimos estrictos por tabla (principio de mínimo privilegio) ----- */
GRANT SELECT                         ON dbo.Categorias         TO [eventhub_app];
GRANT SELECT                         ON dbo.Administradores    TO [eventhub_app];
GRANT SELECT, UPDATE                 ON dbo.Organizaciones     TO [eventhub_app];
GRANT SELECT, INSERT                 ON dbo.Participantes      TO [eventhub_app];
GRANT SELECT, INSERT, DELETE         ON dbo.Actividades_Evento TO [eventhub_app];
GRANT SELECT, INSERT, DELETE         ON dbo.Inscripciones      TO [eventhub_app];
GRANT SELECT, INSERT, UPDATE, DELETE ON dbo.Eventos            TO [eventhub_app];
GO
