'use strict';

const http = require('http');
const { asociarActividadesAEventos, construirLoteActividades } = require('../backend/server');

function crearDataset(numEventos, actsPorEvento) {
    const eventos = [];
    const actividades = [];
    let idAct = 1;

    for (let i = 1; i <= numEventos; i++) {
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
            descripcion: 'Descripción de evento ' + i,
            capacidad: 100,
            inscritos_vigentes: 12,
            cupos_disponibles: 88,
            activo: 1
        });
        for (let j = 1; j <= actsPorEvento; j++) {
            actividades.push({
                id_actividad: idAct++,
                id_evento: i,
                descripcion_actividad: 'Actividad ' + j,
                orden: j
            });
        }
    }
    return { eventos: eventos, actividades: actividades };
}

function asociarAnteriorFilter(eventos, actividades) {
    return eventos.map(function (evento) {
        return {
            ...evento,
            activo: Boolean(evento.activo),
            actividades: actividades.filter(function (actividad) {
                return actividad.id_evento === evento.id_evento;
            })
        };
    });
}

function medirMs(fn, iteraciones) {
    const inicio = process.hrtime.bigint();
    for (let i = 0; i < iteraciones; i++) {
        fn();
    }
    const fin = process.hrtime.bigint();
    return Number(fin - inicio) / 1e6 / iteraciones;
}

function medirAsociacion() {
    console.log('=== Medición local en Node.js: Asociación eventos + actividades ===');
    const escenarios = [
        { e: 10, a: 50, iter: 2000 },
        { e: 100, a: 500, iter: 500 },
        { e: 1000, a: 5000, iter: 50 }
    ];

    for (const esc of escenarios) {
        const datos = crearDataset(esc.e, esc.a / esc.e);
        const msAntes = medirMs(function () {
            asociarAnteriorFilter(datos.eventos, datos.actividades);
        }, esc.iter);
        const msDespues = medirMs(function () {
            asociarActividadesAEventos(datos.eventos, datos.actividades);
        }, esc.iter);

        console.log(
            esc.e + ' eventos / ' + esc.a + ' actividades -> ' +
            'Antes O(E*A): ' + msAntes.toFixed(4) + ' ms | ' +
            'Después O(E+A) Map: ' + msDespues.toFixed(4) + ' ms'
        );
    }
}

function medirConstruccionLote() {
    console.log('\n=== Medición local en Node.js: Preparación de lote de actividades ===');
    for (const n of [1, 5, 20]) {
        const lista = [];
        for (let i = 1; i <= n; i++) lista.push('Actividad ' + i);
        const ms = medirMs(function () {
            construirLoteActividades(1, lista);
        }, 5000);
        console.log(n + ' actividades -> ' + ms.toFixed(5) + ' ms promedio (1 único viaje SQL en ejecución real)');
    }
}

function consultarUrl(urlCompleta) {
    return new Promise(function (resolve, reject) {
        const inicio = process.hrtime.bigint();
        http.get(urlCompleta, function (res) {
            const chunks = [];
            res.on('data', function (c) { chunks.push(c); });
            res.on('end', function () {
                const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
                resolve({ status: res.statusCode, bytes: Buffer.concat(chunks).length, ms: ms });
            });
        }).on('error', reject);
    });
}

async function medirEndpointsVivos(baseUrl, slug) {
    console.log('\n=== Medición HTTP en vivo contra ' + baseUrl + ' ===');
    const rutas = [
        '/api/health/live',
        '/api/health/ready',
        '/api/organizaciones/' + encodeURIComponent(slug) + '/eventos'
    ];
    for (const ruta of rutas) {
        const muestras = [];
        for (let i = 0; i < 10; i++) {
            const r = await consultarUrl(baseUrl.replace(/\/+$/, '') + ruta);
            muestras.push(r);
        }
        const promedio = muestras.reduce(function (acc, item) { return acc + item.ms; }, 0) / muestras.length;
        console.log(
            ruta + ' -> status=' + muestras[muestras.length - 1].status +
            ' | promedio=' + promedio.toFixed(2) + ' ms (10 solicitudes)'
        );
    }
}

async function main() {
    const args = process.argv.slice(2);
    const idxLive = args.indexOf('--live');
    const idxSlug = args.indexOf('--slug');
    const slug = idxSlug !== -1 && args[idxSlug + 1] ? args[idxSlug + 1] : 'upc';

    medirAsociacion();
    medirConstruccionLote();

    if (idxLive !== -1 && args[idxLive + 1]) {
        await medirEndpointsVivos(args[idxLive + 1], slug);
    } else {
        console.log('\nMedición HTTP/SQL en vivo pendiente. Ejecuta con --live http://localhost:3000 --slug upc cuando el servidor esté activo.');
    }
}

main().catch(function (err) {
    console.error('Error en benchmark:', err);
    process.exit(1);
});
