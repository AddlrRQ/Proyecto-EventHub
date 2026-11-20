require('dotenv').config();

const path = require('path');
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


function requiereAdmin(req, res, next) {
    const admin = leerAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: 'Acceso no autorizado. Inicia sesión como administrador.' });
    }
    req.admin = admin;
    next();
}


const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function textoValido(valor, min, max) {
    return typeof valor === 'string' && valor.trim().length >= min && valor.trim().length <= max;
}


function validarEvento(body, parcialActividades) {
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

    let actividades = null;
    if (b.actividades !== undefined || !parcialActividades) {
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
            titulo: b.titulo.trim(),
            fecha_evento: b.fecha_evento,
            lugar: b.lugar.trim(),
            horario: b.horario.trim(),
            descripcion: b.descripcion.trim(),
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
        .query('SELECT id_admin, usuario, password_hash, nombre_admin FROM Administradores WHERE usuario = @usuario');

    const admin = r.recordset[0];
    if (!admin || !verificarPassword(password, admin.password_hash)) {
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    res.json({
        token: firmarToken({ id_admin: admin.id_admin, usuario: admin.usuario }),
        nombre_admin: admin.nombre_admin
    });
}));


app.get('/api/categorias', ah(async function (req, res) {
    const pool = await getPool();
    const r = await pool.request()
        .query('SELECT id_categoria, slug, nombre FROM Categorias ORDER BY id_categoria');
    res.json(r.recordset);
}));


async function consultarEventos(incluirInactivos, idEvento) {
    const pool = await getPool();

    const eventos = await pool.request()
        .input('todos', sql.Bit, incluirInactivos ? 1 : 0)
        .input('id', sql.Int, idEvento || null)
        .query(`
            SELECT e.id_evento, e.id_categoria, c.slug AS categoria_slug, c.nombre AS categoria_nombre,
                   e.titulo, CONVERT(VARCHAR(10), e.fecha_evento, 23) AS fecha_evento,
                   e.lugar, e.horario, e.descripcion, e.activo
            FROM Eventos e
            INNER JOIN Categorias c ON c.id_categoria = e.id_categoria
            WHERE (e.activo = 1 OR @todos = 1) AND (@id IS NULL OR e.id_evento = @id)
            ORDER BY e.fecha_evento, e.id_evento`);

    const actividades = await pool.request()
        .input('todos', sql.Bit, incluirInactivos ? 1 : 0)
        .input('id', sql.Int, idEvento || null)
        .query(`
            SELECT a.id_actividad, a.id_evento, a.descripcion_actividad, a.orden
            FROM Actividades_Evento a
            INNER JOIN Eventos e ON e.id_evento = a.id_evento
            WHERE (e.activo = 1 OR @todos = 1) AND (@id IS NULL OR e.id_evento = @id)
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
    const verTodos = req.query.todos === '1' && Boolean(leerAdmin(req));
    res.set('Cache-Control', 'no-store');
    res.json(await consultarEventos(verTodos));
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

app.post('/api/eventos', requiereAdmin, ah(async function (req, res) {
    const v = validarEvento(req.body, false);
    if (v.error) return res.status(400).json({ error: v.error });
    const d = v.datos;

    if (!(await categoriaExiste(await getPool(), d.id_categoria))) {
        return res.status(400).json({ error: 'La categoría seleccionada no existe.' });
    }

    const idNuevo = await conTransaccion(async function (tx) {
        const r = await new sql.Request(tx)
            .input('id_categoria', sql.Int, d.id_categoria)
            .input('titulo', sql.NVarChar(150), d.titulo)
            .input('fecha_evento', sql.Date, d.fecha_evento)
            .input('lugar', sql.NVarChar(100), d.lugar)
            .input('horario', sql.NVarChar(50), d.horario)
            .input('descripcion', sql.NVarChar(1000), d.descripcion)
            .input('activo', sql.Bit, d.activo)
            .query(`INSERT INTO Eventos (id_categoria, titulo, fecha_evento, lugar, horario, descripcion, activo)
                    OUTPUT INSERTED.id_evento
                    VALUES (@id_categoria, @titulo, @fecha_evento, @lugar, @horario, @descripcion, @activo)`);
        const id = r.recordset[0].id_evento;
        await insertarActividades(tx, id, d.actividades);
        return id;
    });

    const [creado] = await consultarEventos(true, idNuevo);
    res.status(201).json(creado);
}));

app.put('/api/eventos/:id', requiereAdmin, ah(async function (req, res) {
    const id = idDeRuta(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID de evento inválido.' });

    const v = validarEvento(req.body, true);
    if (v.error) return res.status(400).json({ error: v.error });
    const d = v.datos;

    if (!(await categoriaExiste(await getPool(), d.id_categoria))) {
        return res.status(400).json({ error: 'La categoría seleccionada no existe.' });
    }

    const existe = await conTransaccion(async function (tx) {
        const r = await new sql.Request(tx)
            .input('id', sql.Int, id)
            .input('id_categoria', sql.Int, d.id_categoria)
            .input('titulo', sql.NVarChar(150), d.titulo)
            .input('fecha_evento', sql.Date, d.fecha_evento)
            .input('lugar', sql.NVarChar(100), d.lugar)
            .input('horario', sql.NVarChar(50), d.horario)
            .input('descripcion', sql.NVarChar(1000), d.descripcion)
            .input('activo', sql.Bit, d.activo)
            .query(`UPDATE Eventos
                    SET id_categoria = @id_categoria, titulo = @titulo, fecha_evento = @fecha_evento,
                        lugar = @lugar, horario = @horario, descripcion = @descripcion, activo = @activo
                    WHERE id_evento = @id`);
        if (r.rowsAffected[0] === 0) return false;


        if (d.actividades !== null) {
            await new sql.Request(tx).input('id', sql.Int, id)
                .query('DELETE FROM Actividades_Evento WHERE id_evento = @id');
            await insertarActividades(tx, id, d.actividades);
        }
        return true;
    });

    if (!existe) return res.status(404).json({ error: 'El evento no existe.' });

    const [actualizado] = await consultarEventos(true, id);
    res.json(actualizado);
}));


app.delete('/api/eventos/:id', requiereAdmin, ah(async function (req, res) {
    const id = idDeRuta(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID de evento inválido.' });

    const permanente = req.query.permanente === 'true';
    const pool = await getPool();
    const r = await pool.request()
        .input('id', sql.Int, id)
        .query(permanente
            ? 'DELETE FROM Eventos WHERE id_evento = @id'
            : 'UPDATE Eventos SET activo = 0 WHERE id_evento = @id');

    if (r.rowsAffected[0] === 0) return res.status(404).json({ error: 'El evento no existe.' });
    res.json({ mensaje: permanente ? 'Evento eliminado definitivamente.' : 'Evento desactivado.' });
}));


app.get('/api/inscripciones', ah(async function (req, res) {
    const correo = String(req.query.correo || '').trim().toLowerCase();

    if (!correo && !leerAdmin(req)) {
        return res.status(401).json({ error: 'Indica un correo para consultar tus inscripciones.' });
    }
    if (correo && !REGEX_CORREO.test(correo)) {
        return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
    }

    const pool = await getPool();
    const r = await pool.request()
        .input('correo', sql.NVarChar(150), correo || null)
        .query(`
            SELECT i.id_inscripcion, i.estado, i.fecha_inscripcion,
                   p.id_participante, p.nombre_completo, p.correo,
                   e.id_evento, e.titulo AS evento
            FROM Inscripciones i
            INNER JOIN Participantes p ON p.id_participante = i.id_participante
            INNER JOIN Eventos e       ON e.id_evento       = i.id_evento
            WHERE (@correo IS NULL OR p.correo = @correo)
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
                .query('SELECT titulo FROM Eventos WHERE id_evento = @id AND activo = 1');
            if (ev.recordset.length === 0) {
                const e = new Error('El evento seleccionado no está disponible.');
                e.http = 404;
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
    const esAdmin = Boolean(leerAdmin(req));
    if (!esAdmin && !correo) {
        return res.status(401).json({ error: 'Indica tu correo para eliminar la inscripción.' });
    }

    const pool = await getPool();
    const r = await pool.request()
        .input('id', sql.Int, id)
        .input('correo', sql.NVarChar(150), esAdmin ? null : correo)
        .query(`DELETE i
                FROM Inscripciones i
                INNER JOIN Participantes p ON p.id_participante = i.id_participante
                WHERE i.id_inscripcion = @id AND (@correo IS NULL OR p.correo = @correo)`);

    if (r.rowsAffected[0] === 0) return res.status(404).json({ error: 'No se encontró la inscripción.' });
    res.json({ mensaje: 'Inscripción eliminada.' });
}));


app.use(express.static(path.join(__dirname, 'public')));

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
