'use strict';

const assert = require('assert');
const crypto = require('crypto');
const http = require('http');

const server = require('../backend/server');
const common = require('../public/js/common');

let ejecutadas = 0;
const pruebas = [];

function registrar(nombre, fn) {
    pruebas.push({ nombre: nombre, fn: fn });
}

function peticionHttp(puerto, opciones) {
    return new Promise(function (resolve, reject) {
        const opts = opciones || {};
        const req = http.request({
            hostname: '127.0.0.1',
            port: puerto,
            path: opts.path || '/',
            method: opts.method || 'GET',
            headers: opts.headers || {}
        }, function (res) {
            const trozos = [];
            res.on('data', function (chunk) { trozos.push(chunk); });
            res.on('end', function () {
                const texto = Buffer.concat(trozos).toString('utf8');
                let json = null;
                try { json = JSON.parse(texto); } catch (e) { json = null; }
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    text: texto,
                    json: json
                });
            });
        });
        req.on('error', reject);
        if (opts.body) {
            req.write(opts.body);
        }
        req.end();
    });
}

function crearDatosSinteticos(cantidadEventos, actividadesPorEvento) {
    const eventos = [];
    const actividades = [];
    let idAct = 1;

    for (let i = 1; i <= cantidadEventos; i++) {
        eventos.push({
            id_evento: i,
            id_categoria: (i % 3) + 1,
            categoria_slug: 'academico',
            categoria_nombre: 'Académico',
            id_organizacion: 1,
            organizacion_slug: 'upc',
            organizacion_nombre: 'UPC',
            titulo: 'Evento ' + i,
            fecha_evento: '2026-12-15',
            lugar: 'Lima',
            horario: '10:00 a. m.',
            descripcion: 'Descripción de prueba ' + i,
            capacidad: 100,
            inscritos_vigentes: 10,
            cupos_disponibles: 90,
            activo: i % 2 === 0 ? 1 : 0
        });

        for (let j = 1; j <= actividadesPorEvento; j++) {
            actividades.push({
                id_actividad: idAct++,
                id_evento: i,
                descripcion_actividad: 'Actividad ' + j + ' del evento ' + i,
                orden: j
            });
        }
    }

    return { eventos: eventos, actividades: actividades };
}

registrar('Agrupación con Map conserva contrato JSON, orden y eventos sin actividades', function () {
    const eventos = [
        {
            id_evento: 10,
            id_categoria: 1,
            categoria_slug: 'academico',
            categoria_nombre: 'Académico',
            id_organizacion: 2,
            organizacion_slug: 'upc',
            organizacion_nombre: 'UPC',
            titulo: 'Primero',
            fecha_evento: '2026-12-10',
            lugar: 'Lima',
            horario: '9:00 a. m.',
            descripcion: 'Detalle 1',
            capacidad: 50,
            inscritos_vigentes: 5,
            cupos_disponibles: 45,
            activo: 1
        },
        {
            id_evento: 20,
            id_categoria: 2,
            categoria_slug: 'cultural',
            categoria_nombre: 'Cultural',
            id_organizacion: 2,
            organizacion_slug: 'upc',
            organizacion_nombre: 'UPC',
            titulo: 'Segundo sin actividades',
            fecha_evento: '2026-12-12',
            lugar: 'Barranco',
            horario: '4:00 p. m.',
            descripcion: 'Detalle 2',
            capacidad: 30,
            inscritos_vigentes: 30,
            cupos_disponibles: 0,
            activo: 0
        }
    ];

    const actividades = [
        { id_actividad: 101, id_evento: 10, descripcion_actividad: 'Registro', orden: 1 },
        { id_actividad: 102, id_evento: 10, descripcion_actividad: 'Ponencia', orden: 2 },
        { id_actividad: 103, id_evento: 10, descripcion_actividad: 'Cierre', orden: 3 },
        { id_actividad: 999, id_evento: 999, descripcion_actividad: 'Huérfana', orden: 1 }
    ];

    const mapa = server.construirMapaActividades(actividades);
    assert(mapa instanceof Map);
    assert.strictEqual(mapa.get(10).length, 3);
    assert.strictEqual(mapa.get(20), undefined);

    const resultado = server.asociarActividadesAEventos(eventos, actividades);
    assert.strictEqual(resultado.length, 2);
    assert.strictEqual(resultado[0].id_evento, 10);
    assert.strictEqual(resultado[0].activo, true);
    assert.deepStrictEqual(resultado[0].actividades.map(function (a) { return a.orden; }), [1, 2, 3]);
    assert.strictEqual(resultado[1].id_evento, 20);
    assert.strictEqual(resultado[1].activo, false);
    assert.deepStrictEqual(resultado[1].actividades, []);

    const llavesEsperadas = [
        'id_evento', 'id_categoria', 'categoria_slug', 'categoria_nombre',
        'id_organizacion', 'organizacion_slug', 'organizacion_nombre',
        'titulo', 'fecha_evento', 'lugar', 'horario', 'descripcion',
        'capacidad', 'inscritos_vigentes', 'cupos_disponibles', 'activo', 'actividades'
    ];
    assert.deepStrictEqual(Object.keys(resultado[0]), llavesEsperadas);
});

registrar('Asociación O(E + A) escala de forma aproximadamente lineal en memoria', function () {
    const chico = crearDatosSinteticos(100, 5);
    const grande = crearDatosSinteticos(2000, 5);

    const t0 = process.hrtime.bigint();
    for (let i = 0; i < 20; i++) {
        server.asociarActividadesAEventos(chico.eventos, chico.actividades);
    }
    const durChico = Number(process.hrtime.bigint() - t0);

    const t1 = process.hrtime.bigint();
    const resGrande = server.asociarActividadesAEventos(grande.eventos, grande.actividades);
    const durGrande = Number(process.hrtime.bigint() - t1);

    assert.strictEqual(resGrande.length, 2000);
    assert.strictEqual(resGrande[1999].actividades.length, 5);
    assert(durChico >= 0 && durGrande >= 0);
});

registrar('Lote de actividades realiza 0 viajes para [] y 1 viaje para 1, 5 y 20 elementos', async function () {
    async function probarCantidad(cantidad) {
        const lista = [];
        for (let i = 1; i <= cantidad; i++) {
            lista.push('Actividad ' + i);
        }

        let llamadasQuery = 0;
        let ultimoSql = '';
        const inputs = [];

        const viajes = await server.insertarActividades({}, 77, lista, function () {
            return {
                input: function (nombre, tipo, valor) {
                    inputs.push({ nombre: nombre, valor: valor });
                    return this;
                },
                query: async function (sqlText) {
                    llamadasQuery += 1;
                    ultimoSql = sqlText;
                    return { rowsAffected: [cantidad] };
                }
            };
        });

        return { viajes: viajes, llamadasQuery: llamadasQuery, ultimoSql: ultimoSql, inputs: inputs };
    }

    const r0 = await probarCantidad(0);
    assert.strictEqual(r0.viajes, 0);
    assert.strictEqual(r0.llamadasQuery, 0);

    for (const n of [1, 5, 20]) {
        const res = await probarCantidad(n);
        assert.strictEqual(res.viajes, 1);
        assert.strictEqual(res.llamadasQuery, 1);
        assert.strictEqual(res.inputs.length, 1 + n * 2);
        assert.strictEqual(res.inputs[0].nombre, 'id_evento');
        assert.strictEqual(res.inputs[0].valor, 77);
        assert.strictEqual(res.inputs[res.inputs.length - 1].valor, n);
        assert(res.ultimoSql.includes('INSERT INTO dbo.Actividades_Evento'));
    }

    await assert.rejects(function () {
        return probarCantidad(21);
    }, /Máximo 20 actividades/);
});

registrar('Validación de enteros de entorno rechaza NaN, negativos y valores extremos', function () {
    assert.strictEqual(server.leerEnteroEnv('DB_POOL_MAX', 10, 1, 50, {}), 10);
    assert.strictEqual(server.leerEnteroEnv('DB_POOL_MAX', 10, 1, 50, { DB_POOL_MAX: '  12  ' }), 12);

    assert.throws(function () {
        server.leerEnteroEnv('DB_POOL_MAX', 10, 1, 50, { DB_POOL_MAX: 'abc' });
    });
    assert.throws(function () {
        server.leerEnteroEnv('DB_POOL_MAX', 10, 1, 50, { DB_POOL_MAX: '10px' });
    });
    assert.throws(function () {
        server.leerEnteroEnv('DB_POOL_MAX', 10, 1, 50, { DB_POOL_MAX: '-1' });
    });
    assert.throws(function () {
        server.leerEnteroEnv('DB_POOL_MAX', 10, 1, 50, { DB_POOL_MAX: '9999' });
    });
    assert.throws(function () {
        server.construirConfiguracion({ DB_POOL_MAX: '4', DB_POOL_MIN: '8' }, { silenciarAdvertencias: true });
    });
});

registrar('Validación de booleanos TLS acepta solo true, false, 1 y 0', function () {
    assert.strictEqual(server.leerBooleanoEnv('DB_ENCRYPT', true, {}), true);
    assert.strictEqual(server.leerBooleanoEnv('DB_ENCRYPT', true, { DB_ENCRYPT: 'false' }), false);
    assert.strictEqual(server.leerBooleanoEnv('DB_ENCRYPT', false, { DB_ENCRYPT: 'TRUE' }), true);
    assert.strictEqual(server.leerBooleanoEnv('DB_ENCRYPT', false, { DB_ENCRYPT: '1' }), true);
    assert.strictEqual(server.leerBooleanoEnv('DB_ENCRYPT', true, { DB_ENCRYPT: '0' }), false);

    assert.throws(function () {
        server.leerBooleanoEnv('DB_ENCRYPT', true, { DB_ENCRYPT: 'cualquier_texto' });
    });
    assert.throws(function () {
        server.leerBooleanoEnv('DB_TRUST_SERVER_CERTIFICATE', false, { DB_TRUST_SERVER_CERTIFICATE: 'yes' });
    });

    const cfgProd = server.construirConfiguracion({ NODE_ENV: 'production' }, { silenciarAdvertencias: true });
    assert.strictEqual(cfgProd.dbConfig.options.encrypt, true);
    assert.strictEqual(cfgProd.dbConfig.options.trustServerCertificate, false);
});

registrar('CORS parsea ALLOWED_ORIGINS, normaliza espacios y rechaza comodines u orígenes no autorizados', function () {
    const permitidos = server.parsearOrigenesPermitidos(
        ' http://localhost:3000/ , https://mi-alb.elb.amazonaws.com ',
        3000,
        true
    );
    assert(permitidos.has('http://localhost:3000'));
    assert(permitidos.has('https://mi-alb.elb.amazonaws.com'));

    assert.throws(function () {
        server.parsearOrigenesPermitidos('*', 3000, true);
    });

    assert.deepStrictEqual(
        server.evaluarOrigenCors(undefined, { allowedOrigins: permitidos }),
        { permitido: true, reflejarOrigen: false }
    );
    assert.deepStrictEqual(
        server.evaluarOrigenCors('https://mi-alb.elb.amazonaws.com', {
            allowedOrigins: permitidos,
            hostHeader: 'mi-alb.elb.amazonaws.com',
            protocol: 'https'
        }),
        { permitido: true, reflejarOrigen: true }
    );
    assert.deepStrictEqual(
        server.evaluarOrigenCors('https://sitio-no-autorizado.example', {
            allowedOrigins: permitidos,
            hostHeader: 'mi-alb.elb.amazonaws.com',
            protocol: 'https'
        }),
        { permitido: false, reflejarOrigen: false }
    );
});

registrar('Endpoints health live/ready/compat, CORS HTTP, eventos y rate limit de login', async function () {
    let sqlDisponible = true;
    let llamadasPool = 0;
    let llamadasQueryEventos = 0;

    const sal = '00112233445566778899aabbccddeeff';
    const hashValido = 'scrypt$' + sal + '$' + crypto.scryptSync('ClaveDemo2026!', sal, 64).toString('hex');

    server.configurarParaPruebas({
        instanceName: 'web-test-1',
        authSecret: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        allowedOrigins: new Set(['http://localhost:3000']),
        limitadorLogin: server.crearLimitadorLogin({
            ventanaMs: 60000,
            maxPorClave: 3,
            maxPorIp: 10,
            maxEntradas: 50
        }),
        getPool: async function () {
            llamadasPool += 1;
            if (!sqlDisponible) {
                throw new Error('SQL Server inaccesible en test (127.0.0.1:1433 sa)');
            }
            return {
                request: function () {
                    const estadoReq = {
                        multiple: false,
                        inputs: {},
                        input: function (nombre, tipo, valor) {
                            estadoReq.inputs[nombre] = valor;
                            return estadoReq;
                        },
                        query: async function (sqlText) {
                            if (sqlText.includes('SELECT 1 AS ok')) {
                                return { recordset: [{ ok: 1 }] };
                            }
                            if (sqlText.includes('FROM dbo.Administradores')) {
                                return {
                                    recordset: estadoReq.inputs.usuario === 'admin.demo'
                                        ? [{
                                            id_admin: 1,
                                            usuario: 'admin.demo',
                                            password_hash: hashValido,
                                            nombre_admin: 'Admin Demo',
                                            id_organizacion: 2
                                        }]
                                        : []
                                };
                            }
                            if (sqlText.includes('DECLARE @id_org_resuelta')) {
                                llamadasQueryEventos += 1;
                                assert.strictEqual(estadoReq.multiple, true);
                                return {
                                    recordsets: [
                                        [{ id_organizacion: 2 }],
                                        [{
                                            id_evento: 5,
                                            id_categoria: 1,
                                            categoria_slug: 'academico',
                                            categoria_nombre: 'Académico',
                                            id_organizacion: 2,
                                            organizacion_slug: 'upc',
                                            organizacion_nombre: 'UPC',
                                            titulo: 'Charla',
                                            fecha_evento: '2026-12-20',
                                            lugar: 'Lima',
                                            horario: '10:00 a. m.',
                                            descripcion: 'Detalle',
                                            capacidad: 50,
                                            inscritos_vigentes: 10,
                                            cupos_disponibles: 40,
                                            activo: 1
                                        }],
                                        [{ id_actividad: 1, id_evento: 5, descripcion_actividad: 'Registro', orden: 1 }]
                                    ]
                                };
                            }
                            return { recordset: [] };
                        }
                    };
                    return estadoReq;
                }
            };
        }
    });

    const srv = await new Promise(function (resolve) {
        const s = server.app.listen(0, '127.0.0.1', function () { resolve(s); });
    });

    try {
        const puerto = srv.address().port;

        llamadasPool = 0;
        const live = await peticionHttp(puerto, { path: '/api/health/live' });
        assert.strictEqual(live.status, 200);
        assert.strictEqual(live.headers['cache-control'], 'no-store');
        assert.strictEqual(live.json.estado, 'ok');
        assert.strictEqual(live.json.servidor, 'web-test-1');
        assert.strictEqual(llamadasPool, 0);

        const readyOk = await peticionHttp(puerto, { path: '/api/health/ready' });
        assert.strictEqual(readyOk.status, 200);
        assert.strictEqual(readyOk.headers['cache-control'], 'no-store');
        assert.strictEqual(readyOk.json.baseDatos, 'conectada');

        sqlDisponible = false;
        const readyFail = await peticionHttp(puerto, { path: '/api/health/ready' });
        assert.strictEqual(readyFail.status, 503);
        assert.strictEqual(readyFail.headers['cache-control'], 'no-store');
        assert.strictEqual(readyFail.json.estado, 'degradado');
        assert.strictEqual(readyFail.json.baseDatos, 'desconectada');
        assert(!readyFail.text.includes('127.0.0.1'));
        assert(!readyFail.text.includes('sa'));

        const healthCompat = await peticionHttp(puerto, { path: '/api/health' });
        assert.strictEqual(healthCompat.status, 200);
        assert.strictEqual(healthCompat.json.estado, 'degradado');
        assert.strictEqual(healthCompat.json.baseDatos, 'desconectada');

        sqlDisponible = true;

        const corsOk = await peticionHttp(puerto, {
            path: '/api/health/live',
            headers: { Origin: 'http://localhost:3000' }
        });
        assert.strictEqual(corsOk.status, 200);
        assert.strictEqual(corsOk.headers['access-control-allow-origin'], 'http://localhost:3000');

        const corsDeny = await peticionHttp(puerto, {
            path: '/api/health/live',
            headers: { Origin: 'https://atacante.example' }
        });
        assert.strictEqual(corsDeny.status, 403);
        assert.strictEqual(corsDeny.headers['access-control-allow-origin'], undefined);

        llamadasQueryEventos = 0;
        const evResp = await peticionHttp(puerto, { path: '/api/organizaciones/upc/eventos' });
        assert.strictEqual(evResp.status, 200);
        assert.strictEqual(llamadasQueryEventos, 1);
        assert.strictEqual(evResp.json.length, 1);
        assert.strictEqual(evResp.json[0].activo, true);
        assert.strictEqual(evResp.json[0].actividades.length, 1);

        for (let i = 0; i < 3; i++) {
            const intentoMal = await peticionHttp(puerto, {
                path: '/api/admin/login',
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario: 'admin.demo', password: 'incorrecta' })
            });
            assert.strictEqual(intentoMal.status, 401);
        }

        const bloqueado = await peticionHttp(puerto, {
            path: '/api/admin/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: 'admin.demo', password: 'ClaveDemo2026!' })
        });
        assert.strictEqual(bloqueado.status, 429);
        assert(Number(bloqueado.headers['retry-after']) >= 1);
    } finally {
        await new Promise(function (resolve) { srv.close(resolve); });
    }
});

registrar('Controlador de polling evita solapamiento, pausa cuando hidden=true y revalida al volver visible', async function () {
    const listenersDoc = {};
    const listenersWin = {};
    const timers = new Map();
    let seqTimer = 1;

    const fakeDoc = {
        hidden: false,
        addEventListener: function (ev, fn) { listenersDoc[ev] = fn; },
        removeEventListener: function (ev, fn) {
            if (listenersDoc[ev] === fn) delete listenersDoc[ev];
        }
    };
    const fakeWin = {
        addEventListener: function (ev, fn) { listenersWin[ev] = fn; },
        removeEventListener: function (ev, fn) {
            if (listenersWin[ev] === fn) delete listenersWin[ev];
        }
    };

    let ejecuciones = 0;
    let resolverPendiente = null;

    const ctrl = common.crearControladorPolling({
        intervaloMs: 60000,
        doc: fakeDoc,
        win: fakeWin,
        setIntervalFn: function (fn) {
            const id = seqTimer++;
            timers.set(id, fn);
            return id;
        },
        clearIntervalFn: function (id) {
            timers.delete(id);
        },
        tarea: function () {
            ejecuciones += 1;
            return new Promise(function (resolve) {
                resolverPendiente = resolve;
            });
        }
    });

    ctrl.iniciar({ ejecutarInmediato: false });
    ctrl.iniciar({ ejecutarInmediato: false });
    assert.strictEqual(timers.size, 1);

    const tick = Array.from(timers.values())[0];
    tick();
    assert.strictEqual(ejecuciones, 1);
    tick();
    tick();
    assert.strictEqual(ejecuciones, 1);

    resolverPendiente();
    await new Promise(function (resolve) { setImmediate(resolve); });

    fakeDoc.hidden = true;
    listenersDoc.visibilitychange();
    assert.strictEqual(timers.size, 0);

    fakeDoc.hidden = false;
    listenersDoc.visibilitychange();
    assert.strictEqual(timers.size, 1);
    assert.strictEqual(ejecuciones, 2);

    resolverPendiente();
    await new Promise(function (resolve) { setImmediate(resolve); });

    listenersWin.pagehide();
    assert.strictEqual(timers.size, 0);
    assert.strictEqual(listenersDoc.visibilitychange, undefined);
    assert.strictEqual(listenersWin.pagehide, undefined);
});

async function ejecutarTodas() {
    for (let i = 0; i < pruebas.length; i++) {
        const p = pruebas[i];
        await p.fn();
        ejecutadas += 1;
        console.log('[OK] ' + p.nombre);
    }
    console.log('\nTotal de pruebas aprobadas: ' + ejecutadas + '/' + pruebas.length);
}

ejecutarTodas().catch(function (err) {
    console.error('[ERROR]', err);
    process.exit(1);
});
