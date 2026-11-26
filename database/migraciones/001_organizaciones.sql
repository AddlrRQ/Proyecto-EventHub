/* =============================================================================
   EventHub v1.0 - Migración 001: Organizaciones, capacidad y cuentas del portal
   -----------------------------------------------------------------------------
   Requisito: haber ejecutado antes database/database_eventhub.sql.

   - Idempotente: puede ejecutarse varias veces sin duplicar objetos ni datos.
   - No borra tablas, columnas ni filas existentes.
   - Eventos.id_organizacion se crea como NULL para no romper una versión
     anterior de la API que siga insertando eventos durante la transición.
     Cuando todas las instancias web usen la v1.0, ejecutar la migración 002
     para volverla NOT NULL.
   - Eventos.capacidad se crea NOT NULL con DEFAULT 100: los eventos existentes
     y las inserciones de la versión anterior reciben ese valor.
   - Los cupos disponibles NO se almacenan: se calculan como
       capacidad - inscripciones vigentes (estado 'confirmada' o 'pendiente').

   DATOS DE DEMOSTRACIÓN: las organizaciones, eventos y cuentas insertados son
   ficticios, con fines exclusivamente académicos. No representan ni implican
   relación, patrocinio ni eventos reales de las organizaciones mencionadas.
   Logos y banners apuntan a placeholders locales reemplazables.

   Haz una copia de seguridad de EventHubDB antes de ejecutar este script.
   ============================================================================= */

USE EventHubDB;
GO

/* 1. Tabla Organizaciones ---------------------------------------------------- */
IF OBJECT_ID(N'dbo.Organizaciones', N'U') IS NULL
CREATE TABLE dbo.Organizaciones (
    id_organizacion   INT IDENTITY(1,1) NOT NULL,
    slug              NVARCHAR(60)   NOT NULL,   -- usado en organizacion.html?org=slug
    nombre            NVARCHAR(100)  NOT NULL,
    descripcion_corta NVARCHAR(200)  NOT NULL,
    descripcion       NVARCHAR(2000) NOT NULL,
    correo_contacto   NVARCHAR(150)  NOT NULL,
    logo_url          NVARCHAR(500)  NULL,
    banner_url        NVARCHAR(500)  NULL,
    color_primario    CHAR(7)        NOT NULL CONSTRAINT DF_Organizaciones_primario   DEFAULT ('#6C4AE4'),
    color_secundario  CHAR(7)        NOT NULL CONSTRAINT DF_Organizaciones_secundario DEFAULT ('#FFCA58'),
    activo            BIT            NOT NULL CONSTRAINT DF_Organizaciones_activo     DEFAULT (1),
    fecha_creacion    DATETIME2(0)   NOT NULL CONSTRAINT DF_Organizaciones_creacion   DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_Organizaciones PRIMARY KEY (id_organizacion),
    CONSTRAINT UQ_Organizaciones_slug UNIQUE (slug),
    CONSTRAINT CK_Organizaciones_slug CHECK (LEN(slug) >= 2 AND slug NOT LIKE '%[^a-z0-9-]%'
                                             AND slug = LOWER(slug) COLLATE Latin1_General_CS_AS),
    CONSTRAINT CK_Organizaciones_nombre CHECK (LEN(LTRIM(RTRIM(nombre))) >= 2),
    CONSTRAINT CK_Organizaciones_correo CHECK (correo_contacto LIKE '%_@_%._%' OR correo_contacto LIKE 'https://%'),
    CONSTRAINT CK_Organizaciones_primario CHECK (
        color_primario LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
    CONSTRAINT CK_Organizaciones_secundario CHECK (
        color_secundario LIKE '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
    -- Solo URLs http(s) o rutas locales del sitio ("/img/..."), nunca "javascript:" ni "//host".
    CONSTRAINT CK_Organizaciones_logo CHECK (logo_url IS NULL OR logo_url LIKE 'https://%'
        OR logo_url LIKE 'http://%' OR (logo_url LIKE '/%' AND logo_url NOT LIKE '//%')),
    CONSTRAINT CK_Organizaciones_banner CHECK (banner_url IS NULL OR banner_url LIKE 'https://%'
        OR banner_url LIKE 'http://%' OR (banner_url LIKE '/%' AND banner_url NOT LIKE '//%'))
);
GO

/* 2. Nuevas columnas ---------------------------------------------------------- */
IF COL_LENGTH(N'dbo.Eventos', N'id_organizacion') IS NULL
    ALTER TABLE dbo.Eventos ADD id_organizacion INT NULL;
GO

IF COL_LENGTH(N'dbo.Eventos', N'capacidad') IS NULL
    ALTER TABLE dbo.Eventos ADD capacidad INT NOT NULL
        CONSTRAINT DF_Eventos_capacidad DEFAULT (100);
GO

-- Cuenta del portal -> organización que administra (NULL = cuenta sin organización).
IF COL_LENGTH(N'dbo.Administradores', N'id_organizacion') IS NULL
    ALTER TABLE dbo.Administradores ADD id_organizacion INT NULL;
GO

/* 3. Restricciones e índices -------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Eventos_capacidad')
    ALTER TABLE dbo.Eventos ADD CONSTRAINT CK_Eventos_capacidad CHECK (capacidad BETWEEN 1 AND 100000);
GO

-- Sin CASCADE: no se puede borrar una organización que todavía tiene eventos.
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Eventos_Organizaciones')
    ALTER TABLE dbo.Eventos ADD CONSTRAINT FK_Eventos_Organizaciones
        FOREIGN KEY (id_organizacion) REFERENCES dbo.Organizaciones (id_organizacion);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = N'FK_Administradores_Organizaciones')
    ALTER TABLE dbo.Administradores ADD CONSTRAINT FK_Administradores_Organizaciones
        FOREIGN KEY (id_organizacion) REFERENCES dbo.Organizaciones (id_organizacion);
GO

-- Consulta principal del micrositio: eventos activos de una organización por fecha.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Eventos_organizacion_activo')
    CREATE INDEX IX_Eventos_organizacion_activo
        ON dbo.Eventos (id_organizacion, activo, fecha_evento);
GO

-- El conteo de inscripciones vigentes por evento filtra por estado.
-- Se añade 'estado' como columna incluida al índice existente por evento.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Inscripciones_evento_estado')
    CREATE INDEX IX_Inscripciones_evento_estado ON dbo.Inscripciones (id_evento) INCLUDE (estado);
GO

-- Si la tabla ya existía con la restricción anterior solo para correo, se actualiza para aceptar enlaces oficiales https://.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_Organizaciones_correo')
    ALTER TABLE dbo.Organizaciones DROP CONSTRAINT CK_Organizaciones_correo;
GO
ALTER TABLE dbo.Organizaciones ADD CONSTRAINT CK_Organizaciones_correo
    CHECK (correo_contacto LIKE '%_@_%._%' OR correo_contacto LIKE 'https://%');
GO

/* 4. Organizaciones (información institucional verificable) ---------------- */
;WITH DatosOrg AS (
    SELECT * FROM (VALUES
      (N'red-bull', N'Red Bull',
       N'Compañía conocida por Red Bull Energy Drink y sus iniciativas globales en deportes, música, gaming y eventos.',
       N'Red Bull es una compañía de origen austriaco reconocida por Red Bull Energy Drink. A través de sus plataformas y producciones impulsa contenidos y experiencias vinculadas con deportes, atletas, música, gaming y eventos en todo el mundo.',
       N'https://www.redbull.com/pe-es/energydrink/contacto',
       N'/Imagenes/organizaciones/red-bull/logo-red-bull.svg',
       N'/Imagenes/organizaciones/red-bull/banner-red-bull.jpg',
       '#1E2A5A', '#D7193F'),
      (N'upc', N'Universidad Peruana de Ciencias Aplicadas (UPC)',
       N'Institución peruana de educación superior fundada en 1994, enfocada en excelencia académica, innovación y formación de líderes.',
       N'La Universidad Peruana de Ciencias Aplicadas (UPC) inició operaciones en 1994 con el propósito de brindar educación superior orientada a la excelencia académica, la innovación y la generación de conocimiento, formando profesionales líderes, innovadores e íntegros comprometidos con la transformación del país.',
       N'https://www.upc.edu.pe/',
       N'/Imagenes/organizaciones/upc/logo-upc.png',
       N'/Imagenes/organizaciones/upc/banner-upc.webp',
       '#C8102E', '#2B2B2B'),
      (N'spotify', N'Spotify',
       N'Servicio digital que permite descubrir y escuchar música y podcasts desde múltiples dispositivos.',
       N'Spotify es una plataforma de audio digital que conecta a oyentes y creadores, permitiendo encontrar y reproducir música, podcasts y listas personalizadas desde teléfonos, computadoras, televisores y otros dispositivos.',
       N'office@spotify.com',
       N'/Imagenes/organizaciones/spotify/logo-spotify.png',
       N'/Imagenes/organizaciones/spotify/banner-spotify.jpg',
       '#1DB954', '#191414')
    ) AS v(slug, nombre, corta, descripcion, correo, logo, banner, primario, secundario)
)
INSERT INTO dbo.Organizaciones
    (slug, nombre, descripcion_corta, descripcion, correo_contacto,
     logo_url, banner_url, color_primario, color_secundario)
SELECT v.slug, v.nombre, v.corta, v.descripcion, v.correo, v.logo, v.banner, v.primario, v.secundario
FROM DatosOrg v
WHERE NOT EXISTS (SELECT 1 FROM dbo.Organizaciones o WHERE o.slug = v.slug);
GO

-- Actualiza únicamente registros previos que aún conserven los valores placeholder iniciales.
UPDATE o
SET o.nombre = v.nombre,
    o.descripcion_corta = v.corta,
    o.descripcion = v.descripcion,
    o.correo_contacto = v.correo,
    o.logo_url = v.logo,
    o.banner_url = v.banner
FROM dbo.Organizaciones o
JOIN (VALUES
  (N'red-bull', N'Red Bull',
   N'Compañía conocida por Red Bull Energy Drink y sus iniciativas globales en deportes, música, gaming y eventos.',
   N'Red Bull es una compañía de origen austriaco reconocida por Red Bull Energy Drink. A través de sus plataformas y producciones impulsa contenidos y experiencias vinculadas con deportes, atletas, música, gaming y eventos en todo el mundo.',
   N'https://www.redbull.com/pe-es/energydrink/contacto',
   N'/Imagenes/organizaciones/red-bull/logo-red-bull.svg',
   N'/Imagenes/organizaciones/red-bull/banner-red-bull.jpg'),
  (N'upc', N'Universidad Peruana de Ciencias Aplicadas (UPC)',
   N'Institución peruana de educación superior fundada en 1994, enfocada en excelencia académica, innovación y formación de líderes.',
   N'La Universidad Peruana de Ciencias Aplicadas (UPC) inició operaciones en 1994 con el propósito de brindar educación superior orientada a la excelencia académica, la innovación y la generación de conocimiento, formando profesionales líderes, innovadores e íntegros comprometidos con la transformación del país.',
   N'https://www.upc.edu.pe/',
   N'/Imagenes/organizaciones/upc/logo-upc.png',
   N'/Imagenes/organizaciones/upc/banner-upc.webp'),
  (N'spotify', N'Spotify',
   N'Servicio digital que permite descubrir y escuchar música y podcasts desde múltiples dispositivos.',
   N'Spotify es una plataforma de audio digital que conecta a oyentes y creadores, permitiendo encontrar y reproducir música, podcasts y listas personalizadas desde teléfonos, computadoras, televisores y otros dispositivos.',
   N'office@spotify.com',
   N'/Imagenes/organizaciones/spotify/logo-spotify.png',
   N'/Imagenes/organizaciones/spotify/banner-spotify.jpg')
) AS v(slug, nombre, corta, descripcion, correo, logo, banner)
  ON o.slug = v.slug
WHERE o.correo_contacto LIKE N'%-demo.invalid';
GO

/* 5. Asociar los eventos de ejemplo del script base -------------------------- */
UPDATE e SET e.id_organizacion = o.id_organizacion
FROM dbo.Eventos e
JOIN (VALUES (N'Innovación y tecnología 2026', N'upc'),
             (N'Emprende y conecta',           N'upc'),
             (N'Festival creativo',            N'spotify')) AS m(titulo, slug)
     ON m.titulo = e.titulo
JOIN dbo.Organizaciones o ON o.slug = m.slug
WHERE e.id_organizacion IS NULL;
GO

/* 6. Eventos ficticios de demostración ---------------------------------------- */
INSERT INTO dbo.Eventos (id_organizacion, id_categoria, titulo, fecha_evento, lugar, horario, descripcion, capacidad)
SELECT o.id_organizacion, c.id_categoria, v.titulo, v.fecha, v.lugar, v.horario, v.descripcion, v.capacidad
FROM (VALUES
  (N'red-bull', N'cultural',    N'Desafío de skate urbano (demo)',      CAST('2026-12-12' AS DATE), N'Barranco',
   N'3:00 p. m. - 7:00 p. m.',
   N'Evento ficticio de demostración: exhibición y competencia amistosa de skate en un circuito urbano temporal.', 150),
  (N'red-bull', N'cultural',    N'Noche de música electrónica (demo)',  CAST('2027-01-16' AS DATE), N'Miraflores',
   N'8:00 p. m. - 12:00 a. m.',
   N'Evento ficticio de demostración: sesión de DJs emergentes con visuales en vivo.', 300),
  (N'upc',      N'academico',   N'Feria de proyectos de ingeniería (demo)', CAST('2026-12-10' AS DATE), N'Lima',
   N'9:00 a. m. - 1:00 p. m.',
   N'Evento ficticio de demostración: estudiantes presentan prototipos de software, hardware y automatización.', 200),
  (N'spotify',  N'profesional', N'Taller de producción de podcasts (demo)', CAST('2027-01-09' AS DATE), N'San Isidro',
   N'10:00 a. m. - 1:00 p. m.',
   N'Evento ficticio de demostración: guion, grabación y edición básica de un episodio de podcast.', 40),
  (N'spotify',  N'cultural',    N'Sesión acústica íntima (demo)',       CAST('2027-01-23' AS DATE), N'Barranco',
   N'7:00 p. m. - 9:00 p. m.',
   N'Evento ficticio de demostración: sesión musical acústica de aforo reducido (2 cupos) para probar el límite de capacidad desde la aplicación.', 2)
) AS v(slug, categoria, titulo, fecha, lugar, horario, descripcion, capacidad)
JOIN dbo.Organizaciones o ON o.slug = v.slug
JOIN dbo.Categorias c     ON c.slug = v.categoria
WHERE NOT EXISTS (SELECT 1 FROM dbo.Eventos e
                  WHERE e.titulo = v.titulo AND e.id_organizacion = o.id_organizacion);
GO

INSERT INTO dbo.Actividades_Evento (id_evento, descripcion_actividad, orden)
SELECT e.id_evento, v.actividad, v.orden
FROM (VALUES
  (N'Desafío de skate urbano (demo)',          N'Exhibición de trucos',             1),
  (N'Desafío de skate urbano (demo)',          N'Competencia por categorías',       2),
  (N'Noche de música electrónica (demo)',      N'Sets de DJs emergentes',           1),
  (N'Noche de música electrónica (demo)',      N'Visuales en vivo',                 2),
  (N'Feria de proyectos de ingeniería (demo)', N'Exposición de prototipos',         1),
  (N'Feria de proyectos de ingeniería (demo)', N'Premiación de proyectos',          2),
  (N'Taller de producción de podcasts (demo)', N'Escritura de guion',               1),
  (N'Taller de producción de podcasts (demo)', N'Grabación y edición',              2),
  (N'Sesión acústica íntima (demo)',           N'Presentación acústica',            1)
) AS v(titulo, actividad, orden)
JOIN dbo.Eventos e ON e.titulo = v.titulo
WHERE NOT EXISTS (SELECT 1 FROM dbo.Actividades_Evento a
                  WHERE a.id_evento = e.id_evento AND a.orden = v.orden);
GO

/* 7. Eventos previos sin organización ----------------------------------------
   Si existían otros eventos creados con la versión anterior, se conservan y se
   asignan a una organización oculta (activo = 0) para no perderlos ni
   atribuirlos a una organización de demostración. */
IF EXISTS (SELECT 1 FROM dbo.Eventos WHERE id_organizacion IS NULL)
   AND NOT EXISTS (SELECT 1 FROM dbo.Organizaciones WHERE slug = N'eventos-anteriores')
    INSERT INTO dbo.Organizaciones (slug, nombre, descripcion_corta, descripcion, correo_contacto, activo)
    VALUES (N'eventos-anteriores', N'Eventos anteriores',
            N'Eventos creados antes de la versión con organizaciones.',
            N'Organización interna y oculta que agrupa los eventos existentes antes de la migración. Reasígnalos o actívala si corresponde.',
            N'contacto@eventhub.invalid', 0);
GO

UPDATE dbo.Eventos
SET id_organizacion = (SELECT id_organizacion FROM dbo.Organizaciones WHERE slug = N'eventos-anteriores')
WHERE id_organizacion IS NULL
  AND EXISTS (SELECT 1 FROM dbo.Organizaciones WHERE slug = N'eventos-anteriores');
GO

-- La cuenta 'admin' original (si no tiene organización) administra esos eventos previos.
UPDATE dbo.Administradores
SET id_organizacion = (SELECT id_organizacion FROM dbo.Organizaciones WHERE slug = N'eventos-anteriores')
WHERE usuario = N'admin' AND id_organizacion IS NULL
  AND EXISTS (SELECT 1 FROM dbo.Organizaciones WHERE slug = N'eventos-anteriores');
GO

/* 8. Cuentas de demostración del portal ---------------------------------------
   Contraseña de las tres cuentas: EventHubDemo2026
   SOLO para la demostración. Cámbiala (ver README) antes de exponer el sitio. */
INSERT INTO dbo.Administradores (usuario, password_hash, nombre_admin, id_organizacion)
SELECT v.usuario, v.hash, v.nombre, o.id_organizacion
FROM (VALUES
  (N'redbull.demo', N'scrypt$a39ee282a10e693b5077dd30982b298f$62eac2bd196c9bd0fc3e915e27208143bb5f1cf4be5304ebbcc431c1f406a0644c5bf16f55fb1578749a850c889430d8be970742a78b5353c07dfa1de472d29d',
   N'Equipo Red Bull (demo)', N'red-bull'),
  (N'upc.demo',     N'scrypt$3dd95a3f3ea415bee2e7526415aefa46$9ea335b71e5cf9ce76a6b72df027320cf22f92bff5c5b65c30cabb114e9da577117557ea4481764cd9c38508268855939b72a3054bf793d5b0d35059694bb511',
   N'Equipo UPC (demo)', N'upc'),
  (N'spotify.demo', N'scrypt$4890b915540f0a076f7cd0005485c0d9$ec8784a0e8d0a83aaaaeb9f2f1d6856a61996d17088241d26b29a096b9464d37a479a3c9a584ca5f7c55eb35a7720d18897b0f951d35ea6079396732795fdc9b',
   N'Equipo Spotify (demo)', N'spotify')
) AS v(usuario, hash, nombre, slug)
JOIN dbo.Organizaciones o ON o.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM dbo.Administradores a WHERE a.usuario = v.usuario);
GO

/* 9. Verificación ------------------------------------------------------------- */
SELECT o.slug, o.nombre, o.activo, COUNT(e.id_evento) AS total_eventos
FROM dbo.Organizaciones o
LEFT JOIN dbo.Eventos e ON e.id_organizacion = o.id_organizacion
GROUP BY o.slug, o.nombre, o.activo
ORDER BY o.nombre;

SELECT e.id_evento, o.slug AS organizacion, e.titulo, e.capacidad,
       COUNT(i.id_inscripcion) AS inscritos_vigentes,
       e.capacidad - COUNT(i.id_inscripcion) AS cupos_disponibles
FROM dbo.Eventos e
LEFT JOIN dbo.Organizaciones o ON o.id_organizacion = e.id_organizacion
LEFT JOIN dbo.Inscripciones i  ON i.id_evento = e.id_evento AND i.estado IN (N'confirmada', N'pendiente')
GROUP BY e.id_evento, o.slug, e.titulo, e.capacidad
ORDER BY o.slug, e.id_evento;

SELECT a.usuario, a.nombre_admin, o.slug AS organizacion
FROM dbo.Administradores a
LEFT JOIN dbo.Organizaciones o ON o.id_organizacion = a.id_organizacion;
GO
