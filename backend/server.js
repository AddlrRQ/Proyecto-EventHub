const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const os = require('os');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const TOKEN_HORAS = 8;
const MAX_ENTRADAS_RATE_LIMIT = 2000;
const VENTANA_LOGIN_MS = 15 * 60 * 1000;
const MAX_INTENTOS_LOGIN_CLAVE = 10;
const MAX_INTENTOS_LOGIN_IP = 30;
const DUMMY_SCRYPT_HASH = 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128);

function leerEnteroEnv(nombre, valorPredeterminado, minimo, maximo, env) {
    const origen = env || process.env;
    const raw = origen[nombre];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return valorPredeterminado;
    }

    const limpio = String(raw).trim();
    if (!/^-?\d+$/.test(limpio)) {
        throw new Error('Configuración inválida para ' + nombre + ': debe ser un entero.');
    }

    const numero = Number(limpio);
    if (!Number.isSafeInteger(numero) || numero < minimo || numero > maximo) {
        throw new Error('Configuración fuera de rango para ' + nombre + ': debe estar entre ' + minimo + ' y ' + maximo + '.');
    }
    return numero;
}

function leerBooleanoEnv(nombre, valorPredeterminado, env) {
    const origen = env || process.env;
    const raw = origen[nombre];
    if (raw === undefined || raw === null || String(raw).trim() === '') {
        return valorPredeterminado;
    }

    const limpio = String(raw).trim().toLowerCase();
    if (limpio === 'true' || limpio === '1') return true;
    if (limpio === 'false' || limpio === '0') return false;

    throw new Error('Configuración booleana inválida para ' + nombre + ': usa true, false, 1 o 0.');
}

function normalizarOrigen(valor) {
    const limpio = String(valor || '').trim().replace(/\/+$/, '');
    if (!limpio) return '';
    if (limpio === '*') {
        throw new Error('ALLOWED_ORIGINS no permite comodín (*) por seguridad.');
    }

    let url;
    try {
        url = new URL(limpio);
    } catch (err) {
        throw new Error('Origen inválido en ALLOWED_ORIGINS: ' + limpio);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Protocolo no permitido en ALLOWED_ORIGINS: ' + limpio);
    }
    if (url.pathname !== '/' || url.search || url.hash) {
        throw new Error('ALLOWED_ORIGINS debe contener solo esquema, host y puerto opcional: ' + limpio);
    }
    return url.origin;
}

function parsearOrigenesPermitidos(raw, port, esProduccion) {
    const set = new Set();
    const texto = String(raw || '').trim();
    if (texto) {
        const partes = texto.split(',');
        for (let i = 0; i < partes.length; i++) {
            const normalizado = normalizarOrigen(partes[i]);
            if (normalizado) set.add(normalizado);
        }
        return set;
    }

    if (!esProduccion) {
        set.add('http://localhost:' + port);
        set.add('http://127.0.0.1:' + port);
    }
    return set;
}

function evaluarOrigenCors(origin, contexto) {
    if (!origin) {
        return { permitido: true, reflejarOrigen: false };
    }

    let originNorm;
    try {
        const url = new URL(String(origin).trim());
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return { permitido: false, reflejarOrigen: false };
        }
        originNorm = url.origin;
    } catch (err) {
        return { permitido: false, reflejarOrigen: false };
    }

    const ctx = contexto || {};
    const allowedOrigins = ctx.allowedOrigins || new Set();
    if (allowedOrigins.has(originNorm)) {
        return { permitido: true, reflejarOrigen: true };
    }

    const hostHeader = String(ctx.hostHeader || '').trim().toLowerCase();
    const protocol = String(ctx.protocol || 'http').split(',')[0].trim().toLowerCase();
    if (hostHeader && (protocol === 'http' || protocol === 'https')) {
        try {
            const origenMismoSitio = new URL(protocol + '://' + hostHeader).origin;
            if (originNorm === origenMismoSitio) {
                return { permitido: true, reflejarOrigen: true };
            }
        } catch (err) {
            return { permitido: false, reflejarOrigen: false };
        }
    }

    return { permitido: false, reflejarOrigen: false };
}

function construirConfiguracion(env, opciones) {
    const origen = env || process.env;
    const opts = opciones || {};
    const esProduccion = String(origen.NODE_ENV || '').trim().toLowerCase() === 'production';
    const port = leerEnteroEnv('PORT', 3000, 1, 65535, origen);
    const poolMax = leerEnteroEnv('DB_POOL_MAX', 10, 1, 50, origen);
    const poolMin = leerEnteroEnv('DB_POOL_MIN', 0, 0, poolMax, origen);
    const poolIdleMs = leerEnteroEnv('DB_POOL_IDLE_MS', 30000, 1000, 300000, origen);
    const connectionTimeout = leerEnteroEnv('DB_CONNECTION_TIMEOUT_MS', 10000, 1000, 60000, origen);
    const requestTimeout = leerEnteroEnv('DB_REQUEST_TIMEOUT_MS', 15000, 1000, 120000, origen);
    const dbEncrypt = leerBooleanoEnv('DB_ENCRYPT', true, origen);
    const trustCertConfigurado = origen.DB_TRUST_SERVER_CERTIFICATE !== undefined &&
                                 String(origen.DB_TRUST_SERVER_CERTIFICATE).trim() !== '';
    const dbTrustServerCertificate = leerBooleanoEnv('DB_TRUST_SERVER_CERTIFICATE', !esProduccion, origen);

    if (!trustCertConfigurado && !esProduccion && !opts.silenciarAdvertencias) {
        console.warn('Aviso TLS: DB_TRUST_SERVER_CERTIFICATE no definido; usando true en entorno no productivo. En producción define DB_TRUST_SERVER_CERTIFICATE=false.');
    }

    return {
        port: port,
        instanceName: origen.INSTANCE_NAME || os.hostname(),
        authSecret: origen.AUTH_SECRET || '',
        esProduccion: esProduccion,
        allowedOrigins: parsearOrigenesPermitidos(origen.ALLOWED_ORIGINS, port, esProduccion),
        dbConfig: {
            server: origen.DB_SERVER,
            user: origen.DB_USER,
            password: origen.DB_PASSWORD,
            database: origen.DB_NAME || 'EventHubDB',
            port: leerEnteroEnv('DB_PORT', 1433, 1, 65535, origen),
            options: {
                encrypt: dbEncrypt,
                trustServerCertificate: dbTrustServerCertificate
            },
            pool: {
                max: poolMax,
                min: poolMin,
                idleTimeoutMillis: poolIdleMs
            },
            connectionTimeout: connectionTimeout,
            requestTimeout: requestTimeout
        }
    };
}

let configActiva = null;
if (require.main === module) {
    configActiva = construirConfiguracion(process.env);
    if (!configActiva.authSecret) {
        console.error('Falta AUTH_SECRET en el archivo .env');
        process.exit(1);
    }
} else {
    configActiva = construirConfiguracion(process.env, { silenciarAdvertencias: true });
}

const PORT = configActiva.port;
let authSecretActivo = configActiva.authSecret;
const dbConfig = configActiva.dbConfig;

let poolPromise = null;

function getPoolDefault() {
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

let getPool = getPoolDefault;

function obtenerSecretoActivo() {
    return authSecretActivo;
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
    if (partes.length !== 3 || partes[0] !== 'scrypt' || !partes[1] || !/^[0-9a-f]+$/i.test(partes[2])) {
        return false;
    }
    const esperado = Buffer.from(partes[2], 'hex');
    if (esperado.length === 0) return false;
    const calculado = crypto.scryptSync(password, partes[1], esperado.length);
    return crypto.timingSafeEqual(calculado, esperado);
}

// Limitador en memoria por instancia EC2 (no compartido entre múltiples instancias detrás del ALB).
function crearLimitadorLogin(opciones) {
    const opts = opciones || {};
    const ventanaMs = opts.ventanaMs || VENTANA_LOGIN_MS;
    const maxPorClave = opts.maxPorClave || MAX_INTENTOS_LOGIN_CLAVE;
    const maxPorIp = opts.maxPorIp || MAX_INTENTOS_LOGIN_IP;
    const maxEntradas = opts.maxEntradas || MAX_ENTRADAS_RATE_LIMIT;
    const registros = new Map();

    function limpiarExpirados(ahora) {
        for (const [clave, entrada] of registros.entries()) {
            if (ahora >= entrada.reiniciaEn) {
                registros.delete(clave);
            }
        }
        while (registros.size >= maxEntradas) {
            const masAntigua = registros.keys().next().value;
            if (masAntigua === undefined) break;
            registros.delete(masAntigua);
        }
    }

    function obtenerEntradaActiva(clave, ahora) {
        const entrada = registros.get(clave);
        if (!entrada) return null;
        if (ahora >= entrada.reiniciaEn) {
            registros.delete(clave);
            return null;
        }
        return entrada;
    }

    function incrementarEntrada(clave, ahora) {
        const actual = obtenerEntradaActiva(clave, ahora);
        if (actual) {
            actual.intentos += 1;
            return actual;
        }
        if (registros.size >= maxEntradas) {
            limpiarExpirados(ahora);
        }
        const nueva = { intentos: 1, reiniciaEn: ahora + ventanaMs };
        registros.set(clave, nueva);
        return nueva;
    }

    function evaluar(ip, usuario, ahoraParam) {
        const ahora = ahoraParam !== undefined ? ahoraParam : Date.now();
        const ipNorm = String(ip || 'desconocida');
        const userNorm = String(usuario || '').trim().toLowerCase();
        const claveIp = 'ip:' + ipNorm;
        const clavePar = 'login:' + ipNorm + ':' + userNorm;

        const entradaIp = obtenerEntradaActiva(claveIp, ahora);
        if (entradaIp && entradaIp.intentos >= maxPorIp) {
            return {
                bloqueado: true,
                reintentarSegundos: Math.max(1, Math.ceil((entradaIp.reiniciaEn - ahora) / 1000))
            };
        }

        const entradaPar = obtenerEntradaActiva(clavePar, ahora);
        if (entradaPar && entradaPar.intentos >= maxPorClave) {
            return {
                bloqueado: true,
                reintentarSegundos: Math.max(1, Math.ceil((entradaPar.reiniciaEn - ahora) / 1000))
            };
        }

        return { bloqueado: false, reintentarSegundos: 0 };
    }

    function registrarFallo(ip, usuario, ahoraParam) {
        const ahora = ahoraParam !== undefined ? ahoraParam : Date.now();
        const ipNorm = String(ip || 'desconocida');
        const userNorm = String(usuario || '').trim().toLowerCase();
        incrementarEntrada('ip:' + ipNorm, ahora);
        incrementarEntrada('login:' + ipNorm + ':' + userNorm, ahora);
    }

    function limpiarExito(ip, usuario) {
        const ipNorm = String(ip || 'desconocida');
        const userNorm = String(usuario || '').trim().toLowerCase();
        registros.delete('login:' + ipNorm + ':' + userNorm);
    }

    return {
        evaluar: evaluar,
        registrarFallo: registrarFallo,
        limpiarExito: limpiarExito,
        tamano: function () { return registros.size; }
    };
}

const limitadorLogin = crearLimitadorLogin();


function firmarToken(payload, secreto) {
    const clave = secreto || obtenerSecretoActivo();
    const cuerpo = Buffer.from(JSON.stringify({
        ...payload,
        exp: Date.now() + TOKEN_HORAS * 3600 * 1000
    })).toString('base64url');
    const firma = crypto.createHmac('sha256', clave).update(cuerpo).digest('base64url');
    return cuerpo + '.' + firma;
}

function verificarToken(token, secreto) {
    const clave = secreto || obtenerSecretoActivo();
    if (!clave || !token || typeof token !== 'string') return null;
    const partes = token.split('.');
    if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
    const [cuerpo, firma] = partes;
    const esperada = crypto.createHmac('sha256', clave).update(cuerpo).digest('base64url');
    const a = Buffer.from(firma);
    const b = Buffer.from(esperada);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
        const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
        return typeof datos.exp === 'number' && datos.exp > Date.now() ? datos : null;
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
app.set('trust proxy', 1);

let allowedOriginsActivos = configActiva.allowedOrigins;
let instanciaNombreActivo = configActiva.instanceName;
let limitadorLoginActivo = limitadorLogin;

app.use(cors(function (req, callback) {
    const evaluacion = evaluarOrigenCors(req.headers.origin, {
        allowedOrigins: allowedOriginsActivos,
        hostHeader: req.get('host'),
        protocol: req.headers['x-forwarded-proto'] || req.protocol
    });

    if (!evaluacion.permitido) {
        const err = new Error('Origen no permitido por la política CORS.');
        err.http = 403;
        return callback(err);
    }

    if (!evaluacion.reflejarOrigen) {
        return callback(null, { origin: false });
    }

    callback(null, {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    });
}));
app.use(express.json({ limit: '100kb' }));


const ah = function (fn) {
    return function (req, res, next) { Promise.resolve(fn(req, res, next)).catch(next); };
};


async function verificarSaludBaseDatos() {
    let baseDatos = 'conectada';
    try {
        const pool = await getPool();
        await pool.request().query('SELECT 1 AS ok');
    } catch (err) {
        baseDatos = 'desconectada';
        console.error('Health check: BD no disponible ->', err.message);
    }
    return {
        conectada: baseDatos === 'conectada',
        payload: {
            estado: baseDatos === 'conectada' ? 'ok' : 'degradado',
            baseDatos: baseDatos,
            servidor: instanciaNombreActivo,
            hora: new Date().toISOString()
        }
    };
}

app.get('/api/health/live', function (req, res) {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({
        estado: 'ok',
        servidor: instanciaNombreActivo,
        hora: new Date().toISOString()
    });
});

app.get('/api/health/ready', ah(async function (req, res) {
    const resultado = await verificarSaludBaseDatos();
    res.set('Cache-Control', 'no-store');
    res.status(resultado.conectada ? 200 : 503).json(resultado.payload);
}));

app.get('/api/health', ah(async function (req, res) {
    const resultado = await verificarSaludBaseDatos();
    res.set('Cache-Control', 'no-store');
    res.status(200).json(resultado.payload);
}));


app.post('/api/admin/login', ah(async function (req, res) {
    const cuerpo = req.body || {};
    if (typeof cuerpo.usuario !== 'string' || typeof cuerpo.password !== 'string') {
        return res.status(400).json({ error: 'Ingresa usuario y contraseña.' });
    }

    const usuario = cuerpo.usuario.trim();
    const password = cuerpo.password;

    if (!usuario || !password) {
        return res.status(400).json({ error: 'Ingresa usuario y contraseña.' });
    }
    if (usuario.length > 50 || password.length > 200) {
        return res.status(400).json({ error: 'Usuario o contraseña exceden la longitud permitida.' });
    }

    const ipCliente = req.ip || (req.socket && req.socket.remoteAddress) || 'desconocida';
    const estadoLimite = limitadorLoginActivo.evaluar(ipCliente, usuario);
    if (estadoLimite.bloqueado) {
        res.set('Retry-After', String(estadoLimite.reintentarSegundos));
        return res.status(429).json({
            error: 'Demasiados intentos de inicio de sesión. Intenta nuevamente en unos minutos.'
        });
    }

    const pool = await getPool();
    const r = await pool.request()
        .input('usuario', sql.NVarChar(50), usuario)
        .query('SELECT id_admin, usuario, password_hash, nombre_admin, id_organizacion FROM dbo.Administradores WHERE usuario = @usuario');

    const admin = r.recordset[0];
    const hashParaVerificar = admin ? admin.password_hash : DUMMY_SCRYPT_HASH;
    const passwordValida = verificarPassword(password, hashParaVerificar);

    if (!admin || !passwordValida) {
        limitadorLoginActivo.registrarFallo(ipCliente, usuario);
        return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }

    limitadorLoginActivo.limpiarExito(ipCliente, usuario);
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
    const reqSql = pool.request();
    reqSql.multiple = true;
    const r = await reqSql
        .input('slug', sql.NVarChar(60), slug)
        .query(`
            DECLARE @id_org_resuelta INT = (
                SELECT id_organizacion
                FROM dbo.Organizaciones
                WHERE slug = @slug AND activo = 1
            );

            SELECT @id_org_resuelta AS id_organizacion;

            IF @id_org_resuelta IS NOT NULL
            BEGIN
                ${construirSqlEventosYActividades('WHERE e.id_organizacion = @id_org_resuelta AND e.activo = 1', false)}
            END`);

    const orgRow = r.recordsets && r.recordsets[0] && r.recordsets[0][0];
    if (!orgRow || !orgRow.id_organizacion) {
        return res.status(404).json({ error: 'Organización no encontrada.' });
    }

    const eventosFilas = (r.recordsets && r.recordsets[1]) || [];
    const actividadesFilas = (r.recordsets && r.recordsets[2]) || [];

    res.set('Cache-Control', 'no-store');
    res.json(asociarActividadesAEventos(eventosFilas, actividadesFilas));
}));


app.get('/api/portal/resumen', requiereOrganizacion, ah(async function (req, res) {
    const pool = await getPool();
    const r = await pool.request()
        .input('id_org', sql.Int, req.idOrganizacion)
        .query(`
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
            WHERE o.id_organizacion = @id_org`);

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
        .query(`UPDATE dbo.Organizaciones
                SET nombre = @nombre,
                    descripcion_corta = @descripcion_corta,
                    descripcion = @descripcion,
                    correo_contacto = @correo_contacto,
                    logo_url = @logo_url,
                    banner_url = @banner_url,
                    color_primario = @color_primario,
                    color_secundario = @color_secundario
                OUTPUT INSERTED.id_organizacion, INSERTED.slug, INSERTED.nombre,
                       INSERTED.descripcion_corta, INSERTED.descripcion,
                       INSERTED.correo_contacto, INSERTED.logo_url, INSERTED.banner_url,
                       INSERTED.color_primario, INSERTED.color_secundario, INSERTED.activo
                WHERE id_organizacion = @id_org`);

    if (r.recordset.length === 0) {
        return res.status(404).json({ error: 'Organización no encontrada.' });
    }

    res.json(r.recordset[0]);
}));


app.get('/api/categorias', ah(async function (req, res) {
    const pool = await getPool();
    const r = await pool.request()
        .query('SELECT id_categoria, slug, nombre FROM Categorias ORDER BY id_categoria');
    res.json(r.recordset);
}));


function construirMapaActividades(actividades) {
    const mapa = new Map();
    for (let i = 0; i < actividades.length; i++) {
        const actividad = actividades[i];
        let lista = mapa.get(actividad.id_evento);
        if (!lista) {
            lista = [];
            mapa.set(actividad.id_evento, lista);
        }
        lista.push(actividad);
    }
    return mapa;
}

function asociarActividadesAEventos(eventos, actividades) {
    const actividadesPorEvento = construirMapaActividades(actividades);
    const resultado = new Array(eventos.length);
    for (let i = 0; i < eventos.length; i++) {
        const ev = eventos[i];
        resultado[i] = {
            ...ev,
            activo: Boolean(ev.activo),
            actividades: actividadesPorEvento.get(ev.id_evento) || []
        };
    }
    return resultado;
}

function construirSqlEventosYActividades(clausulaWhere, unirOrgEnActividades) {
    const joinOrgActividades = unirOrgEnActividades
        ? 'LEFT JOIN dbo.Organizaciones o ON o.id_organizacion = e.id_organizacion'
        : '';

    return `
        WITH EventosFiltrados AS (
            SELECT e.id_evento, e.id_categoria, c.slug AS categoria_slug, c.nombre AS categoria_nombre,
                   e.id_organizacion, o.slug AS organizacion_slug, o.nombre AS organizacion_nombre,
                   e.titulo, e.fecha_evento, e.lugar, e.horario, e.descripcion, e.capacidad, e.activo
            FROM dbo.Eventos e
            INNER JOIN dbo.Categorias c ON c.id_categoria = e.id_categoria
            LEFT JOIN dbo.Organizaciones o ON o.id_organizacion = e.id_organizacion
            ${clausulaWhere}
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

        SELECT a.id_actividad, a.id_evento, a.descripcion_actividad, a.orden
        FROM dbo.Actividades_Evento a
        INNER JOIN dbo.Eventos e ON e.id_evento = a.id_evento
        ${joinOrgActividades}
        ${clausulaWhere}
        ORDER BY a.id_evento, a.orden;`;
}

async function consultarEventos(opciones) {
    const opts = opciones || {};
    const incluirInactivos = Boolean(opts.incluirInactivos);
    const idEvento = opts.idEvento || null;
    const idOrganizacion = opts.idOrganizacion || null;
    const soloOrgActiva = Boolean(opts.soloOrgActiva);
    const pool = await getPool();

    const condiciones = [];
    const reqSql = pool.request();
    reqSql.multiple = true;

    if (!incluirInactivos) {
        condiciones.push('e.activo = 1');
    }
    if (idEvento !== null) {
        condiciones.push('e.id_evento = @id');
        reqSql.input('id', sql.Int, idEvento);
    }
    if (idOrganizacion !== null) {
        condiciones.push('e.id_organizacion = @id_org');
        reqSql.input('id_org', sql.Int, idOrganizacion);
    }
    if (soloOrgActiva) {
        condiciones.push('o.activo = 1');
    }

    const clausulaWhere = condiciones.length > 0 ? 'WHERE ' + condiciones.join(' AND ') : '';
    const consultaSql = construirSqlEventosYActividades(clausulaWhere, soloOrgActiva);
    const resultado = await reqSql.query(consultaSql);
    const eventosFilas = (resultado.recordsets && resultado.recordsets[0]) || [];
    const actividadesFilas = (resultado.recordsets && resultado.recordsets[1]) || [];

    return asociarActividadesAEventos(eventosFilas, actividadesFilas);
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


function construirLoteActividades(idEvento, actividades) {
    if (!Array.isArray(actividades) || actividades.length === 0) {
        return null;
    }
    if (actividades.length > 20) {
        throw new Error('Máximo 20 actividades por evento.');
    }

    const filasSql = [];
    const parametros = [
        { nombre: 'id_evento', tipo: sql.Int, valor: idEvento }
    ];

    for (let i = 0; i < actividades.length; i++) {
        const nombreDesc = 'desc_' + i;
        const nombreOrden = 'orden_' + i;
        filasSql.push('(@id_evento, @' + nombreDesc + ', @' + nombreOrden + ')');
        parametros.push({
            nombre: nombreDesc,
            tipo: sql.NVarChar(200),
            valor: actividades[i]
        });
        parametros.push({
            nombre: nombreOrden,
            tipo: sql.Int,
            valor: i + 1
        });
    }

    return {
        sql: 'INSERT INTO dbo.Actividades_Evento (id_evento, descripcion_actividad, orden)\nVALUES ' +
             filasSql.join(',\n       ') + ';',
        parametros: parametros
    };
}

async function insertarActividades(tx, idEvento, actividades, crearRequestFn) {
    const lote = construirLoteActividades(idEvento, actividades);
    if (!lote) return 0;

    const reqSql = crearRequestFn ? crearRequestFn(tx) : new sql.Request(tx);
    for (let i = 0; i < lote.parametros.length; i++) {
        const p = lote.parametros[i];
        reqSql.input(p.nombre, p.tipo, p.valor);
    }
    await reqSql.query(lote.sql);
    return 1;
}

async function categoriaExiste(pool, idCategoria) {
    const r = await pool.request()
        .input('id', sql.Int, idCategoria)
        .query('SELECT 1 AS ok FROM dbo.Categorias WHERE id_categoria = @id');
    return r.recordset.length > 0;
}

async function validarCategoriaYOrganizacion(pool, idCategoria, idOrganizacion) {
    const r = await pool.request()
        .input('id_cat', sql.Int, idCategoria)
        .input('id_org', sql.Int, idOrganizacion)
        .query(`
            SELECT
                CASE WHEN EXISTS (SELECT 1 FROM dbo.Categorias WHERE id_categoria = @id_cat) THEN 1 ELSE 0 END AS categoria_ok,
                CASE WHEN EXISTS (SELECT 1 FROM dbo.Organizaciones WHERE id_organizacion = @id_org) THEN 1 ELSE 0 END AS organizacion_ok`);
    return r.recordset[0] || { categoria_ok: 0, organizacion_ok: 0 };
}

app.post('/api/eventos', requiereOrganizacion, ah(async function (req, res) {
    const v = validarEvento(req.body, false);
    if (v.error) return res.status(400).json({ error: v.error });
    const d = v.datos;

    const pool = await getPool();
    const idOrganizacion = req.idOrganizacion;
    const refs = await validarCategoriaYOrganizacion(pool, d.id_categoria, idOrganizacion);
    if (!refs.categoria_ok) {
        return res.status(400).json({ error: 'La categoría seleccionada no existe.' });
    }
    if (!refs.organizacion_ok) {
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
    const pool = await getPool();

    if (correo) {
        if (!REGEX_CORREO.test(correo) || correo.length > 150) {
            return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
        }

        const r = await pool.request()
            .input('correo', sql.NVarChar(150), correo)
            .query(`
                SELECT i.id_inscripcion, i.estado, i.fecha_inscripcion,
                       p.id_participante, p.nombre_completo, p.correo,
                       e.id_evento, e.titulo AS evento,
                       o.slug AS organizacion_slug, o.nombre AS organizacion_nombre
                FROM dbo.Inscripciones i
                INNER JOIN dbo.Participantes p ON p.id_participante = i.id_participante
                INNER JOIN dbo.Eventos e       ON e.id_evento       = i.id_evento
                LEFT JOIN dbo.Organizaciones o ON o.id_organizacion = e.id_organizacion
                WHERE p.correo = @correo
                ORDER BY i.fecha_inscripcion DESC, i.id_inscripcion DESC`);

        res.set('Cache-Control', 'no-store');
        return res.json(r.recordset);
    }

    const admin = leerAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: 'Indica un correo para consultar tus inscripciones.' });
    }
    const idOrg = Number(admin.id_organizacion);
    if (!Number.isInteger(idOrg) || idOrg <= 0) {
        return res.status(403).json({ error: 'Tu cuenta no está vinculada a ninguna organización.' });
    }

    const r = await pool.request()
        .input('id_org', sql.Int, idOrg)
        .query(`
            SELECT i.id_inscripcion, i.estado, i.fecha_inscripcion,
                   p.id_participante, p.nombre_completo, p.correo,
                   e.id_evento, e.titulo AS evento,
                   o.slug AS organizacion_slug, o.nombre AS organizacion_nombre
            FROM dbo.Inscripciones i
            INNER JOIN dbo.Participantes p ON p.id_participante = i.id_participante
            INNER JOIN dbo.Eventos e       ON e.id_evento       = i.id_evento
            LEFT JOIN dbo.Organizaciones o ON o.id_organizacion = e.id_organizacion
            WHERE e.id_organizacion = @id_org
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
                        FROM dbo.Eventos e WITH (UPDLOCK, HOLDLOCK)
                        INNER JOIN dbo.Organizaciones o ON o.id_organizacion = e.id_organizacion
                        WHERE e.id_evento = @id AND e.activo = 1 AND o.activo = 1`);
            if (ev.recordset.length === 0) {
                const e = new Error('El evento seleccionado no está disponible.');
                e.http = 404;
                throw e;
            }

            const occ = await new sql.Request(tx).input('id', sql.Int, idEvento)
                .query(`SELECT COUNT(*) AS vigentes
                        FROM dbo.Inscripciones WITH (HOLDLOCK)
                        WHERE id_evento = @id AND estado IN (N'confirmada', N'pendiente')`);
            if (occ.recordset[0].vigentes >= ev.recordset[0].capacidad) {
                const e = new Error('Este evento ya alcanzó su capacidad máxima (agotado).');
                e.http = 409;
                throw e;
            }

            let p = await new sql.Request(tx).input('correo', sql.NVarChar(150), correo)
                .query('SELECT id_participante FROM dbo.Participantes WHERE correo = @correo');
            let idParticipante;
            if (p.recordset.length === 0) {
                const insertado = await new sql.Request(tx)
                    .input('nombre', sql.NVarChar(100), nombre)
                    .input('correo', sql.NVarChar(150), correo)
                    .query(`INSERT INTO dbo.Participantes (nombre_completo, correo)
                            OUTPUT INSERTED.id_participante
                            VALUES (@nombre, @correo)`);
                idParticipante = insertado.recordset[0].id_participante;
            } else {
                idParticipante = p.recordset[0].id_participante;
            }

            const ins = await new sql.Request(tx)
                .input('id_participante', sql.Int, idParticipante)
                .input('id_evento', sql.Int, idEvento)
                .query(`INSERT INTO dbo.Inscripciones (id_participante, id_evento)
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
    const pool = await getPool();

    if (correo) {
        if (!REGEX_CORREO.test(correo) || correo.length > 150) {
            return res.status(400).json({ error: 'El correo no tiene un formato válido.' });
        }

        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('correo', sql.NVarChar(150), correo)
            .query(`DELETE i
                    FROM dbo.Inscripciones i
                    INNER JOIN dbo.Participantes p ON p.id_participante = i.id_participante
                    WHERE i.id_inscripcion = @id AND p.correo = @correo`);

        if (r.rowsAffected[0] === 0) return res.status(404).json({ error: 'No se encontró la inscripción.' });
        return res.json({ mensaje: 'Inscripción eliminada.' });
    }

    const admin = leerAdmin(req);
    if (!admin) {
        return res.status(401).json({ error: 'Indica tu correo para eliminar la inscripción.' });
    }
    const idOrg = Number(admin.id_organizacion);
    if (!Number.isInteger(idOrg) || idOrg <= 0) {
        return res.status(403).json({ error: 'Tu cuenta no está vinculada a ninguna organización.' });
    }

    const r = await pool.request()
        .input('id', sql.Int, id)
        .input('id_org', sql.Int, idOrg)
        .query(`DELETE i
                FROM dbo.Inscripciones i
                INNER JOIN dbo.Eventos e ON e.id_evento = i.id_evento
                WHERE i.id_inscripcion = @id AND e.id_organizacion = @id_org`);

    if (r.rowsAffected[0] === 0) return res.status(404).json({ error: 'No se encontró la inscripción.' });
    res.json({ mensaje: 'Inscripción eliminada.' });
}));


app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', function (req, res) {
    res.status(404).json({ error: 'Ruta de la API no encontrada.' });
});

app.use(function (err, req, res, next) {
    const rutaSinQuery = String((req && req.originalUrl) || '').split('?')[0];
    const codigo = (err && (err.code || err.number || err.type || err.http)) || 'INTERNAL';
    const mensajeLog = (err && err.message) ? String(err.message) : 'Error desconocido';
    console.error('Error en %s %s -> [%s] %s', req.method, rutaSinQuery, codigo, mensajeLog);

    if (err && err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'JSON inválido.' });
    }
    if (err && err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'La solicitud excede el tamaño máximo permitido.' });
    }
    if (err && err.http === 403) {
        return res.status(403).json({ error: 'Origen no permitido por la política CORS.' });
    }
    res.status(500).json({ error: 'Error interno del servidor. Intenta nuevamente.' });
});

function configurarParaPruebas(opciones) {
    const opts = opciones || {};
    if (opts.getPool) getPool = opts.getPool;
    if (opts.allowedOrigins !== undefined) allowedOriginsActivos = opts.allowedOrigins;
    if (opts.instanceName !== undefined) instanciaNombreActivo = opts.instanceName;
    if (opts.limitadorLogin !== undefined) limitadorLoginActivo = opts.limitadorLogin;
    if (opts.authSecret !== undefined) authSecretActivo = opts.authSecret;
}

if (require.main === module) {
    app.listen(PORT, '0.0.0.0', function () {
        console.log('EventHub escuchando en el puerto ' + PORT + ' (servidor: ' + instanciaNombreActivo + ')');
    });
}

module.exports = {
    app: app,
    construirMapaActividades: construirMapaActividades,
    asociarActividadesAEventos: asociarActividadesAEventos,
    construirLoteActividades: construirLoteActividades,
    insertarActividades: insertarActividades,
    leerEnteroEnv: leerEnteroEnv,
    leerBooleanoEnv: leerBooleanoEnv,
    normalizarOrigen: normalizarOrigen,
    parsearOrigenesPermitidos: parsearOrigenesPermitidos,
    evaluarOrigenCors: evaluarOrigenCors,
    construirConfiguracion: construirConfiguracion,
    crearLimitadorLogin: crearLimitadorLogin,
    verificarPassword: verificarPassword,
    firmarToken: firmarToken,
    verificarToken: verificarToken,
    configurarParaPruebas: configurarParaPruebas
};
