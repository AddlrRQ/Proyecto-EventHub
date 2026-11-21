/* =============================================================================
   EventHub v1.0 - Migración 002: Ampliación del catálogo de organizaciones
   -----------------------------------------------------------------------------
   Requisito: haber ejecutado antes database/database_eventhub.sql y
   database/migraciones/001_organizaciones.sql.

   - Idempotente: puede ejecutarse varias veces sin duplicar filas.
   - Agrega 12 organizaciones con información institucional verificable y
     activos visuales locales bajo /Imagenes/organizaciones/<slug>/.
   - Agrega 2 eventos ficticios de demostración académica por organización
     (con sus actividades) y las cuentas del Portal correspondientes.
   - Mantiene 0 participantes y 0 inscripciones precargadas.
   ============================================================================= */

USE EventHubDB;
GO

/* 1. Nuevas organizaciones (información institucional verificable) ----------- */
INSERT INTO dbo.Organizaciones
    (slug, nombre, descripcion_corta, descripcion, correo_contacto,
     logo_url, banner_url, color_primario, color_secundario)
SELECT v.slug, v.nombre, v.corta, v.descripcion, v.correo, v.logo, v.banner, v.primario, v.secundario
FROM (VALUES
  (N'microsoft', N'Microsoft',
   N'Compañía tecnológica enfocada en computación en la nube, inteligencia artificial y productividad digital.',
   N'Microsoft desarrolla plataformas y herramientas tecnológicas con la misión de empoderar a cada persona y organización del planeta para lograr más, impulsando soluciones en la nube, inteligencia artificial y colaboración digital.',
   N'https://www.microsoft.com/en-us/concern/contactus',
   N'/Imagenes/organizaciones/microsoft/logo-microsoft.svg',
   N'/Imagenes/organizaciones/microsoft/banner-microsoft.jpg',
   '#0078D4', '#0F172A'),

  (N'samsung', N'Samsung',
   N'Empresa tecnológica global dedicada a dispositivos inteligentes, pantallas, semiconductores e innovación.',
   N'Samsung Electronics impulsa investigación y desarrollo en electrónica de consumo, dispositivos móviles, pantallas avanzadas, redes e inteligencia artificial aplicada a la vida cotidiana.',
   N'https://www.samsung.com/pe/support/',
   N'/Imagenes/organizaciones/samsung/logo-samsung.png',
   N'/Imagenes/organizaciones/samsung/banner-samsung.jpg',
   '#1428A0', '#0B132B'),

  (N'playstation', N'PlayStation',
   N'Marca de entretenimiento interactivo y consolas de videojuegos de Sony Interactive Entertainment.',
   N'PlayStation reúne consolas, servicios digitales y experiencias de entretenimiento interactivo diseñadas para conectar comunidades de jugadores y creadores alrededor del mundo.',
   N'https://www.playstation.com/support/',
   N'/Imagenes/organizaciones/playstation/logo-playstation.svg',
   N'/Imagenes/organizaciones/playstation/banner-playstation.jpg',
   '#003791', '#0070CC'),

  (N'riot-games', N'Riot Games',
   N'Estudio desarrollador de videojuegos competitivos y organizador de ligas globales de esports.',
   N'Riot Games desarrolla y opera títulos competitivos como League of Legends, VALORANT y Teamfight Tactics, además de competencias internacionales de esports orientadas a la comunidad gamer.',
   N'https://support.riotgames.com/',
   N'/Imagenes/organizaciones/riot-games/logo-riot-games.svg',
   N'/Imagenes/organizaciones/riot-games/banner-riot-games.jpg',
   '#D13639', '#111111'),

  (N'pucp', N'Pontificia Universidad Católica del Perú (PUCP)',
   N'Universidad peruana fundada en 1917, enfocada en formación integral, investigación y creación.',
   N'La Pontificia Universidad Católica del Perú (PUCP), fundada en 1917, promueve la formación interdisciplinaria de pregrado y posgrado, así como la investigación científica, tecnológica y humanística al servicio de la sociedad.',
   N'https://www.pucp.edu.pe/contacto/',
   N'/Imagenes/organizaciones/pucp/logo-pucp.svg',
   N'/Imagenes/organizaciones/pucp/banner-pucp.jpg',
   '#042354', '#1E3A8A'),

  (N'utec', N'Universidad de Ingeniería y Tecnología (UTEC)',
   N'Universidad peruana enfocada en ingeniería, tecnología, investigación aplicada y emprendimiento.',
   N'La Universidad de Ingeniería y Tecnología (UTEC) forma profesionales en ingeniería y tecnología mediante metodologías activas, laboratorios especializados e investigación aplicada orientada a resolver desafíos reales.',
   N'informes@utec.edu.pe',
   N'/Imagenes/organizaciones/utec/logo-utec.svg',
   N'/Imagenes/organizaciones/utec/banner-utec.jpg',
   '#00A3E0', '#1B2A4A'),

  (N'falabella', N'Falabella',
   N'Ecosistema de retail omnicanal en moda, tecnología, hogar y programas de sostenibilidad.',
   N'Falabella Perú opera tiendas físicas y plataforma digital en categorías de moda, tecnología y hogar, impulsando atención omnicanal e iniciativas corporativas de sostenibilidad y economía circular.',
   N'https://www.falabella.com.pe/falabella-peru/page/canales-de-contacto',
   N'/Imagenes/organizaciones/falabella/logo-falabella.png',
   N'/Imagenes/organizaciones/falabella/banner-falabella.jpg',
   '#78A22F', '#222222'),

  (N'plaza-vea', N'plazaVea',
   N'Cadena peruana de supermercados e hipermercados perteneciente a Supermercados Peruanos S.A.',
   N'plazaVea forma parte de Supermercados Peruanos S.A. (SPSA), enfocada en acercar productos de consumo, alimentos frescos y equipamiento para el hogar a las familias peruanas en todo el país.',
   N'servicioalcliente@spsa.pe',
   N'/Imagenes/organizaciones/plaza-vea/logo-plaza-vea.svg',
   N'/Imagenes/organizaciones/plaza-vea/banner-plaza-vea.jpg',
   '#E30613', '#FFD100'),

  (N'bcp', N'Banco de Crédito del Perú (BCP)',
   N'Institución financiera peruana fundada en 1889 que impulsa servicios bancarios y educación financiera.',
   N'El Banco de Crédito del Perú (BCP), fundado en 1889 e integrante de Credicorp, ofrece servicios financieros para personas y empresas y promueve la inclusión y educación financiera mediante iniciativas como el ABC del BCP.',
   N'https://www.viabcp.com/',
   N'/Imagenes/organizaciones/bcp/logo-bcp.svg',
   N'/Imagenes/organizaciones/bcp/banner-bcp.jpg',
   '#002A8D', '#FF7800'),

  (N'yape', N'Yape',
   N'Aplicación peruana de pagos digitales e inclusión financiera vinculada al BCP.',
   N'Yape facilita pagos digitales cotidianos mediante teléfono móvil y promueve la digitalización de comercios, emprendedores y educación financiera accesible en todo el Perú.',
   N'https://www.yape.com.pe/',
   N'/Imagenes/organizaciones/yape/logo-yape.png',
   N'/Imagenes/organizaciones/yape/banner-yape.jpg',
   '#742284', '#00D2B8'),

  (N'nike', N'Nike',
   N'Compañía global enfocada en calzado, indumentaria, innovación deportiva y comunidad atlética.',
   N'Nike diseña equipamiento deportivo e innovaciones orientadas a inspirar a atletas de todos los niveles, combinando ciencia del deporte, diseño y programas comunitarios de actividad física.',
   N'https://www.nike.com/help',
   N'/Imagenes/organizaciones/nike/logo-nike.svg',
   N'/Imagenes/organizaciones/nike/banner-nike.svg',
   '#111111', '#4B5563'),

  (N'marca-peru', N'Marca Perú',
   N'Iniciativa país gestionada por PROMPERÚ para promover cultura, turismo, gastronomía e identidad.',
   N'La Marca Perú, administrada por PROMPERÚ, articula la promoción internacional y nacional de los destinos turísticos, la gastronomía, el talento creativo y los productos emblemáticos del Perú.',
   N'mesadepartes@promperu.gob.pe',
   N'/Imagenes/organizaciones/marca-peru/logo-marca-peru.png',
   N'/Imagenes/organizaciones/marca-peru/banner-marca-peru.jpg',
   '#D91023', '#8B1E24')
) AS v(slug, nombre, corta, descripcion, correo, logo, banner, primario, secundario)
WHERE NOT EXISTS (SELECT 1 FROM dbo.Organizaciones o WHERE o.slug = v.slug);
GO

/* 2. Eventos ficticios de demostración académica --------------------------- */
INSERT INTO dbo.Eventos (id_organizacion, id_categoria, titulo, fecha_evento, lugar, horario, descripcion, capacidad)
SELECT o.id_organizacion, c.id_categoria, v.titulo, v.fecha, v.lugar, v.horario, v.descripcion, v.capacidad
FROM (VALUES
  -- Microsoft
  (N'microsoft', N'profesional', N'Taller práctico de arquitectura en la nube (demo)', CAST('2027-02-06' AS DATE), N'San Isidro',
   N'9:30 a. m. - 1:00 p. m.',
   N'Evento ficticio de demostración académica: introducción práctica al despliegue de aplicaciones web escalables y servicios en la nube.', 80),
  (N'microsoft', N'academico', N'Encuentro de inteligencia artificial aplicada (demo)', CAST('2027-02-20' AS DATE), N'Lima',
   N'4:00 p. m. - 7:30 p. m.',
   N'Evento ficticio de demostración académica: demostraciones sobre asistentes inteligentes, automatización y buenas prácticas de desarrollo.', 120),

  -- Samsung
  (N'samsung', N'profesional', N'Laboratorio de innovación en dispositivos conectados (demo)', CAST('2027-02-11' AS DATE), N'Miraflores',
   N'10:00 a. m. - 1:30 p. m.',
   N'Evento ficticio de demostración académica: recorrido conceptual por ecosistemas conectados, pantallas inteligentes y experiencia de usuario.', 60),
  (N'samsung', N'academico', N'Charla sobre diseño de software y hardware móvil (demo)', CAST('2027-02-25' AS DATE), N'San Borja',
   N'5:00 p. m. - 8:00 p. m.',
   N'Evento ficticio de demostración académica: conversación sobre optimización energética, interfaz móvil y tendencias tecnológicas.', 90),

  -- PlayStation
  (N'playstation', N'cultural', N'Jornada comunitaria de juegos de consola (demo)', CAST('2027-02-14' AS DATE), N'Surco',
   N'2:00 p. m. - 8:00 p. m.',
   N'Evento ficticio de demostración académica: espacio abierto para probar experiencias cooperativas y compartir en comunidad.', 100),
  (N'playstation', N'profesional', N'Conversatorio sobre desarrollo creativo de videojuegos (demo)', CAST('2027-03-04' AS DATE), N'Barranco',
   N'6:00 p. m. - 8:30 p. m.',
   N'Evento ficticio de demostración académica: narrativa interactiva, diseño de niveles y audio espacial para videojuegos.', 70),

  -- Riot Games
  (N'riot-games', N'cultural', N'Copa universitaria amistosa de esports (demo)', CAST('2027-02-18' AS DATE), N'San Miguel',
   N'1:00 p. m. - 7:00 p. m.',
   N'Evento ficticio de demostración académica: torneo recreativo por equipos con transmisión interna y espacios de comunidad.', 64),
  (N'riot-games', N'profesional', N'Charla de producción de torneos y diseño competitivo (demo)', CAST('2027-03-08' AS DATE), N'Miraflores',
   N'4:00 p. m. - 6:30 p. m.',
   N'Evento ficticio de demostración académica: organización de competencias digitales, balance de juego y trabajo en equipo.', 50),

  -- PUCP
  (N'pucp', N'academico', N'Coloquio interdisciplinario de investigación estudiantil (demo)', CAST('2027-02-12' AS DATE), N'San Miguel',
   N'9:00 a. m. - 1:00 p. m.',
   N'Evento ficticio de demostración académica: presentación de proyectos de investigación en ciencias, ingeniería y humanidades.', 150),
  (N'pucp', N'cultural', N'Festival cultural universitario en campus (demo)', CAST('2027-03-01' AS DATE), N'San Miguel',
   N'3:00 p. m. - 8:00 p. m.',
   N'Evento ficticio de demostración académica: muestras artísticas, música estudiantil y talleres abiertos a la comunidad.', 250),

  -- UTEC
  (N'utec', N'academico', N'Hackathon de ingeniería e innovación aplicada (demo)', CAST('2027-02-19' AS DATE), N'Barranco',
   N'8:30 a. m. - 6:00 p. m.',
   N'Evento ficticio de demostración académica: equipos multidisciplinarios diseñan prototipos tecnológicos para retos urbanos.', 120),
  (N'utec', N'profesional', N'Seminario de robótica y automatización industrial (demo)', CAST('2027-03-06' AS DATE), N'Barranco',
   N'10:00 a. m. - 1:00 p. m.',
   N'Evento ficticio de demostración académica: demostraciones de laboratorio sobre sensores, control y sistemas embebidos.', 80),

  -- Falabella
  (N'falabella', N'profesional', N'Encuentro de experiencia de cliente y comercio omnicanal (demo)', CAST('2027-02-22' AS DATE), N'San Isidro',
   N'9:30 a. m. - 12:30 p. m.',
   N'Evento ficticio de demostración académica: análisis de tendencias en retail digital, logística y diseño de experiencias de compra.', 90),
  (N'falabella', N'cultural', N'Taller de economía circular y moda consciente (demo)', CAST('2027-03-10' AS DATE), N'Miraflores',
   N'4:00 p. m. - 6:30 p. m.',
   N'Evento ficticio de demostración académica: charla práctica sobre reutilización textil, cuidado de prendas y sostenibilidad.', 45),

  -- plazaVea
  (N'plaza-vea', N'profesional', N'Charla de innovación en cadena de suministro retail (demo)', CAST('2027-02-24' AS DATE), N'San Borja',
   N'10:00 a. m. - 12:30 p. m.',
   N'Evento ficticio de demostración académica: gestión de productos frescos, calidad alimentaria y abastecimiento eficiente.', 70),
  (N'plaza-vea', N'cultural', N'Jornada familiar de alimentación saludable (demo)', CAST('2027-03-12' AS DATE), N'Surco',
   N'10:00 a. m. - 2:00 p. m.',
   N'Evento ficticio de demostración académica: actividades prácticas sobre planificación de compras y cocina cotidiana.', 110),

  -- BCP
  (N'bcp', N'academico', N'Taller práctico de finanzas personales y ahorro (demo)', CAST('2027-02-15' AS DATE), N'La Molina',
   N'5:00 p. m. - 7:30 p. m.',
   N'Evento ficticio de demostración académica: presupuesto personal, metas de ahorro y uso responsable de herramientas financieras.', 100),
  (N'bcp', N'profesional', N'Foro de transformación digital en servicios financieros (demo)', CAST('2027-03-05' AS DATE), N'San Isidro',
   N'9:00 a. m. - 12:30 p. m.',
   N'Evento ficticio de demostración académica: ciberseguridad, arquitectura digital y diseño centrado en las personas.', 130),

  -- Yape
  (N'yape', N'profesional', N'Taller de pagos digitales para emprendedores (demo)', CAST('2027-02-21' AS DATE), N'Lima',
   N'3:00 p. m. - 6:00 p. m.',
   N'Evento ficticio de demostración académica: herramientas digitales para gestionar cobros, orden financiero y crecimiento de negocios.', 85),
  (N'yape', N'academico', N'Charla sobre inclusión financiera y productos móviles (demo)', CAST('2027-03-11' AS DATE), N'Miraflores',
   N'6:00 p. m. - 8:00 p. m.',
   N'Evento ficticio de demostración académica: cómo las aplicaciones móviles simplifican operaciones financieras diarias.', 75),

  -- Nike
  (N'nike', N'cultural', N'Entrenamiento comunitario de running urbano (demo)', CAST('2027-02-27' AS DATE), N'Miraflores',
   N'7:00 a. m. - 9:30 a. m.',
   N'Evento ficticio de demostración académica: sesión grupal de calentamiento, trote guiado por niveles y estiramiento.', 140),
  (N'nike', N'profesional', N'Charla de preparación física y prevención deportiva (demo)', CAST('2027-03-14' AS DATE), N'San Isidro',
   N'10:00 a. m. - 12:00 p. m.',
   N'Evento ficticio de demostración académica: hábitos de entrenamiento, descanso y constancia para deportistas amateurs.', 60),

  -- Marca Perú
  (N'marca-peru', N'cultural', N'Muestra de gastronomía regional y productos oriundos (demo)', CAST('2027-02-28' AS DATE), N'Barranco',
   N'11:00 a. m. - 5:00 p. m.',
   N'Evento ficticio de demostración académica: recorrido temático por ingredientes peruanos, tradición culinaria e identidad cultural.', 180),
  (N'marca-peru', N'academico', N'Encuentro de turismo sostenible e identidad nacional (demo)', CAST('2027-03-16' AS DATE), N'San Isidro',
   N'4:00 p. m. - 7:00 p. m.',
   N'Evento ficticio de demostración académica: diálogo sobre destinos regionales, cultura viva y promoción responsable del país.', 120)
) AS v(slug, categoria, titulo, fecha, lugar, horario, descripcion, capacidad)
JOIN dbo.Organizaciones o ON o.slug = v.slug
JOIN dbo.Categorias c     ON c.slug = v.categoria
WHERE NOT EXISTS (SELECT 1 FROM dbo.Eventos e
                  WHERE e.titulo = v.titulo AND e.id_organizacion = o.id_organizacion);
GO

/* 3. Actividades de los eventos ficticios ---------------------------------- */
INSERT INTO dbo.Actividades_Evento (id_evento, descripcion_actividad, orden)
SELECT e.id_evento, v.actividad, v.orden
FROM (VALUES
  (N'Taller práctico de arquitectura en la nube (demo)',             N'Laboratorio de despliegue web',          1),
  (N'Taller práctico de arquitectura en la nube (demo)',             N'Sesión de preguntas técnicas',           2),
  (N'Encuentro de inteligencia artificial aplicada (demo)',          N'Demostración de asistentes digitales',   1),
  (N'Encuentro de inteligencia artificial aplicada (demo)',          N'Panel de buenas prácticas',              2),
  (N'Laboratorio de innovación en dispositivos conectados (demo)',   N'Exhibición de ecosistema conectado',     1),
  (N'Laboratorio de innovación en dispositivos conectados (demo)',   N'Prueba guiada de funciones',             2),
  (N'Charla sobre diseño de software y hardware móvil (demo)',       N'Ponencia de arquitectura móvil',         1),
  (N'Charla sobre diseño de software y hardware móvil (demo)',       N'Ronda de consultas',                     2),
  (N'Jornada comunitaria de juegos de consola (demo)',               N'Estaciones de juego libre',              1),
  (N'Jornada comunitaria de juegos de consola (demo)',               N'Mini reto cooperativo',                  2),
  (N'Conversatorio sobre desarrollo creativo de videojuegos (demo)', N'Charla de diseño de niveles',            1),
  (N'Conversatorio sobre desarrollo creativo de videojuegos (demo)', N'Análisis de narrativa',                  2),
  (N'Copa universitaria amistosa de esports (demo)',                 N'Rondas clasificatorias',                 1),
  (N'Copa universitaria amistosa de esports (demo)',                 N'Partida final amistosa',                 2),
  (N'Charla de producción de torneos y diseño competitivo (demo)',   N'Organización de competencias',           1),
  (N'Charla de producción de torneos y diseño competitivo (demo)',   N'Conversatorio con organizadores',        2),
  (N'Coloquio interdisciplinario de investigación estudiantil (demo)', N'Exposición de pósteres académicos',    1),
  (N'Coloquio interdisciplinario de investigación estudiantil (demo)', N'Mesas de diálogo interdisciplinario',  2),
  (N'Festival cultural universitario en campus (demo)',              N'Presentaciones musicales',               1),
  (N'Festival cultural universitario en campus (demo)',              N'Talleres abiertos de arte',              2),
  (N'Hackathon de ingeniería e innovación aplicada (demo)',          N'Conformación de equipos y reto',         1),
  (N'Hackathon de ingeniería e innovación aplicada (demo)',          N'Presentación de prototipos',             2),
  (N'Seminario de robótica y automatización industrial (demo)',      N'Demostración en laboratorio',            1),
  (N'Seminario de robótica y automatización industrial (demo)',      N'Charla de sistemas embebidos',           2),
  (N'Encuentro de experiencia de cliente y comercio omnicanal (demo)', N'Casos de logística digital',           1),
  (N'Encuentro de experiencia de cliente y comercio omnicanal (demo)', N'Taller de experiencia de compra',      2),
  (N'Taller de economía circular y moda consciente (demo)',          N'Charla sobre reutilización textil',      1),
  (N'Taller de economía circular y moda consciente (demo)',          N'Guía práctica de cuidado',               2),
  (N'Charla de innovación en cadena de suministro retail (demo)',    N'Gestión de alimentos frescos',           1),
  (N'Charla de innovación en cadena de suministro retail (demo)',    N'Control de calidad en tienda',           2),
  (N'Jornada familiar de alimentación saludable (demo)',             N'Taller de planificación semanal',        1),
  (N'Jornada familiar de alimentación saludable (demo)',             N'Actividades participativas',             2),
  (N'Taller práctico de finanzas personales y ahorro (demo)',        N'Dinámica de presupuesto personal',       1),
  (N'Taller práctico de finanzas personales y ahorro (demo)',        N'Consejos de ahorro',                     2),
  (N'Foro de transformación digital en servicios financieros (demo)', N'Charla de diseño de productos',         1),
  (N'Foro de transformación digital en servicios financieros (demo)', N'Panel de seguridad digital',            2),
  (N'Taller de pagos digitales para emprendedores (demo)',           N'Uso práctico en comercios',              1),
  (N'Taller de pagos digitales para emprendedores (demo)',           N'Orden de ingresos diarios',              2),
  (N'Charla sobre inclusión financiera y productos móviles (demo)',  N'Experiencias de digitalización',         1),
  (N'Charla sobre inclusión financiera y productos móviles (demo)',  N'Espacio de preguntas',                   2),
  (N'Entrenamiento comunitario de running urbano (demo)',            N'Calentamiento guiado',                   1),
  (N'Entrenamiento comunitario de running urbano (demo)',            N'Ruta grupal por niveles',                2),
  (N'Charla de preparación física y prevención deportiva (demo)',    N'Rutinas de movilidad',                   1),
  (N'Charla de preparación física y prevención deportiva (demo)',    N'Planificación de descanso',              2),
  (N'Muestra de gastronomía regional y productos oriundos (demo)',   N'Exposición de ingredientes',             1),
  (N'Muestra de gastronomía regional y productos oriundos (demo)',   N'Charla sobre cocina regional',           2),
  (N'Encuentro de turismo sostenible e identidad nacional (demo)',   N'Presentación de rutas culturales',       1),
  (N'Encuentro de turismo sostenible e identidad nacional (demo)',   N'Panel de turismo responsable',           2)
) AS v(titulo, actividad, orden)
JOIN dbo.Eventos e ON e.titulo = v.titulo
WHERE NOT EXISTS (SELECT 1 FROM dbo.Actividades_Evento a
                  WHERE a.id_evento = e.id_evento AND a.orden = v.orden);
GO

/* 4. Cuentas demo del Portal (contraseña: EventHubDemo2026) ---------------- */
INSERT INTO dbo.Administradores (usuario, password_hash, nombre_admin, id_organizacion)
SELECT v.usuario, v.hash, v.nombre, o.id_organizacion
FROM (VALUES
  (N'microsoft.demo',   N'scrypt$f5474da6865a76b1d458bf96fbbf02cc$06fadcad602e29cd0d418d24a35eff8ae27de261324939ac3f4a8d2da1f43ff34f13d4034650cb71691278f9ee52091ff333f0ee44b4166dd6bc4bc0c2b41c11', N'Equipo Microsoft (demo)',   N'microsoft'),
  (N'samsung.demo',     N'scrypt$4619079c5f6179c2465fdcb9d2229503$91301567ad3828058c5ed4271c55bd72dcb3662f04b726f69d2f76c2f888babb7c3a1e23783023cfcea607120eda57fefd1429bf04f29f63e6657c0621698564', N'Equipo Samsung (demo)',     N'samsung'),
  (N'playstation.demo', N'scrypt$e62eb03eaaa227ce63b2fc863ef416a0$453a0283526456ef65f392fe2784db33ada482c1193822423aeacacae125fc478c0850bfb74c56640d42240aacaf3757dddd140aba97edb8d9a54dac209b166b', N'Equipo PlayStation (demo)', N'playstation'),
  (N'riot.demo',        N'scrypt$ff6a7cb53cba7980a2323f0e770ec9fc$7cc3549663faaaf6bc9d7dff687bdea8a5b4c5cfaa6aa6ebbfc3476c0b041d895ed2da5aa66339be554b7b563c6fe8dad7fe472b2cc262097c107863f1a46712', N'Equipo Riot Games (demo)',  N'riot-games'),
  (N'pucp.demo',        N'scrypt$0c7647ed34796446ba1e8cb336feb831$d286910196abd3ecdd3846323120f2cff5190869e1809d3cb9f1ef6af9bc517e0ee3ebe20c16e5626a6bdf8b9658048e2492884d3122ba561f1fba56a3277e1a', N'Equipo PUCP (demo)',        N'pucp'),
  (N'utec.demo',        N'scrypt$97ecba2b0ae38fb37400b41223e8bacf$02377e6354190e7ef1d3c2fc8c6256d345eb4f448c5d7e91b4857a74612dfeae53cab1968248f442fbd41e35bd868a9414c62f65d8bf054e9f1f43b3760772d8', N'Equipo UTEC (demo)',        N'utec'),
  (N'falabella.demo',   N'scrypt$7d0e5a4eb47778962bf78184e25c3531$ba5f3e85c80ae9c18179614c14b21eb4d44525b083d2a29b04dd3e3ebd26909aa7e13100194b84aa5ef9eabff351a33ed62e8a0accef4941fc4845e2f045c4df', N'Equipo Falabella (demo)',   N'falabella'),
  (N'plazavea.demo',    N'scrypt$a4d4f97fc20f2a7a2e81906c1cb171f9$f3b127d470801fc3157fa07b84a99f1dc60128e4c3bba5af613f6a09d3e854abecea42dacdcbddcb3aaeb40edca253c1f23eff533d4769c5263cdaae7ab1d312', N'Equipo plazaVea (demo)',    N'plaza-vea'),
  (N'bcp.demo',         N'scrypt$9bde697dd7c998f6b5c734b79c9abe23$92478478926e013116cc9384634048e9063a1eb1300a67f5df913726e6c9d58de03ae18f328fc90617775892b70b8a9938a1f6e06bed9d0ec1ecf3ba7620334e', N'Equipo BCP (demo)',         N'bcp'),
  (N'yape.demo',        N'scrypt$0a4f1f846b6d8c68360350b09f642743$ea110ac324aebeee9727f3d63565a17df333613e273ba684925400ff03789873d50beac526cf3a58521485c2e9f628acbdafe093001405f6fcd759476389992a', N'Equipo Yape (demo)',        N'yape'),
  (N'nike.demo',        N'scrypt$621a8d7de258483f054593c42a9a53e8$8eccf8dd2cedd720b51edfdb07b4ffd69f7dccc84fe8ff5b80650a59de05ff1830035378c72b639038c6d82fd46899cb8adff950fdcf7c53f19cdf1728a7920f', N'Equipo Nike (demo)',        N'nike'),
  (N'marcaperu.demo',   N'scrypt$16792c1831eed91a34963b541d5a3aea$22c68ed9e23e1d433dbe639e040a8ee726748d7731e744cb8db30b55f7ec47e11e033306bb534ddcee037c7a73d7659ff87d1ff9b470dcfe07bef0fd4609d926', N'Equipo Marca Perú (demo)',  N'marca-peru')
) AS v(usuario, hash, nombre, slug)
JOIN dbo.Organizaciones o ON o.slug = v.slug
WHERE NOT EXISTS (SELECT 1 FROM dbo.Administradores a WHERE a.usuario = v.usuario);
GO

/* 5. Verificación ----------------------------------------------------------- */
SELECT o.slug, o.nombre, COUNT(e.id_evento) AS total_eventos
FROM dbo.Organizaciones o
LEFT JOIN dbo.Eventos e ON e.id_organizacion = o.id_organizacion
GROUP BY o.slug, o.nombre
ORDER BY o.nombre;

SELECT
    (SELECT COUNT(*) FROM dbo.Participantes) AS total_participantes,
    (SELECT COUNT(*) FROM dbo.Inscripciones) AS total_inscripciones;
GO
