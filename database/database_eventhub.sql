
IF NOT EXISTS (SELECT 1 FROM sys.databases WHERE name = N'EventHubDB')
BEGIN
    CREATE DATABASE EventHubDB;
END
GO

USE EventHubDB;
GO


IF OBJECT_ID(N'dbo.Categorias', N'U') IS NULL
CREATE TABLE dbo.Categorias (
    id_categoria INT IDENTITY(1,1) NOT NULL,
    slug         NVARCHAR(30)  NOT NULL,   -- valor de data-category / data-filter
    nombre       NVARCHAR(50)  NOT NULL,   -- texto visible en .event-category
    CONSTRAINT PK_Categorias      PRIMARY KEY (id_categoria),
    CONSTRAINT UQ_Categorias_slug UNIQUE (slug),
    CONSTRAINT CK_Categorias_slug CHECK (slug = LOWER(slug) AND LEN(slug) >= 3)
);
GO


IF OBJECT_ID(N'dbo.Eventos', N'U') IS NULL
CREATE TABLE dbo.Eventos (
    id_evento      INT IDENTITY(1,1) NOT NULL,
    id_categoria   INT            NOT NULL,
    titulo         NVARCHAR(150)  NOT NULL,
    fecha_evento   DATE           NOT NULL,
    lugar          NVARCHAR(100)  NOT NULL,
    horario        NVARCHAR(50)   NOT NULL,   -- ej. '9:00 a. m. - 5:00 p. m.'
    descripcion    NVARCHAR(1000) NOT NULL,
    activo         BIT            NOT NULL CONSTRAINT DF_Eventos_activo DEFAULT (1),
    fecha_creacion DATETIME2(0)   NOT NULL CONSTRAINT DF_Eventos_creacion DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_Eventos PRIMARY KEY (id_evento),
    -- Sin CASCADE: no se puede borrar una categoría que aún tiene eventos.
    CONSTRAINT FK_Eventos_Categorias FOREIGN KEY (id_categoria)
        REFERENCES dbo.Categorias (id_categoria),
    CONSTRAINT CK_Eventos_titulo CHECK (LEN(LTRIM(RTRIM(titulo))) >= 3)
);
GO


IF OBJECT_ID(N'dbo.Actividades_Evento', N'U') IS NULL
CREATE TABLE dbo.Actividades_Evento (
    id_actividad          INT IDENTITY(1,1) NOT NULL,
    id_evento             INT           NOT NULL,
    descripcion_actividad NVARCHAR(200) NOT NULL,
    orden                 INT           NOT NULL CONSTRAINT DF_Actividades_orden DEFAULT (1),
    CONSTRAINT PK_Actividades_Evento PRIMARY KEY (id_actividad),
    CONSTRAINT FK_Actividades_Eventos FOREIGN KEY (id_evento)
        REFERENCES dbo.Eventos (id_evento) ON DELETE CASCADE,
    CONSTRAINT UQ_Actividades_evento_orden UNIQUE (id_evento, orden),
    CONSTRAINT CK_Actividades_orden CHECK (orden > 0)
);
GO


IF OBJECT_ID(N'dbo.Participantes', N'U') IS NULL
CREATE TABLE dbo.Participantes (
    id_participante INT IDENTITY(1,1) NOT NULL,
    nombre_completo NVARCHAR(100) NOT NULL,
    correo          NVARCHAR(150) NOT NULL,
    fecha_registro  DATETIME2(0)  NOT NULL CONSTRAINT DF_Participantes_registro DEFAULT (SYSDATETIME()),
    CONSTRAINT PK_Participantes PRIMARY KEY (id_participante),
    CONSTRAINT UQ_Participantes_correo UNIQUE (correo),
    CONSTRAINT CK_Participantes_nombre CHECK (LEN(LTRIM(RTRIM(nombre_completo))) >= 3),
    CONSTRAINT CK_Participantes_correo CHECK (correo LIKE '%_@_%._%')
);
GO


IF OBJECT_ID(N'dbo.Inscripciones', N'U') IS NULL
CREATE TABLE dbo.Inscripciones (
    id_inscripcion    INT IDENTITY(1,1) NOT NULL,
    id_participante   INT          NOT NULL,
    id_evento         INT          NOT NULL,
    fecha_inscripcion DATETIME2(0) NOT NULL CONSTRAINT DF_Inscripciones_fecha DEFAULT (SYSDATETIME()),
    estado            NVARCHAR(20) NOT NULL CONSTRAINT DF_Inscripciones_estado DEFAULT (N'confirmada'),
    CONSTRAINT PK_Inscripciones PRIMARY KEY (id_inscripcion),
    CONSTRAINT FK_Inscripciones_Participantes FOREIGN KEY (id_participante)
        REFERENCES dbo.Participantes (id_participante) ON DELETE CASCADE,
    CONSTRAINT FK_Inscripciones_Eventos FOREIGN KEY (id_evento)
        REFERENCES dbo.Eventos (id_evento) ON DELETE CASCADE,
    -- Impide que la misma persona se inscriba dos veces al mismo evento
    CONSTRAINT UQ_Inscripciones_participante_evento UNIQUE (id_participante, id_evento),
    CONSTRAINT CK_Inscripciones_estado CHECK (estado IN (N'confirmada', N'pendiente', N'cancelada'))
);
GO


IF OBJECT_ID(N'dbo.Administradores', N'U') IS NULL
CREATE TABLE dbo.Administradores (
    id_admin      INT IDENTITY(1,1) NOT NULL,
    usuario       NVARCHAR(50)  NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    nombre_admin  NVARCHAR(100) NOT NULL,
    CONSTRAINT PK_Administradores PRIMARY KEY (id_admin),
    CONSTRAINT UQ_Administradores_usuario UNIQUE (usuario)
);
GO


IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Eventos_categoria_activo')
    CREATE INDEX IX_Eventos_categoria_activo ON dbo.Eventos (id_categoria, activo);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Inscripciones_evento')
    CREATE INDEX IX_Inscripciones_evento ON dbo.Inscripciones (id_evento);
GO


INSERT INTO dbo.Categorias (slug, nombre)
SELECT v.slug, v.nombre
FROM (VALUES (N'academico',   N'Académico'),
             (N'cultural',    N'Cultural'),
             (N'profesional', N'Profesional')) AS v(slug, nombre)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Categorias c WHERE c.slug = v.slug);
GO


INSERT INTO dbo.Eventos (id_categoria, titulo, fecha_evento, lugar, horario, descripcion)
SELECT c.id_categoria, v.titulo, v.fecha, v.lugar, v.horario, v.descripcion
FROM (VALUES
  (N'academico',   N'Innovación y tecnología 2026', CAST('2026-12-15' AS DATE), N'Lima',
   N'9:00 a. m. - 5:00 p. m.',
   N'Un encuentro dedicado a conocer nuevas tecnologías, innovación digital y tendencias que transforman nuestro entorno.'),
  (N'cultural',    N'Festival creativo',            CAST('2026-12-18' AS DATE), N'Miraflores',
   N'2:00 p. m. - 8:00 p. m.',
   N'Un espacio para descubrir el arte, la creatividad y las diferentes expresiones culturales.'),
  (N'profesional', N'Emprende y conecta',           CAST('2026-12-21' AS DATE), N'San Isidro',
   N'10:00 a. m. - 4:00 p. m.',
   N'Una oportunidad para conocer ideas de negocio, compartir experiencias y conectar con otros emprendedores.')
) AS v(slug, titulo, fecha, lugar, horario, descripcion)
JOIN dbo.Categorias c ON c.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM dbo.Eventos e WHERE e.titulo = v.titulo);
GO


INSERT INTO dbo.Actividades_Evento (id_evento, descripcion_actividad, orden)
SELECT e.id_evento, v.actividad, v.orden
FROM (VALUES
  (N'Innovación y tecnología 2026', N'Charlas sobre innovación tecnológica',   1),
  (N'Innovación y tecnología 2026', N'Exposiciones de proyectos digitales',    2),
  (N'Innovación y tecnología 2026', N'Espacios de intercambio de ideas',       3),
  (N'Festival creativo',            N'Exposiciones artísticas',                1),
  (N'Festival creativo',            N'Presentaciones culturales',              2),
  (N'Festival creativo',            N'Talleres creativos',                     3),
  (N'Emprende y conecta',           N'Charlas de emprendimiento',              1),
  (N'Emprende y conecta',           N'Presentación de proyectos',              2),
  (N'Emprende y conecta',           N'Espacios para establecer contactos',     3)
) AS v(titulo, actividad, orden)
JOIN dbo.Eventos e ON e.titulo = v.titulo
WHERE NOT EXISTS (SELECT 1 FROM dbo.Actividades_Evento a
                  WHERE a.id_evento = e.id_evento AND a.orden = v.orden);
GO


IF NOT EXISTS (SELECT 1 FROM dbo.Administradores WHERE usuario = N'admin')
INSERT INTO dbo.Administradores (usuario, password_hash, nombre_admin)
VALUES (N'admin',
        N'scrypt$1c6e815a95f943f00a1265d1fe3b0e3d$181fe776036ef21bdf74d053923a681e5f584ac7f471827fb48b5594af6268afa7c29dedca4f0274cd4a71180f5cf1cabbcaca9e486989249dff8d7211f92c2d',
        N'Administrador EventHub');
GO


SELECT e.id_evento, c.slug, c.nombre AS categoria, e.titulo,
       e.fecha_evento, e.lugar, e.horario, e.activo
FROM dbo.Eventos e
INNER JOIN dbo.Categorias c ON c.id_categoria = e.id_categoria
ORDER BY e.fecha_evento;

SELECT e.titulo, a.orden, a.descripcion_actividad
FROM dbo.Eventos e
INNER JOIN dbo.Actividades_Evento a ON a.id_evento = e.id_evento
ORDER BY e.id_evento, a.orden;

SELECT e.titulo, COUNT(a.id_actividad) AS total_actividades
FROM dbo.Eventos e
LEFT JOIN dbo.Actividades_Evento a ON a.id_evento = e.id_evento
GROUP BY e.titulo;

SELECT id_admin, usuario, nombre_admin, LEFT(password_hash, 12) + N'...' AS hash_parcial
FROM dbo.Administradores;
GO
