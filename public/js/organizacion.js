const params = new URLSearchParams(window.location.search);
const slugOrg = (params.get('org') || '').trim().toLowerCase();

const estadoOrgError = document.querySelector('#estadoOrgError');
const tituloOrgError = document.querySelector('#tituloOrgError');
const mensajeOrgError = document.querySelector('#mensajeOrgError');
const contenidoMicrositio = document.querySelector('#contenidoMicrositio');

const headerLogoOrg = document.querySelector('#headerLogoOrg');
const headerNombreOrg = document.querySelector('#headerNombreOrg');
const orgBannerWrap = document.querySelector('#orgBannerWrap');
const orgHeroLogo = document.querySelector('#orgHeroLogo');
const orgNombreHero = document.querySelector('#orgNombreHero');
const orgDescripcionCorta = document.querySelector('#orgDescripcionCorta');
const orgSobreTitulo = document.querySelector('#orgSobreTitulo');
const orgDescripcionCompleta = document.querySelector('#orgDescripcionCompleta');
const orgCorreoContacto = document.querySelector('#orgCorreoContacto');
const footerOrgTexto = document.querySelector('#footerOrgTexto');

const botonExplorar = document.querySelector('#botonExplorar');
const seccionEventos = document.querySelector('#eventos');
const contenedorEventos = document.querySelector('#contenedorEventos');
const selectorEvento = document.querySelector('#evento');
const mensajeSinResultados = document.querySelector('#sinResultados');
const buscador = document.querySelector('#buscadorEventos');
const filtrosCategorias = document.querySelector('#filtrosCategorias');

const seccionDetalles = document.querySelector('#detallesEvento');
const botonCerrarDetalles = document.querySelector('#cerrarDetalles');
const detalleTitulo = document.querySelector('#detalleTitulo');
const detalleCategoria = document.querySelector('#detalleCategoria');
const detalleFecha = document.querySelector('#detalleFecha');
const detalleLugar = document.querySelector('#detalleLugar');
const detalleHorario = document.querySelector('#detalleHorario');
const detalleCupos = document.querySelector('#detalleCupos');
const detalleDescripcion = document.querySelector('#detalleDescripcion');
const detalleActividades = document.querySelector('#detalleActividades');
const botonInscribirDesdeDetalles = document.querySelector('#detalleInscribirse');

const formulario = document.querySelector('#formularioInscripcion');
const mensajeInscripcion = document.querySelector('#mensajeInscripcion');

const INTERVALO_POLLING_EVENTOS_MS = 60000;

let organizacionActual = null;
let eventos = {};
let ultimaHuellaEventos = '';
let categoriaSeleccionada = 'todos';
let eventoEnDetalle = null;
let cargaEventosEnCurso = null;
let colaRevalidacionEventos = null;
let huboErrorCargaEventos = false;
let controladorPollingEventos = null;

if (botonExplorar && seccionEventos) {
    botonExplorar.addEventListener('click', function () {
        seccionEventos.scrollIntoView({ behavior: 'smooth' });
    });
}

function mostrarErrorOrganizacion(titulo, mensaje) {
    headerNombreOrg.textContent = 'EventHub';
    contenidoMicrositio.hidden = true;
    tituloOrgError.textContent = titulo;
    mensajeOrgError.textContent = mensaje;
    estadoOrgError.hidden = false;
}

function renderizarLogoEnContenedor(contenedor, org, esPequeno) {
    crearContenidoLogoStage(contenedor, org, {
        pequeno: Boolean(esPequeno),
        colorPrimario: colorHexSeguro(org.color_primario, '#6C4AE4'),
        colorSecundario: colorHexSeguro(org.color_secundario, '#FFCA58')
    });
}

function aplicarIdentidadOrganizacion(org) {
    organizacionActual = org;
    const primario = colorHexSeguro(org.color_primario, '#6C4AE4');
    const secundario = colorHexSeguro(org.color_secundario, '#FFCA58');
    const textoPrimario = colorTextoContraste(primario);

    const raiz = document.documentElement;
    raiz.style.setProperty('--org-primario', primario);
    raiz.style.setProperty('--org-secundario', secundario);
    raiz.style.setProperty('--org-texto-primario', textoPrimario);

    document.title = org.nombre + ' - EventHub';
    headerNombreOrg.textContent = org.nombre;
    orgNombreHero.textContent = org.nombre;
    orgDescripcionCorta.textContent = org.descripcion_corta;
    orgSobreTitulo.textContent = 'Sobre ' + org.nombre;
    orgDescripcionCompleta.textContent = org.descripcion;

    orgCorreoContacto.replaceChildren();
    const contacto = String(org.correo_contacto || '').trim();
    if (contacto.startsWith('https://')) {
        orgCorreoContacto.appendChild(document.createTextNode('Canal oficial: '));
        const linkContacto = document.createElement('a');
        linkContacto.href = contacto;
        linkContacto.target = '_blank';
        linkContacto.rel = 'noopener noreferrer';
        linkContacto.textContent = contacto;
        orgCorreoContacto.appendChild(linkContacto);
    } else {
        orgCorreoContacto.textContent = 'Correo oficial: ' + contacto;
    }

    footerOrgTexto.replaceChildren();
    footerOrgTexto.appendChild(document.createTextNode('Espacio de ' + org.nombre + ' en EventHub · Demostración académica · '));
    const enlaceHome = document.createElement('a');
    enlaceHome.href = 'index.html';
    enlaceHome.className = 'footer-home-link';
    enlaceHome.textContent = 'Ir al inicio';
    footerOrgTexto.appendChild(enlaceHome);

    renderizarLogoEnContenedor(headerLogoOrg, org, true);
    renderizarLogoEnContenedor(orgHeroLogo, org, false);

    orgBannerWrap.replaceChildren();
    const urlBanner = urlImagenSegura(org.banner_url);
    if (urlBanner) {
        const bannerImg = document.createElement('img');
        bannerImg.className = 'org-hero-banner-img';
        bannerImg.src = urlBanner;
        bannerImg.alt = '';
        bannerImg.addEventListener('error', function () {
            bannerImg.remove();
        });
        orgBannerWrap.appendChild(bannerImg);
    }

    estadoOrgError.hidden = true;
    contenidoMicrositio.hidden = false;
}

function crearTarjeta(evento) {
    const cupos = Number(evento.cupos_disponibles);
    const agotado = cupos <= 0;

    const tarjeta = document.createElement('article');
    tarjeta.className = 'event-card glass-panel';
    tarjeta.dataset.category = evento.categoria_slug;

    const info = document.createElement('div');
    info.className = 'event-info';

    const cabecera = document.createElement('div');
    cabecera.className = 'event-card-top';

    const categoria = document.createElement('span');
    categoria.className = 'event-category';
    categoria.textContent = evento.categoria_nombre;

    const badgeCupos = document.createElement('span');
    badgeCupos.className = 'event-capacity-badge' + (agotado ? ' agotado' : '');
    badgeCupos.textContent = agotado
        ? 'Agotado'
        : cupos + ' cupo' + (cupos === 1 ? '' : 's') + ' disp.';

    cabecera.appendChild(categoria);
    cabecera.appendChild(badgeCupos);

    const titulo = document.createElement('h3');
    titulo.textContent = evento.titulo;

    const resumen = document.createElement('p');
    resumen.className = 'event-meta';
    resumen.textContent = formatearFecha(evento.fecha_evento, false) + ' · ' + evento.lugar;

    const capacidadInfo = document.createElement('p');
    capacidadInfo.className = 'event-capacity-detail';
    capacidadInfo.textContent =
        'Capacidad: ' + evento.capacidad + ' · Inscritos: ' + evento.inscritos_vigentes;

    const pie = document.createElement('div');
    pie.className = 'event-footer';

    const botonDetalles = document.createElement('button');
    botonDetalles.type = 'button';
    botonDetalles.classList.add('btn', 'btn-detalles');
    botonDetalles.dataset.id = evento.id_evento;
    botonDetalles.textContent = 'Ver detalles';

    pie.appendChild(botonDetalles);

    if (agotado) {
        const botonAgotado = document.createElement('button');
        botonAgotado.type = 'button';
        botonAgotado.classList.add('btn', 'btn-agotado');
        botonAgotado.disabled = true;
        botonAgotado.textContent = 'Agotado';
        pie.appendChild(botonAgotado);
    } else {
        const botonInscribirse = document.createElement('a');
        botonInscribirse.href = '#inscripcion';
        botonInscribirse.classList.add('btn', 'btn-primary', 'org-btn-primario', 'btn-inscribirse');
        botonInscribirse.dataset.id = evento.id_evento;
        botonInscribirse.textContent = 'Inscribirme';
        pie.appendChild(botonInscribirse);
    }

    info.appendChild(cabecera);
    info.appendChild(titulo);
    info.appendChild(resumen);
    info.appendChild(capacidadInfo);
    info.appendChild(pie);

    tarjeta.appendChild(info);
    return tarjeta;
}

function mostrarEventos(lista) {
    eventos = {};
    contenedorEventos.replaceChildren();

    const valorPrevio = selectorEvento.value;
    while (selectorEvento.options.length > 1) {
        selectorEvento.remove(1);
    }

    lista.forEach(function (evento) {
        eventos[evento.id_evento] = evento;
        contenedorEventos.appendChild(crearTarjeta(evento));

        const agotado = Number(evento.cupos_disponibles) <= 0;
        const opcion = document.createElement('option');
        opcion.value = evento.id_evento;
        opcion.disabled = agotado;
        opcion.textContent = agotado
            ? evento.titulo + ' (Agotado)'
            : evento.titulo + ' (' + evento.cupos_disponibles + ' cupos)';
        selectorEvento.appendChild(opcion);
    });

    const opcionPrevia = eventos[valorPrevio];
    if (opcionPrevia && Number(opcionPrevia.cupos_disponibles) > 0) {
        selectorEvento.value = valorPrevio;
    } else {
        selectorEvento.value = '';
    }

    if (eventoEnDetalle !== null) {
        if (eventos[eventoEnDetalle]) {
            actualizarDetalleAbierto(eventos[eventoEnDetalle]);
        } else {
            eventoEnDetalle = null;
            seccionDetalles.hidden = true;
        }
    }

    filtrarEventos();
}

function actualizarDetalleAbierto(informacion) {
    detalleTitulo.textContent = informacion.titulo;
    detalleCategoria.textContent = 'Categoría: ' + informacion.categoria_nombre;
    detalleFecha.textContent = 'Fecha: ' + formatearFecha(informacion.fecha_evento, true);
    detalleLugar.textContent = 'Lugar: ' + informacion.lugar;
    detalleHorario.textContent = 'Horario: ' + informacion.horario;
    actualizarMetaDetalle(informacion);
    detalleDescripcion.textContent = informacion.descripcion;

    detalleActividades.replaceChildren();
    informacion.actividades.forEach(function (actividad) {
        const elemento = document.createElement('li');
        elemento.textContent = actividad.descripcion_actividad;
        detalleActividades.appendChild(elemento);
    });
}

function actualizarMetaDetalle(informacion) {
    const cupos = Number(informacion.cupos_disponibles);
    const agotado = cupos <= 0;
    detalleCupos.textContent = agotado
        ? 'Cupos: Agotado (Capacidad: ' + informacion.capacidad + ', Inscritos: ' + informacion.inscritos_vigentes + ')'
        : 'Cupos disponibles: ' + cupos + ' de ' + informacion.capacidad + ' (Inscritos: ' + informacion.inscritos_vigentes + ')';

    botonInscribirDesdeDetalles.disabled = agotado;
    botonInscribirDesdeDetalles.textContent = agotado ? 'Agotado' : 'Inscribirme';
}

function mostrarDetalles(idEvento) {
    const informacion = eventos[idEvento];
    if (!informacion) return;

    eventoEnDetalle = informacion.id_evento;
    actualizarDetalleAbierto(informacion);

    seccionDetalles.hidden = false;
    seccionDetalles.scrollIntoView({ behavior: 'smooth' });
}

function filtrarEventos() {
    const texto = buscador.value.toLowerCase().trim();
    const tarjetas = contenedorEventos.querySelectorAll('.event-card');
    let encontrados = 0;

    tarjetas.forEach(function (tarjeta) {
        const contenido = tarjeta.textContent.toLowerCase();
        const categoria = tarjeta.dataset.category;
        const coincideTexto = contenido.includes(texto);
        const coincideCategoria = categoriaSeleccionada === 'todos' || categoria === categoriaSeleccionada;

        if (coincideTexto && coincideCategoria) {
            tarjeta.hidden = false;
            encontrados++;
        } else {
            tarjeta.hidden = true;
        }
    });

    mensajeSinResultados.hidden = encontrados > 0;
}

async function cargarCategorias() {
    try {
        const categorias = await api('/api/categorias');
        filtrosCategorias.replaceChildren();

        const btnTodos = document.createElement('button');
        btnTodos.type = 'button';
        btnTodos.className = 'filter-btn active';
        btnTodos.dataset.filter = 'todos';
        btnTodos.textContent = 'Todos';
        filtrosCategorias.appendChild(btnTodos);

        categorias.forEach(function (c) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'filter-btn';
            btn.dataset.filter = c.slug;
            btn.textContent = c.nombre;
            filtrosCategorias.appendChild(btn);
        });
    } catch (error) {
        // Conserva el botón "Todos" si fallan las categorías
    }
}

async function cargarEventos(opciones) {
    if (!organizacionActual) return;

    const opts = opciones || {};
    const forzar = Boolean(opts.forzar);

    if (cargaEventosEnCurso) {
        if (forzar) {
            if (!colaRevalidacionEventos) {
                colaRevalidacionEventos = cargaEventosEnCurso.then(function () {
                    colaRevalidacionEventos = null;
                    return cargarEventos({ forzar: false });
                });
            }
            return colaRevalidacionEventos;
        }
        return cargaEventosEnCurso;
    }

    cargaEventosEnCurso = (async function () {
        try {
            const lista = await api('/api/organizaciones/' + encodeURIComponent(slugOrg) + '/eventos');
            mensajeSinResultados.textContent = 'No se encontraron eventos.';

            const huella = JSON.stringify(lista);
            if (huella !== ultimaHuellaEventos) {
                ultimaHuellaEventos = huella;
                mostrarEventos(lista);
            } else if (huboErrorCargaEventos) {
                filtrarEventos();
            }
            huboErrorCargaEventos = false;

            if (lista.length === 0) {
                mensajeSinResultados.textContent = 'Esta organización aún no tiene eventos publicados.';
                mensajeSinResultados.hidden = false;
            }
        } catch (error) {
            huboErrorCargaEventos = true;
            mensajeSinResultados.textContent = 'No se pudieron cargar los eventos: ' + error.message;
            mensajeSinResultados.hidden = false;
        } finally {
            cargaEventosEnCurso = null;
        }
    })();

    return cargaEventosEnCurso;
}

buscador.addEventListener('input', filtrarEventos);

filtrosCategorias.addEventListener('click', function (evento) {
    const boton = evento.target.closest('.filter-btn');
    if (!boton) return;

    categoriaSeleccionada = boton.dataset.filter;
    filtrosCategorias.querySelectorAll('.filter-btn').forEach(function (btn) {
        btn.classList.remove('active');
    });
    boton.classList.add('active');
    filtrarEventos();
});

contenedorEventos.addEventListener('click', function (evento) {
    const botonDetalles = evento.target.closest('.btn-detalles');
    if (botonDetalles) {
        mostrarDetalles(Number(botonDetalles.dataset.id));
        return;
    }

    const botonInscribirse = evento.target.closest('.btn-inscribirse');
    if (botonInscribirse) {
        selectorEvento.value = botonInscribirse.dataset.id;
    }
});

botonCerrarDetalles.addEventListener('click', function () {
    seccionDetalles.hidden = true;
    seccionEventos.scrollIntoView({ behavior: 'smooth' });
});

botonInscribirDesdeDetalles.addEventListener('click', function () {
    if (eventoEnDetalle !== null && !botonInscribirDesdeDetalles.disabled) {
        selectorEvento.value = eventoEnDetalle;
        document.querySelector('#inscripcion').scrollIntoView({ behavior: 'smooth' });
    }
});

formulario.addEventListener('submit', async function (evento) {
    evento.preventDefault();

    const nombre = document.querySelector('#nombre').value.trim();
    const correo = document.querySelector('#correo').value.trim();
    const idEvento = Number(selectorEvento.value);
    const botonConfirmar = formulario.querySelector('button[type="submit"]');

    if (!idEvento) {
        mensajeInscripcion.classList.add('mensaje-error');
        mensajeInscripcion.textContent = 'Selecciona un evento disponible.';
        mensajeInscripcion.hidden = false;
        return;
    }

    botonConfirmar.disabled = true;

    try {
        await api('/api/inscripciones', {
            method: 'POST',
            body: JSON.stringify({
                nombre: nombre,
                correo: correo,
                id_evento: idEvento
            })
        });

        mensajeInscripcion.classList.remove('mensaje-error');
        mensajeInscripcion.textContent = '¡Inscripción realizada correctamente, ' + nombre + '!';
        mensajeInscripcion.hidden = false;
        formulario.reset();

        ultimaHuellaEventos = '';
        await cargarEventos({ forzar: true });
    } catch (error) {
        mensajeInscripcion.classList.add('mensaje-error');
        mensajeInscripcion.textContent = error.message;
        mensajeInscripcion.hidden = false;
        if (error.message.toLowerCase().includes('agotado') || error.message.toLowerCase().includes('capacidad')) {
            ultimaHuellaEventos = '';
            cargarEventos({ forzar: true });
        }
    } finally {
        botonConfirmar.disabled = false;
    }
});

function iniciarPollingEventos() {
    if (!controladorPollingEventos) {
        controladorPollingEventos = crearControladorPolling({
            tarea: function () { return cargarEventos({ forzar: false }); },
            intervaloMs: INTERVALO_POLLING_EVENTOS_MS,
            revalidarAlMostrar: true
        });
    }
    controladorPollingEventos.iniciar({ ejecutarInmediato: false });
}

async function iniciarMicrositio() {
    if (!slugOrg) {
        mostrarErrorOrganizacion(
            'No se especificó una organización',
            'Selecciona una organización desde el inicio de EventHub para explorar sus eventos.'
        );
        return;
    }

    try {
        const org = await api('/api/organizaciones/' + encodeURIComponent(slugOrg));
        aplicarIdentidadOrganizacion(org);
        await cargarCategorias();
        await cargarEventos({ forzar: true });
        iniciarPollingEventos();
    } catch (error) {
        mostrarErrorOrganizacion('Organización no disponible', error.message);
    }
}

iniciarIndicadorInstancia('#instanciaServidor');
iniciarMicrositio();
