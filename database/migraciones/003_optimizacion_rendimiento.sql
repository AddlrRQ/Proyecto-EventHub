/* =============================================================================
   EventHub - Migración 003: Optimización de rendimiento e índices justificados
   -----------------------------------------------------------------------------
   Requisitos: haber ejecutado antes:
   - database/database_eventhub.sql
   - database/migraciones/001_organizaciones.sql
   - database/migraciones/002_catalogo_organizaciones.sql

   Principios aplicados:
   - Idempotente: puede ejecutarse múltiples veces sin error ni duplicados.
   - No destructiva: conserva todas las tablas, columnas, restricciones y datos.
   - Elimina únicamente índices estrictamente redundantes ya cubiertos por otro
     índice existente con la misma clave principal.
   - Crea únicamente índices justificados por los patrones de consulta reales.

   Índices existentes evaluados (NO duplicados):
   - PK_Eventos (id_evento)                        -> cubre búsqueda por id_evento.
   - IX_Eventos_organizacion_activo
     (id_organizacion, activo, fecha_evento)       -> cubre micrositio y portal por org.
   - UQ_Actividades_evento_orden (id_evento, orden)-> cubre actividades por evento y orden.
   - IX_Inscripciones_evento_estado
     (id_evento) INCLUDE (estado)                  -> cubre conteo de cupos vigentes.
   - UQ_Participantes_correo (correo)              -> cubre búsqueda por correo.
   - UQ_Organizaciones_slug (slug)                 -> cubre micrositio por slug.
   - UQ_Administradores_usuario (usuario)          -> cubre login del portal.
   - UQ_Inscripciones_participante_evento
     (id_participante, id_evento)                  -> cubre duplicados y lookup por participante.
   ============================================================================= */

USE EventHubDB;
GO

/* 1. Eliminar índice estrictamente redundante en dbo.Inscripciones ----------
   IX_Inscripciones_evento (id_evento) es un subconjunto exacto de
   IX_Inscripciones_evento_estado (id_evento) INCLUDE (estado).
   Mantener ambos duplica almacenamiento y costo de escritura en INSERT/DELETE.
   Solo se elimina si IX_Inscripciones_evento_estado existe previamente. */
IF OBJECT_ID(N'dbo.Inscripciones', N'U') IS NOT NULL
   AND EXISTS (
       SELECT 1
       FROM sys.indexes
       WHERE name = N'IX_Inscripciones_evento'
         AND object_id = OBJECT_ID(N'dbo.Inscripciones')
   )
   AND EXISTS (
       SELECT 1
       FROM sys.indexes
       WHERE name = N'IX_Inscripciones_evento_estado'
         AND object_id = OBJECT_ID(N'dbo.Inscripciones')
   )
BEGIN
    DROP INDEX IX_Inscripciones_evento ON dbo.Inscripciones;
END
GO

/* 2. Índice para listado público general de eventos activos por fecha -------
   Justificación: GET /api/eventos (sin id_organizacion) filtra por
   e.activo = 1 y ordena por e.fecha_evento, e.id_evento. Ningún índice previo
   tiene (activo) como clave líder (IX_Eventos_categoria_activo comienza por
   id_categoria y IX_Eventos_organizacion_activo por id_organizacion).
   Se mantiene estrecho (solo columnas clave) para no penalizar escrituras ni
   almacenar NVARCHAR(1000) de descripcion en el índice. */
IF OBJECT_ID(N'dbo.Eventos', N'U') IS NOT NULL
   AND NOT EXISTS (
       SELECT 1
       FROM sys.indexes
       WHERE name = N'IX_Eventos_activo_fecha'
         AND object_id = OBJECT_ID(N'dbo.Eventos')
   )
BEGIN
    CREATE INDEX IX_Eventos_activo_fecha
        ON dbo.Eventos (activo, fecha_evento, id_evento);
END
GO

/* 3. Verificación no destructiva de índices en tablas principales ----------- */
SELECT OBJECT_NAME(i.object_id) AS tabla,
       i.name AS indice,
       i.type_desc AS tipo,
       i.is_unique AS es_unico,
       ic.key_ordinal AS orden_clave,
       ic.is_included_column AS es_incluida,
       c.name AS columna
FROM sys.indexes i
INNER JOIN sys.index_columns ic
        ON ic.object_id = i.object_id AND ic.index_id = i.index_id
INNER JOIN sys.columns c
        ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.object_id IN (
    OBJECT_ID(N'dbo.Organizaciones'),
    OBJECT_ID(N'dbo.Categorias'),
    OBJECT_ID(N'dbo.Eventos'),
    OBJECT_ID(N'dbo.Actividades_Evento'),
    OBJECT_ID(N'dbo.Participantes'),
    OBJECT_ID(N'dbo.Inscripciones'),
    OBJECT_ID(N'dbo.Administradores')
)
  AND i.name IS NOT NULL
ORDER BY tabla, indice, ic.is_included_column, ic.key_ordinal, ic.index_column_id;
GO
