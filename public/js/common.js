const REGEX_COLOR_HEX = /^#[0-9A-Fa-f]{6}$/;

async function api(ruta, opciones) {
    const respuesta = await fetch(ruta, Object.assign({
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
    }, opciones || {}));

    let datos = null;
    try {
        datos = await respuesta.json();
    } catch (error) {
        datos = null;
    }

    if (!respuesta.ok) {
        throw new Error((datos && datos.error) || 'Error del servidor (' + respuesta.status + ')');
    }

    return datos;
}

function colorHexSeguro(valor, respaldo) {
    const limpio = String(valor || '').trim();
    return REGEX_COLOR_HEX.test(limpio) ? limpio : respaldo;
}

function urlImagenSegura(valor) {
    if (typeof valor !== 'string') return '';
    const limpio = valor.trim();
    if (limpio.startsWith('https://') || limpio.startsWith('http://')) {
        return limpio;
    }
    if (limpio.startsWith('/') && !limpio.startsWith('//')) {
        return limpio;
    }
    return '';
}

function obtenerIniciales(nombre) {
    const palabras = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return 'EH';
    if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

function aplicarVarianteLogoStage(stage, variante) {
    stage.classList.remove('logo-stage-light', 'logo-stage-dark');
    stage.classList.add(variante === 'dark' ? 'logo-stage-dark' : 'logo-stage-light');
}

function detectarVarianteLogoStage(img, stage) {
    try {
        const w = 24;
        const h = 24;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let sumaLum = 0;
        let visibles = 0;

        for (let i = 0; i < data.length; i += 4) {
            const alfa = data[i + 3];
            if (alfa > 40) {
                const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
                sumaLum += lum;
                visibles++;
            }
        }

        if (visibles > 0) {
            const promedio = sumaLum / visibles;
            aplicarVarianteLogoStage(stage, promedio > 0.72 ? 'dark' : 'light');
        }
    } catch (e) {
        aplicarVarianteLogoStage(stage, 'light');
    }
}

function crearContenidoLogoStage(stage, org, opciones) {
    const opts = opciones || {};
    stage.classList.add('logo-stage');
    if (opts.pequeno) {
        stage.classList.add('logo-stage-sm');
    }
    aplicarVarianteLogoStage(stage, 'light');
    stage.replaceChildren();

    const fallback = document.createElement('span');
    fallback.className = 'org-logo-fallback' + (opts.pequeno ? ' org-logo-fallback-sm' : '');
    fallback.textContent = obtenerIniciales(org.nombre);
    fallback.setAttribute('aria-hidden', 'true');
    if (opts.colorPrimario) fallback.style.setProperty('--org-primario', opts.colorPrimario);
    if (opts.colorSecundario) fallback.style.setProperty('--org-secundario', opts.colorSecundario);

    const urlLogo = urlImagenSegura(org.logo_url);
    if (!urlLogo) {
        stage.appendChild(fallback);
        return;
    }

    const img = document.createElement('img');
    img.className = 'org-logo-img';
    img.src = urlLogo;
    img.alt = opts.alt || ('Logo de ' + org.nombre);
    if (opts.lazy) img.loading = 'lazy';

    img.addEventListener('load', function () {
        detectarVarianteLogoStage(img, stage);
    });
    img.addEventListener('error', function () {
        img.remove();
        aplicarVarianteLogoStage(stage, 'light');
        if (!stage.contains(fallback)) {
            stage.appendChild(fallback);
        }
    });

    stage.appendChild(img);
}

function colorTextoContraste(hex) {
    if (!REGEX_COLOR_HEX.test(String(hex || ''))) return '#FFFFFF';
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminancia > 0.62 ? '#1E1933' : '#FFFFFF';
}

function formatearFecha(fechaISO, conAnio) {
    const partes = String(fechaISO || '').split('-').map(Number);
    if (partes.length !== 3) return String(fechaISO || '');
    const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
    const opciones = conAnio
        ? { day: 'numeric', month: 'long', year: 'numeric' }
        : { day: 'numeric', month: 'long' };
    return fecha.toLocaleDateString('es-PE', opciones);
}

const INTERVALO_INDICADOR_INSTANCIA_MS = 300000;

function crearControladorPolling(opciones) {
    const opts = opciones || {};
    const tarea = opts.tarea;
    const intervaloMs = Number(opts.intervaloMs);
    const revalidarAlMostrar = opts.revalidarAlMostrar !== false;
    const doc = opts.doc !== undefined ? opts.doc : (typeof document !== 'undefined' ? document : null);
    const win = opts.win !== undefined ? opts.win : (typeof window !== 'undefined' ? window : null);
    const setIntervalFn = opts.setIntervalFn || setInterval;
    const clearIntervalFn = opts.clearIntervalFn || clearInterval;

    let activo = false;
    let detenidoManualmente = false;
    let temporizador = null;
    let enCurso = null;
    let colaForzada = null;
    let listenersRegistrados = false;

    function limpiarIntervalo() {
        if (temporizador !== null) {
            clearIntervalFn(temporizador);
            temporizador = null;
        }
    }

    function ejecutar(opcionesEjec) {
        const forzar = Boolean(opcionesEjec && opcionesEjec.forzar);
        if (enCurso) {
            if (forzar) {
                if (!colaForzada) {
                    colaForzada = enCurso.then(function () {
                        colaForzada = null;
                        if (detenidoManualmente) return;
                        return ejecutar({ forzar: false });
                    });
                }
                return colaForzada;
            }
            return enCurso;
        }

        enCurso = (async function () {
            try {
                return await tarea();
            } catch (error) {
                // Los errores transitorios se manejan dentro de cada tarea sin detener el polling.
            } finally {
                enCurso = null;
            }
        })();

        return enCurso;
    }

    function programarIntervalo() {
        limpiarIntervalo();
        if (!activo || !Number.isFinite(intervaloMs) || intervaloMs <= 0) return;
        if (doc && doc.hidden) return;

        temporizador = setIntervalFn(function () {
            if (!activo || (doc && doc.hidden)) return;
            ejecutar({ forzar: false });
        }, intervaloMs);
    }

    function alCambiarVisibilidad() {
        if (!activo || !doc) return;
        if (doc.hidden) {
            limpiarIntervalo();
            return;
        }
        programarIntervalo();
        if (revalidarAlMostrar) {
            ejecutar({ forzar: true });
        }
    }

    function alDescargarPagina() {
        detener();
    }

    function registrarListeners() {
        if (listenersRegistrados) return;
        if (doc && typeof doc.addEventListener === 'function') {
            doc.addEventListener('visibilitychange', alCambiarVisibilidad);
        }
        if (win && typeof win.addEventListener === 'function') {
            win.addEventListener('pagehide', alDescargarPagina);
        }
        listenersRegistrados = true;
    }

    function quitarListeners() {
        if (!listenersRegistrados) return;
        if (doc && typeof doc.removeEventListener === 'function') {
            doc.removeEventListener('visibilitychange', alCambiarVisibilidad);
        }
        if (win && typeof win.removeEventListener === 'function') {
            win.removeEventListener('pagehide', alDescargarPagina);
        }
        listenersRegistrados = false;
    }

    function iniciar(opcionesInicio) {
        const optsIni = opcionesInicio || {};
        activo = true;
        detenidoManualmente = false;
        registrarListeners();
        if (optsIni.ejecutarInmediato) {
            ejecutar({ forzar: false });
        }
        programarIntervalo();
    }

    function detener() {
        activo = false;
        detenidoManualmente = true;
        limpiarIntervalo();
        quitarListeners();
    }

    return {
        iniciar: iniciar,
        detener: detener,
        ejecutar: ejecutar,
        estaActivo: function () { return activo; },
        tieneTemporizadorActivo: function () { return temporizador !== null; },
        estaEnCurso: function () { return enCurso !== null; }
    };
}

const consultasInstanciaEnCurso = new Map();
const controladoresInstancia = new Map();

async function consultarInstancia(selector) {
    const claveSelector = selector || '#instanciaServidor';
    const nodo = typeof document !== 'undefined' ? document.querySelector(claveSelector) : null;
    if (!nodo) return;
    if (consultasInstanciaEnCurso.has(claveSelector)) {
        return consultasInstanciaEnCurso.get(claveSelector);
    }

    const promesa = (async function () {
        try {
            const salud = await api('/api/health');
            nodo.textContent =
                'Atendido por: ' + salud.servidor +
                ' · Base de datos: ' + salud.baseDatos;
        } catch (error) {
            nodo.textContent = 'Servidor no disponible';
        } finally {
            consultasInstanciaEnCurso.delete(claveSelector);
        }
    })();

    consultasInstanciaEnCurso.set(claveSelector, promesa);
    return promesa;
}

function iniciarIndicadorInstancia(selector, opciones) {
    const claveSelector = selector || '#instanciaServidor';
    const opts = opciones || {};
    const intervaloMs = opts.intervaloMs !== undefined ? opts.intervaloMs : INTERVALO_INDICADOR_INSTANCIA_MS;

    let controlador = controladoresInstancia.get(claveSelector);
    if (!controlador) {
        controlador = crearControladorPolling({
            tarea: function () { return consultarInstancia(claveSelector); },
            intervaloMs: intervaloMs,
            revalidarAlMostrar: true
        });
        controladoresInstancia.set(claveSelector, controlador);
    }

    controlador.iniciar({ ejecutarInmediato: true });
    return controlador;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        INTERVALO_INDICADOR_INSTANCIA_MS: INTERVALO_INDICADOR_INSTANCIA_MS,
        crearControladorPolling: crearControladorPolling
    };
}
