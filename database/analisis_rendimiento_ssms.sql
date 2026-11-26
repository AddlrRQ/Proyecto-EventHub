/* =============================================================================
   EventHub - Script de análisis de rendimiento para SQL Server Management Studio
   -----------------------------------------------------------------------------
   Uso manual en SSMS:
   1. Activar "Include Actual Execution Plan" (Ctrl + M).
   2. Ejecutar este script por bloques o completo en EventHubDB.
   3. Revisar pestaña "Messages" (lecturas lógicas, CPU, tiempo transcurrido)
      y pestaña "Execution plan".

   Qué inspeccionar en el plan de ejecución real:
   - Index Seek vs Index Scan vs Table Scan / Clustered Index Scan:
     confirmar que las búsquedas por slug, correo, id_evento e id_organizacion
     usen Index Seek o Clustered Index Seek.
   - Key Lookup:
     verificar si aparece y qué porcentaje del costo representa; no añadir
     índices cubrientes anchos si el costo de Key Lookup es marginal frente al
     costo adicional en INSERT/UPDATE/DELETE.
   - Lecturas lógicas (logical reads):
     comparar antes y después de la migración 003 y de la reestructuración
     de consultarEventos() (CTE prefiltrada + OUTER APPLY).
   - Tiempo de CPU y tiempo transcurrido (CPU time / elapsed time).
   - Filas estimadas vs filas reales (Estimated Number of Rows vs Actual):
     desviaciones grandes suelen indicar predicados no sargables como
     (@param IS NULL OR col = @param) o estadísticas desactualizadas.
   ============================================================================= */

USE EventHubDB;
GO

SET STATISTICS IO ON;
SET STATISTICS TIME ON;
GO

/* -----------------------------------------------------------------------------
   1. Obtener eventos activos de una organización (micrositio)
      Patrón nuevo: prefiltrado sargable en CTE + OUTER APPLY para cupos.
   ----------------------------------------------------------------------------- */
DECLARE @slug_org NVARCHAR(60) = N'upc';
DECLARE @id_org_resuelta INT = (
    SELECT id_organizacion
    FROM dbo.Organizaciones
    WHERE slug = @slug_org AND activo = 1
);

WITH EventosFiltrados AS (
    SELECT e.id_evento, e.id_categoria, c.slug AS categoria_slug, c.nombre AS categoria_nombre,
           e.id_organizacion, o.slug AS organizacion_slug, o.nombre AS organizacion_nombre,
           e.titulo, e.fecha_evento, e.lugar, e.horario, e.descripcion, e.capacidad, e.activo
    FROM dbo.Eventos e
    INNER JOIN dbo.Categorias c ON c.id_categoria = e.id_categoria
    INNER JOIN dbo.Organizaciones o ON o.id_organizacion = e.id_organizacion
    WHERE e.id_organizacion = @id_org_resuelta
      AND e.activo = 1
)
SELECT ef.id_evento, ef.id_categoria, ef.categoria_slug, ef.categoria_nombre,
       ef.id_organizacion, ef.organizacion_slug, ef.organizacion_nombre,
       ef.titulo, CONVERT(VARCHAR(10), ef.fecha_evento, 23) AS fecha_evento,
       ef.lugar, ef.horario, ef.descripcion, ef.capacidad,
       ISNULL(occ.inscritos_vigentes, 0) AS inscritos_vigentes,
       CASE
           WHEN ef.capacidad - ISNULL(occ.inscritos_vigentes, 0) > 0
           THEN ef.capacidad - ISNULL(occ.inscritos_vigentes, 0)
           ELSE 0
       END AS cupos_disponibles,
       ef.activo
FROM EventosFiltrados ef
OUTER APPLY (
    SELECT COUNT(*) AS inscritos_vigentes
    FROM dbo.Inscripciones i
    WHERE i.id_evento = ef.id_evento
      AND i.estado IN (N'confirmada', N'pendiente')
) occ
ORDER BY ef.fecha_evento, ef.id_evento;

/* -----------------------------------------------------------------------------
   2. Consultar actividades de los eventos de la organización
      Debe aprovechar IX_Eventos_organizacion_activo + UQ_Actividades_evento_orden.
   ----------------------------------------------------------------------------- */
SELECT a.id_actividad, a.id_evento, a.descripcion_actividad, a.orden
FROM dbo.Actividades_Evento a
INNER JOIN dbo.Eventos e ON e.id_evento = a.id_evento
WHERE e.id_organizacion = @id_org_resuelta
  AND e.activo = 1
ORDER BY a.id_evento, a.orden;
GO

/* -----------------------------------------------------------------------------
   3. Calcular cupos de un evento específico (ruta crítica de inscripción)
      Debe usar PK_Eventos (Seek) e IX_Inscripciones_evento_estado (Seek).
   ----------------------------------------------------------------------------- */
DECLARE @id_evento_prueba INT = (SELECT TOP 1 id_evento FROM dbo.Eventos WHERE activo = 1 ORDER BY id_evento);

SELECT e.id_evento,
       e.capacidad,
       ISNULL(occ.inscritos_vigentes, 0) AS inscritos_vigentes,
       CASE
           WHEN e.capacidad - ISNULL(occ.inscritos_vigentes, 0) > 0
           THEN e.capacidad - ISNULL(occ.inscritos_vigentes, 0)
           ELSE 0
       END AS cupos_disponibles
FROM dbo.Eventos e
OUTER APPLY (
    SELECT COUNT(*) AS inscritos_vigentes
    FROM dbo.Inscripciones i
    WHERE i.id_evento = e.id_evento
      AND i.estado IN (N'confirmada', N'pendiente')
) occ
WHERE e.id_evento = @id_evento_prueba;
GO

/* -----------------------------------------------------------------------------
   4. Obtener eventos y resumen del Portal por organización
   ----------------------------------------------------------------------------- */
DECLARE @id_org_portal INT = (SELECT TOP 1 id_organizacion FROM dbo.Organizaciones WHERE activo = 1 ORDER BY id_organizacion);

SELECT o.id_organizacion, o.slug, o.nombre,
       evStats.total_eventos,
       evStats.eventos_activos,
       insStats.total_inscripciones
FROM dbo.Organizaciones o
CROSS APPLY (
    SELECT COUNT(*) AS total_eventos,
           ISNULL(SUM(CASE WHEN e.activo = 1 THEN 1 ELSE 0 END), 0) AS eventos_activos
    FROM dbo.Eventos e
    WHERE e.id_organizacion = o.id_organizacion
) evStats
CROSS APPLY (
    SELECT COUNT(*) AS total_inscripciones
    FROM dbo.Inscripciones i
    INNER JOIN dbo.Eventos e ON e.id_evento = i.id_evento
    WHERE e.id_organizacion = o.id_organizacion
      AND i.estado IN (N'confirmada', N'pendiente')
) insStats
WHERE o.id_organizacion = @id_org_portal;

WITH EventosPortal AS (
    SELECT e.id_evento, e.id_categoria, c.slug AS categoria_slug, c.nombre AS categoria_nombre,
           e.id_organizacion, o.slug AS organizacion_slug, o.nombre AS organizacion_nombre,
           e.titulo, e.fecha_evento, e.lugar, e.horario, e.descripcion, e.capacidad, e.activo
    FROM dbo.Eventos e
    INNER JOIN dbo.Categorias c ON c.id_categoria = e.id_categoria
    LEFT JOIN dbo.Organizaciones o ON o.id_organizacion = e.id_organizacion
    WHERE e.id_organizacion = @id_org_portal
)
SELECT ep.id_evento, ep.titulo, CONVERT(VARCHAR(10), ep.fecha_evento, 23) AS fecha_evento,
       ep.capacidad, ISNULL(occ.inscritos_vigentes, 0) AS inscritos_vigentes, ep.activo
FROM EventosPortal ep
OUTER APPLY (
    SELECT COUNT(*) AS inscritos_vigentes
    FROM dbo.Inscripciones i
    WHERE i.id_evento = ep.id_evento
      AND i.estado IN (N'confirmada', N'pendiente')
) occ
ORDER BY ep.fecha_evento, ep.id_evento;
GO

/* -----------------------------------------------------------------------------
   5. Consultar inscripciones (por correo y por organización del Portal)
   ----------------------------------------------------------------------------- */
DECLARE @correo_prueba NVARCHAR(150) = N'demo@eventhub.invalid';
DECLARE @id_org_insc INT = (SELECT TOP 1 id_organizacion FROM dbo.Organizaciones WHERE activo = 1 ORDER BY id_organizacion);

SELECT i.id_inscripcion, i.estado, i.fecha_inscripcion,
       p.id_participante, p.nombre_completo, p.correo,
       e.id_evento, e.titulo AS evento,
       o.slug AS organizacion_slug, o.nombre AS organizacion_nombre
FROM dbo.Inscripciones i
INNER JOIN dbo.Participantes p ON p.id_participante = i.id_participante
INNER JOIN dbo.Eventos e       ON e.id_evento       = i.id_evento
LEFT JOIN dbo.Organizaciones o ON o.id_organizacion = e.id_organizacion
WHERE p.correo = @correo_prueba
ORDER BY i.fecha_inscripcion DESC, i.id_inscripcion DESC;

SELECT i.id_inscripcion, i.estado, i.fecha_inscripcion,
       p.id_participante, p.nombre_completo, p.correo,
       e.id_evento, e.titulo AS evento,
       o.slug AS organizacion_slug, o.nombre AS organizacion_nombre
FROM dbo.Inscripciones i
INNER JOIN dbo.Participantes p ON p.id_participante = i.id_participante
INNER JOIN dbo.Eventos e       ON e.id_evento       = i.id_evento
LEFT JOIN dbo.Organizaciones o ON o.id_organizacion = e.id_organizacion
WHERE e.id_organizacion = @id_org_insc
ORDER BY i.fecha_inscripcion DESC, i.id_inscripcion DESC;
GO

SET STATISTICS IO OFF;
SET STATISTICS TIME OFF;
GO
