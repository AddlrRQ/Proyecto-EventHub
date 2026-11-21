const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const os = require('os');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const PORT = parseInt(process.env.PORT, 10) || 3000;


const AUTH_SECRET = process.env.AUTH_SECRET;
if (!AUTH_SECRET) {
    console.error('Falta AUTH_SECRET en el archivo .env');
    process.exit(1);
}
const TOKEN_HORAS = 8;


const dbConfig = {
    server: process.env.DB_SERVER,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'EventHubDB',
    port: parseInt(process.env.DB_PORT, 10) || 1433,
    options: {
        encrypt: true,               
        trustServerCertificate: true 
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 10000,
    requestTimeout: 15000
};


let poolPromise = null;

function getPool() {
    if (!poolPromise) {
        const pool = new sql.ConnectionPool(dbConfig);
        pool.on('error', function (err) {
            console.error('Error en el pool de SQL Server:', err.message);
            poolPromise = null;
        });
        poolPromise = pool.connect().catch(function (err) {
            poolPromise = null;
            throw err;
        });
    }
    return poolPromise;
}


async function conTransaccion(fn) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const resultado = await fn(tx);
        await tx.commit();
        return resultado;
    } catch (err) {
        try { await tx.rollback(); } catch (e) { /* ya revertida */ }
        throw err;
    }
}


function esDuplicado(err) {
    return err && (err.number === 2627 || err.number === 2601);
}


function verificarPassword(password, almacenado) {
    const partes = String(almacenado || '').split('$');
    if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
    const esperado = Buffer.from(partes[2], 'hex');
    const calculado = crypto.scryptSync(password, partes[1], esperado.length);
    return crypto.timingSafeEqual(calculado, esperado);
}


function firmarToken(payload) {
    const cuerpo = Buffer.from(JSON.stringify({
        ...payload,
        exp: Date.now() + TOKEN_HORAS * 3600 * 1000
    })).toString('base64url');
    const firma = crypto.createHmac('sha256', AUTH_SECRET).update(cuerpo).digest('base64url');
    return cuerpo + '.' + firma;
}

function verificarToken(token) {
    if (!token || token.indexOf('.') === -1) return null;
    const [cuerpo, firma] = token.split('.');
    const esperada = crypto.createHmac('sha256', AUTH_SECRET).update(cuerpo).digest('base64url');
    const a = Buffer.from(firma);
    const b = Buffer.from(esperada);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
        return datos.exp > Date.now() ? datos : null;
    } catch (e) {
        return null;
    }
}

function leerAdmin(req) {
    const cabecera = req.headers.authorization || '';
    return cabecera.startsWith('Bearer ') ? verificarToken(cabecera.slice(7)) : null;
}


function requiereOrganizacion(req, res, next) {
    const admin = leerAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: 'Acceso no autorizado. Inicia sesión en el portal.' });
    }
    const idOrg = Number(admin.id_organizacion);
    if (!Number.isInteger(idOrg) || idOrg <= 0) {
        return res.status(403).json({ error: 'Tu cuenta no está vinculada a ninguna organización.' });
    }
    req.admin = admin;
    req.idOrganizacion = idOrg;
    next();
}


const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_SLUG = /^[a-z0-9-]{2,60}$/;
const REGEX_COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

function textoValido(valor, min, max) {
    return typeof valor === 'string' && valor.trim().length >= min && valor.trim().length <= max;
}

function urlImagenValida(valor) {
    if (valor === null || valor === undefined) return true;
    if (typeof valor !== 'string') return false;
    const limpio = valor.trim();
    if (!limpio) return true;
    if (limpio.length > 500) return false;
    return limpio.startsWith('https://') ||
           limpio.startsWith('http://') ||
           (limpio.startsWith('/') && !limpio.startsWith('//'));
}

function validarPerfilOrganizacion(body) {
    const b = body || {};
    const contacto = String(b.correo_contacto || '').trim();
    const contactoNorm = contacto.startsWith('https://') ? contacto : contacto.toLowerCase();
    const primario = String(b.color_primario || '').trim();
    const secundario = String(b.color_secundario || '').trim();
    const logo = typeof b.logo_url === 'string' ? b.logo_url.trim() : '';
    const banner = typeof b.banner_url === 'string' ? b.banner_url.trim() : '';

    if (!textoValido(b.nombre, 2, 100)) return { error: 'El nombre debe tener entre 2 y 100 caracteres.' };
    if (!textoValido(b.descripcion_corta, 5, 200)) return { error: 'La descripción corta debe tener entre 5 y 200 caracteres.' };
    if (!textoValido(b.descripcion, 10, 2000)) return { error: 'La descripción debe tener entre 10 y 2000 caracteres.' };
    if ((!REGEX_CORREO.test(contactoNorm) && !contactoNorm.startsWith('https://')) || contactoNorm.length > 150) {
        return { error: 'El canal de contacto debe ser un correo válido o un enlace https:// (máx. 150 caracteres).' };
    }
    if (!REGEX_COLOR_HEX.test(primario)) return { error: 'El color principal debe tener formato #RRGGBB.' };
    if (!REGEX_COLOR_HEX.test(secundario)) return { error: 'El color secundario debe tener formato #RRGGBB.' };
    if (!urlImagenValida(logo)) return { error: 'La URL del logo debe empezar con http://, https:// o / (máx. 500 caracteres).' };
    if (!urlImagenValida(banner)) return { error: 'La URL del banner debe empezar con http://, https:// o / (máx. 500 caracteres).' };

    return {
        datos: {
            nombre: b.nombre.trim(),
            descripcion_corta: b.descripcion_corta.trim(),
            descripcion: b.descripcion.trim(),
            correo_contacto: contactoNorm,
            logo_url: logo || null,
            banner_url: banner || null,
            color_primario: primario.toUpperCase(),
            color_secundario: secundario.toUpperCase()
        }
    };
}


function validarEvento(body, esEdicion) {
    const b = body || {};
    const idCategoria = Number(b.id_categoria);

    if (!textoValido(b.titulo, 3, 150)) return { error: 'El título debe tener entre 3 y 150 caracteres.' };
    if (!Number.isInteger(idCategoria) || idCategoria <= 0) return { error: 'Selecciona una categoría válida.' };
    if (typeof b.fecha_evento !== 'string' || !REGEX_FECHA.test(b.fecha_evento) ||
        isNaN(new Date(b.fecha_evento + 'T00:00:00Z').getTime())) {
        return { error: 'La fecha debe tener el formato AAAA-MM-DD.' };
    }
    if (!textoValido(b.lugar, 2, 100)) return { error: 'El lugar es obligatorio (máx. 100 caracteres).' };
    if (!textoValido(b.horario, 2, 50)) return { error: 'El horario es obligatorio (máx. 50 caracteres).' };
    if (!textoValido(b.descripcion, 5, 1000)) return { error: 'La descripción es obligatoria (máx. 1000 caracteres).' };

    let capacidad = esEdicion ? null : 100;
    if (b.capacidad !== undefined && b.capacidad !== null && b.capacidad !== '') {
        const cap = Number(b.capacidad);
        if (!Number.isInteger(cap) || cap < 1 || cap > 100000) {
            return { error: 'La capacidad debe ser un número entero entre 1 y 100000.' };
        }
        capacidad = cap;
    }

    let idOrganizacion = null;
    if (b.id_organizacion !== undefined && b.id_organizacion !== null && b.id_organizacion !== '') {
        const idOrg = Number(b.id_organizacion);
        if (!Number.isInteger(idOrg) || idOrg <= 0) {
            return { error: 'La organización seleccionada no es válida.' };
        }
        idOrganizacion = idOrg;
    }

    let actividades = null;
    if (b.actividades !== undefined || !esEdicion) {
        if (!Array.isArray(b.actividades)) return { error: 'Las actividades deben enviarse como arreglo.' };
        actividades = b.actividades.map(function (a) { return String(a).trim(); }).filter(Boolean);
        if (actividades.length > 20) return { error: 'Máximo 20 actividades por evento.' };
        if (actividades.some(function (a) { return a.length > 200; })) {
            return { error: 'Cada actividad admite máximo 200 caracteres.' };
        }
    }

    return {
        datos: {
            id_categoria: idCategoria,
            id_organizacion: idOrganizacion,
            titulo: b.titulo.trim(),
            fecha_evento: b.fecha_evento,
            lugar: b.lugar.trim(),
            horario: b.horario.trim(),
            descripcion: b.descripcion.trim(),
            capacidad: capacidad,
            activo: b.activo === undefined ? true : Boolean(b.activo),
            actividades: actividades
        }
    };
}

function idDeRuta(valor) {
    const id = Number(valor);
    return Number.isInteger(id) && id > 0 ? id : null;
}


const app = express();

app.use(cors());
app.use(express.json({ limit: '100kb' }));


const ah = function (fn) {
    return function (req, res, next) { Promise.resolve(fn(req, res, next)).catch(next); };
};


app.get('/api/health', ah(async function (req, res) {
    let baseDatos = 'conectada';
    try {
        const pool = await getPool();
        await pool.request().query('SELECT 1 AS ok');
    } catch (err) {
        baseDatos = 'desconectada';
        console.error('Health check: BD no disponible ->', err.message);
    }


    res.set('Cache-Control', 'no-store');
    res.status(200).json({
        estado: baseDatos === 'conectada' ? 'ok' : 'degradado',
        baseDatos: baseDatos,
        servidor: process.env.INSTANCE_NAME || os.hostname(),
        hora: new Date().toISOString()
    });
}));


app.post('/api/admin/login', ah(async function (req, res) {
    const usuario = String((req.body || {}).usuario || '').trim();
    const password = String((req.body || {}).password || '');

    if (!usuario || !password) {
        return res.status(400).json({ error: 'Ingresa usuario y contraseña.' });
    }

    const pool = await getPool();
    const r = await pool.request()
        .input('usuario', sql.NVarChar(50), usuario)
        .query('SELECT id_admin, usuario, password_hash, nombre_admin, id_organizacion FROM Administradores WHERE usuario = @usuario');

    const admin = r.recordset[0];
    if (!admin || !verificarPassword(password, admin.password_hash)) {
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    res.json({
        token: firmarToken({
            id_admin: admin.id_admin,
            usuario: admin.usuario,
            id_organizacion: admin.id_organizacion || null
        }),
        nombre_admin: admin.nombre_admin,
        id_organizacion: admin.id_organizacion || null
    });
}));


const CAMPOS_ORG_PUBLICA = `
    id_organizacion, slug, nombre, descripcion_corta, descripcion,
    correo_contacto, logo_url, banner_url, color_primario, color_secundario`;

app.get('/api/organizaciones', ah(async function (req, res) {
    const pool = await getPool();
    const r = await pool.request()
        .query(`SELECT ${CAMPOS_ORG_PUBLICA}
                FROM Organizaciones
                WHERE activo = 1
                ORDER BY nombre, id_organizacion`);
    res.set('Cache-Control', 'no-store');
    res.json(r.recordset);
}));

app.get('/api/organizaciones/:slug', ah(async function (req, res) {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!REGEX_SLUG.test(slug)) {
        return res.status(404).json({ error: 'Organización no encontrada.' });
    }

    const pool = await getPool();
    const r = await pool.request()
        .input('slug', sql.NVarChar(60), slug)
        .query(`SELECT ${CAMPOS_ORG_PUBLICA}
                FROM Organizaciones
                WHERE slug = @slug AND activo = 1`);

    if (r.recordset.length === 0) {
        return res.status(404).json({ error: 'Organización no encontrada.' });
    }
    res.set('Cache-Control', 'no-store');
    res.json(r.recordset[0]);
}));

app.get('/api/organizaciones/:slug/eventos', ah(async function (req, res) {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!REGEX_SLUG.test(slug)) {
        return res.status(404).json({ error: 'Organización no encontrada.' });
    }

    const pool = await getPool();
    const org = await pool.request()
        .input('slug', sql.NVarChar(60), slug)
        .query('SELECT id_organizacion FROM Organizaciones WHERE slug = @slug AND activo = 1');

    if (org.recordset.length === 0) {
        return res.status(404).json({ error: 'Organización no encontrada.' });
    }

    res.set('Cache-Control', 'no-store');
    res.json(await consultarEventos({
        incluirInactivos: false,
        idOrganizacion: org.recordset[0].id_organizacion,
        soloOrgActiva: true
    }));
}));


app.get('/api/portal/resumen', requiereOrganizacion, ah(async function (req, res) {
    const pool = await getPool();
    const r = await pool.request()
        .input('id_org', sql.Int, req.idOrganizacion)
        .query(`
            SELECT o.id_organizacion, o.slug, o.nombre,
                   COUNT(DISTINCT e.id_evento) AS total_eventos,
                   COUNT(DISTINCT CASE WHEN e.activo = 1 THEN e.id_evento END) AS eventos_activos,
                   COUNT(CASE WHEN i.estado IN (N'confirmada', N'pendiente') THEN 1 END) AS total_inscripciones
            FROM Organizaciones o
            LEFT JOIN Eventos e ON e.id_organizacion = o.id_organizacion
            LEFT JOIN Inscripciones i ON i.id_evento = e.id_evento
            WHERE o.id_organizacion = @id_org
            GROUP BY o.id_organizacion, o.slug, o.nombre`);

    if (r.recordset.length === 0) {
        return res.status(404).json({ error: 'Organización no encontrada.' });
    }
    res.set('Cache-Control', 'no-store');
    res.json(r.recordset[0]);
}));

app.get('/api/portal/perfil', requiereOrganizacion, ah(async function (req, res) {
    const pool = await getPool();
    const r = await pool.request()
        .input('id_org', sql.Int, req.idOrganizacion)
        .query(`SELECT ${CAMPOS_ORG_PUBLICA}, activo
                FROM Organizaciones
                WHERE id_organizacion = @id_org`);

    if (r.recordset.length === 0) {
        return res.status(404).json({ error: 'Organización no encontrada.' });
    }
    res.set('Cache-Control', 'no-store');
    res.json(r.recordset[0]);
}));

app.put('/api/portal/perfil', requiereOrganizacion, ah(async function (req, res) {
    const v = validarPerfilOrganizacion(req.body);
    if (v.error) return res.status(400).json({ error: v.error });
    const d = v.datos;

    const pool = await getPool();
    const r = await pool.request()
        .input('id_org', sql.Int, req.idOrganizacion)
        .input('nombre', sql.NVarChar(100), d.nombre)
        .input('descripcion_corta', sql.NVarChar(200), d.descripcion_corta)
        .input('descripcion', sql.NVarChar(2000), d.descripcion)
        .input('correo_contacto', sql.NVarChar(150), d.correo_contacto)
        .input('logo_url', sql.NVarChar(500), d.logo_url)
        .input('banner_url', sql.NVarChar(500), d.banner_url)
        .input('color_primario', sql.Char(7), d.color_primario)
        .input('color_secundario', sql.Char(7), d.color_secundario)
        .query(`UPDATE Organizaciones
                SET nombre = @nombre,
                    descripcion_corta = @descripcion_corta,
                    descripcion = @descripcion,
                    correo_contacto = @correo_contacto,
                    logo_url = @logo_url,
                    banner_url = @banner_url,
                    color_primario = @color_primario,
                    color_secundario = @color_secundario
                WHERE id_organizacion = @id_org`);

    if (r.rowsAffected[0] === 0) {
        return res.status(404).json({ error: 'Organización no encontrada.' });
    }

    const actualizado = await pool.request()
        .input('id_org', sql.Int, req.idOrganizacion)
        .query(`SELECT ${CAMPOS_ORG_PUBLICA}, activo FROM Organizaciones WHERE id_organizacion = @id_org`);
    res.json(actualizado.recordset[0]);
}));


app.get('/api/categorias', ah(async function (req, res) {
    const pool = await getPool();
    const r = await pool.request()
        .query('SELECT id_categoria, slug, nombre FROM Categorias ORDER BY id_categoria');
    res.json(r.recordset);
}));


async function consultarEventos(opciones) {
    const opts = opciones || {};
    const incluirInactivos = Boolean(opts.incluirInactivos);
    const idEvento = opts.idEvento || null;
    const idOrganizacion = opts.idOrganizacion || null;
    const soloOrgActiva = Boolean(opts.soloOrgActiva);
    const pool = await getPool();

    const preparar = function () {
        return pool.request()
            .input('todos', sql.Bit, incluirInactivos ? 1 : 0)
            .input('id', sql.Int, idEvento)
            .input('id_org', sql.Int, idOrganizacion)
            .input('solo_org_activa', sql.Bit, soloOrgActiva ? 1 : 0);
    };

    const eventos = await preparar().query(`
        SELECT e.id_evento, e.id_categoria, c.slug AS categoria_slug, c.nombre AS categoria_nombre,
               e.id_organizacion, o.slug AS organizacion_slug, o.nombre AS organizacion_nombre,
               e.titulo, CONVERT(VARCHAR(10), e.fecha_evento, 23) AS fecha_evento,
               e.lugar, e.horario, e.descripcion, e.capacidad,
               ISNULL(occ.inscritos_vigentes, 0) AS inscritos_vigentes,
               CASE
                   WHEN e.capacidad - ISNULL(occ.inscritos_vigentes, 0) > 0
                   THEN e.capacidad - ISNULL(occ.inscritos_vigentes, 0)
                   ELSE 0
               END AS cupos_disponibles,
               e.activo
        FROM Eventos e
        INNER JOIN Categorias c ON c.id_categoria = e.id_categoria
        LEFT JOIN Organizaciones o ON o.id_organizacion = e.id_organizacion
        LEFT JOIN (
            SELECT id_evento, COUNT(*) AS inscritos_vigentes
            FROM Inscripciones
            WHERE estado IN (N'confirmada', N'pendiente')
            GROUP BY id_evento
        ) occ ON occ.id_evento = e.id_evento
        WHERE (e.activo = 1 OR @todos = 1)
          AND (@id IS NULL OR e.id_evento = @id)
          AND (@id_org IS NULL OR e.id_organizacion = @id_org)
          AND (@solo_org_activa = 0 OR o.activo = 1)
        ORDER BY e.fecha_evento, e.id_evento`);

    const actividades = await preparar().query(`
        SELECT a.id_actividad, a.id_evento, a.descripcion_actividad, a.orden
        FROM Actividades_Evento a
        INNER JOIN Eventos e ON e.id_evento = a.id_evento
        LEFT JOIN Organizaciones o ON o.id_organizacion = e.id_organizacion
        WHERE (e.activo = 1 OR @todos = 1)
          AND (@id IS NULL OR e.id_evento = @id)
          AND (@id_org IS NULL OR e.id_organizacion = @id_org)
          AND (@solo_org_activa = 0 OR o.activo = 1)
        ORDER BY a.id_evento, a.orden`);

    return eventos.recordset.map(function (ev) {
        return {
            ...ev,
            activo: Boolean(ev.activo),
            actividades: actividades.recordset.filter(function (a) { return a.id_evento === ev.id_evento; })
        };
    });
}


app.get('/api/eventos', ah(async function (req, res) {
    const admin = req.query.todos === '1' ? leerAdmin(req) : null;
    const idOrgAdmin = admin ? Number(admin.id_organizacion) : 0;
    const verTodosDeOrg = Boolean(admin && Number.isInteger(idOrgAdmin) && idOrgAdmin > 0);
    res.set('Cache-Control', 'no-store');
    res.json(await consultarEventos({
        incluirInactivos: verTodosDeOrg,
        idOrganizacion: verTodosDeOrg ? idOrgAdmin : null,
        soloOrgActiva: !verTodosDeOrg
    }));
}));


async function insertarActividades(tx, idEvento, actividades) {
    for (let i = 0; i < actividades.length; i++) {
        await new sql.Request(tx)
            .input('id_evento', sql.Int, idEvento)
            .input('descripcion', sql.NVarChar(200), actividades[i])
            .input('orden', sql.Int, i + 1)
            .query(`INSERT INTO Actividades_Evento (id_evento, descripcion_actividad, orden)
                    VALUES (@id_evento, @descripcion, @orden)`);
    }
}

async function categoriaExiste(pool, idCategoria) {
    const r = await pool.request()
        .input('id', sql.Int, idCategoria)
        .query('SELECT 1 AS ok FROM Categorias WHERE id_categoria = @id');
    return r.recordset.length > 0;
}

async function organizacionExiste(pool, idOrganizacion) {
    const r = await pool.request()
        .input('id', sql.Int, idOrganizacion)
        .query('SELECT 1 AS ok FROM Organizaciones WHERE id_organizacion = @id');
    return r.recordset.length > 0;
}

app.post('/api/eventos', requiereOrganizacion, ah(async function (req, res) {
    const v = validarEvento(req.body, false);
    if (v.error) return res.status(400).json({ error: v.error });
    const d = v.datos;

    const pool = await getPool();
    if (!(await categoriaExiste(pool, d.id_categoria))) {
        return res.status(400).json({ error: 'La categoría seleccionada no existe.' });
    }

    const idOrganizacion = req.idOrganizacion;
    if (!(await organizacionExiste(pool, idOrganizacion))) {
        return res.status(404).json({ error: 'La organización autenticada no existe.' });
    }

    const idNuevo = await conTransaccion(async function (tx) {
        const r = await new sql.Request(tx)
            .input('id_categoria', sql.Int, d.id_categoria)
            .input('id_organizacion', sql.Int, idOrganizacion)
            .input('titulo', sql.NVarChar(150), d.titulo)
            .input('fecha_evento', sql.Date, d.fecha_evento)
            .input('lugar', sql.NVarChar(100), d.lugar)
            .input('horario', sql.NVarChar(50), d.horario)
            .input('descripcion', sql.NVarChar(1000), d.descripcion)
            .input('capacidad', sql.Int, d.capacidad)
            .input('activo', sql.Bit, d.activo)
            .query(`INSERT INTO Eventos (id_categoria, id_organizacion, titulo, fecha_evento, lugar, horario, descripcion, capacidad, activo)
                    OUTPUT INSERTED.id_evento
                    VALUES (@id_categoria, @id_organizacion, @titulo, @fecha_evento, @lugar, @horario, @descripcion, @capacidad, @activo)`);
        const id = r.recordset[0].id_evento;
        await insertarActividades(tx, id, d.actividades);
        return id;
    });

    const [creado] = await consultarEventos({ incluirInactivos: true, idEvento: idNuevo, idOrganizacion: idOrganizacion });
    res.status(201).json(creado);
}));

app.put('/api/eventos/:id', requiereOrganizacion, ah(async function (req, res) {
    const id = idDeRuta(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID de evento inválido.' });

    const v = validarEvento(req.body, true);
    if (v.error) return res.status(400).json({ error: v.error });
    const d = v.datos;

    const pool = await getPool();
    if (!(await categoriaExiste(pool, d.id_categoria))) {
        return res.status(400).json({ error: 'La categoría seleccionada no existe.' });
    }

    const existe = await conTransaccion(async function (tx) {
        const r = await new sql.Request(tx)
            .input('id', sql.Int, id)
            .input('id_org', sql.Int, req.idOrganizacion)
            .input('id_categoria', sql.Int, d.id_categoria)
            .input('titulo', sql.NVarChar(150), d.titulo)
            .input('fecha_evento', sql.Date, d.fecha_evento)
            .input('lugar', sql.NVarChar(100), d.lugar)
            .input('horario', sql.NVarChar(50), d.horario)
            .input('descripcion', sql.NVarChar(1000), d.descripcion)
            .input('capacidad', sql.Int, d.capacidad)
            .input('activo', sql.Bit, d.activo)
            .query(`UPDATE Eventos
                    SET id_categoria = @id_categoria,
                        titulo = @titulo,
                        fecha_evento = @fecha_evento,
                        lugar = @lugar,
                        horario = @horario,
                        descripcion = @descripcion,
                        capacidad = COALESCE(@capacidad, capacidad),
                        activo = @activo
                    WHERE id_evento = @id AND id_organizacion = @id_org`);
        if (r.rowsAffected[0] === 0) return false;


        if (d.actividades !== null) {
            await new sql.Request(tx).input('id', sql.Int, id)
                .query('DELETE FROM Actividades_Evento WHERE id_evento = @id');
            await insertarActividades(tx, id, d.actividades);
        }
        return true;
    });

    if (!existe) return res.status(404).json({ error: 'El evento no existe o no pertenece a tu organización.' });

    const [actualizado] = await consultarEventos({ incluirInactivos: true, idEvento: id, idOrganizacion: req.idOrganizacion });
    res.json(actualizado);
}));


app.delete('/api/eventos/:id', requiereOrganizacion, ah(async function (req, res) {
    const id = idDeRuta(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID de evento inválido.' });

    const permanente = req.query.permanente === 'true';
    const pool = await getPool();
    const r = await pool.request()
        .input('id', sql.Int, id)
        .input('id_org', sql.Int, req.idOrganizacion)
        .query(permanente
            ? 'DELETE FROM Eventos WHERE id_evento = @id AND id_organizacion = @id_org'
            : 'UPDATE Eventos SET activo = 0 WHERE id_evento = @id AND id_organizacion = @id_org');

    if (r.rowsAffected[0] === 0) return res.status(404).json({ error: 'El evento no existe o no pertenece a tu organización.' });
    res.json({ mensaje: permanente ? 'Evento eliminado definitivamente.' : 'Evento desactivado.' });
}));


app.get('/api/inscripciones', ah(async function (req, res) {
    const correo = String(req.query.correo || '').trim().toLowerCase();
    let idOrg = null;

    if (!correo) {
        const admin = leerAdmin(req);
        if (!admin) {
            return res.status(401).json({ error: 'Indica un correo para consultar tus inscripciones.' });
        }
        idOrg = Number(admin.id_organizacion);
        if (!Number.isInteger(idOrg) || idOrg <= 0) {
            return res.status(403).json({ error: 'Tu cuenta no está vinculada a ninguna organización.' });
        }
    }
    if (correo && !REGEX_CORREO.test(correo)) {
        return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
    }

    const pool = await getPool();
    const r = await pool.request()
        .input('correo', sql.NVarChar(150), correo || null)
        .input('id_org', sql.Int, idOrg)
        .query(`
            SELECT i.id_inscripcion, i.estado, i.fecha_inscripcion,
                   p.id_participante, p.nombre_completo, p.correo,
                   e.id_evento, e.titulo AS evento,
                   o.slug AS organizacion_slug, o.nombre AS organizacion_nombre
            FROM Inscripciones i
            INNER JOIN Participantes p ON p.id_participante = i.id_participante
            INNER JOIN Eventos e       ON e.id_evento       = i.id_evento
            LEFT JOIN Organizaciones o ON o.id_organizacion = e.id_organizacion
            WHERE (@correo IS NULL OR p.correo = @correo)
              AND (@id_org IS NULL OR e.id_organizacion = @id_org)
            ORDER BY i.fecha_inscripcion DESC, i.id_inscripcion DESC`);

    res.set('Cache-Control', 'no-store');
    res.json(r.recordset);
}));

app.post('/api/inscripciones', ah(async function (req, res) {
    const b = req.body || {};
    const nombre = String(b.nombre || '').trim();
    const correo = String(b.correo || '').trim().toLowerCase();
    const idEvento = idDeRuta(b.id_evento);

    if (!textoValido(nombre, 3, 100)) return res.status(400).json({ error: 'El nombre debe tener entre 3 y 100 caracteres.' });
    if (!REGEX_CORREO.test(correo) || correo.length > 150) return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
    if (!idEvento) return res.status(400).json({ error: 'Selecciona un evento.' });

    try {
        const inscripcion = await conTransaccion(async function (tx) {
            const ev = await new sql.Request(tx).input('id', sql.Int, idEvento)
                .query(`SELECT e.titulo, e.capacidad
                        FROM Eventos e WITH (UPDLOCK, HOLDLOCK)
                        INNER JOIN Organizaciones o ON o.id_organizacion = e.id_organizacion
                        WHERE e.id_evento = @id AND e.activo = 1 AND o.activo = 1`);
            if (ev.recordset.length === 0) {
                const e = new Error('El evento seleccionado no está disponible.');
                e.http = 404;
                throw e;
            }

            const occ = await new sql.Request(tx).input('id', sql.Int, idEvento)
                .query(`SELECT COUNT(*) AS vigentes
                        FROM Inscripciones WITH (HOLDLOCK)
                        WHERE id_evento = @id AND estado IN (N'confirmada', N'pendiente')`);
            if (occ.recordset[0].vigentes >= ev.recordset[0].capacidad) {
                const e = new Error('Este evento ya alcanzó su capacidad máxima (agotado).');
                e.http = 409;
                throw e;
            }

            const buscar = function () {
                return new sql.Request(tx).input('correo', sql.NVarChar(150), correo)
                    .query('SELECT id_participante FROM Participantes WHERE correo = @correo');
            };
            let p = await buscar();
            if (p.recordset.length === 0) {
                await new sql.Request(tx)
                    .input('nombre', sql.NVarChar(100), nombre)
                    .input('correo', sql.NVarChar(150), correo)
                    .query('INSERT INTO Participantes (nombre_completo, correo) VALUES (@nombre, @correo)');
                p = await buscar();
            }
            const idParticipante = p.recordset[0].id_participante;

            const ins = await new sql.Request(tx)
                .input('id_participante', sql.Int, idParticipante)
                .input('id_evento', sql.Int, idEvento)
                .query(`INSERT INTO Inscripciones (id_participante, id_evento)
                        OUTPUT INSERTED.id_inscripcion, INSERTED.estado, INSERTED.fecha_inscripcion
                        VALUES (@id_participante, @id_evento)`);

            return {
                ...ins.recordset[0],
                id_participante: idParticipante,
                nombre_completo: nombre,
                correo: correo,
                id_evento: idEvento,
                evento: ev.recordset[0].titulo
            };
        });

        res.status(201).json(inscripcion);
    } catch (err) {
        if (err.http) return res.status(err.http).json({ error: err.message });
        if (esDuplicado(err)) {
            return res.status(409).json({ error: 'Este correo ya está inscrito en ese evento.' });
        }
        throw err;
    }
}));

app.delete('/api/inscripciones/:id', ah(async function (req, res) {
    const id = idDeRuta(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID de inscripción inválido.' });

    const correo = String(req.query.correo || '').trim().toLowerCase();
    const admin = leerAdmin(req);
    let idOrg = null;

    if (!correo) {
        if (!admin) {
            return res.status(401).json({ error: 'Indica tu correo para eliminar la inscripción.' });
        }
        idOrg = Number(admin.id_organizacion);
        if (!Number.isInteger(idOrg) || idOrg <= 0) {
            return res.status(403).json({ error: 'Tu cuenta no está vinculada a ninguna organización.' });
        }
    }

    const pool = await getPool();
    const r = await pool.request()
        .input('id', sql.Int, id)
        .input('correo', sql.NVarChar(150), idOrg ? null : correo)
        .input('id_org', sql.Int, idOrg)
        .query(`DELETE i
                FROM Inscripciones i
                INNER JOIN Participantes p ON p.id_participante = i.id_participante
                INNER JOIN Eventos e       ON e.id_evento       = i.id_evento
                WHERE i.id_inscripcion = @id
                  AND (@correo IS NULL OR p.correo = @correo)
                  AND (@id_org IS NULL OR e.id_organizacion = @id_org)`);

    if (r.rowsAffected[0] === 0) return res.status(404).json({ error: 'No se encontró la inscripción.' });
    res.json({ mensaje: 'Inscripción eliminada.' });
}));


app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', function (req, res) {
    res.status(404).json({ error: 'Ruta de la API no encontrada.' });
});

app.use(function (err, req, res, next) {
    console.error('Error:', err);
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON inválido.' });
    }
    res.status(500).json({ error: 'Error interno del servidor. Intenta nuevamente.' });
});

app.listen(PORT, '0.0.0.0', function () {
    console.log('EventHub escuchando en el puerto ' + PORT + ' (servidor: ' + (process.env.INSTANCE_NAME || os.hostname()) + ')');
});
