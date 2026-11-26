const contenedorOrganizaciones = document.querySelector('#contenedorOrganizaciones');
const estadoOrganizaciones = document.querySelector('#estadoOrganizaciones');
const paginacionOrganizaciones = document.querySelector('#paginacionOrganizaciones');
const contadorOrganizaciones = document.querySelector('#contadorOrganizaciones');
const botonVerMasOrgs = document.querySelector('#botonVerMasOrgs');
const textoVerMasOrgs = document.querySelector('#textoVerMasOrgs');
const buscadorOrganizaciones = document.querySelector('#buscadorOrganizaciones');
const filtrosDirectorio = document.querySelector('#filtrosDirectorio');
const botonExplorarOrgs = document.querySelector('#botonExplorarOrgs');
const seccionOrganizaciones = document.querySelector('#organizaciones');

const ORGS_INICIALES = 6;
const ORGS_INCREMENTO = 5;

const SECTOR_POR_SLUG = {
    microsoft: 'tecnologia',
    samsung: 'tecnologia',
    playstation: 'gaming',
    'riot-games': 'gaming',
    upc: 'educacion',
    pucp: 'educacion',
    utec: 'educacion',
    falabella: 'retail',
    'plaza-vea': 'retail',
    bcp: 'finanzas',
    yape: 'finanzas',
    spotify: 'entretenimiento',
    'red-bull': 'deportes',
    nike: 'deportes',
    'marca-peru': 'cultura'
};

let sectorSeleccionado = 'todos';

const formularioConsulta = document.querySelector('#formularioConsulta');
const campoCorreoConsulta = document.querySelector('#correoConsulta');
const listaInscripciones = document.querySelector('#listaInscripciones');
const mensajeVacio = document.querySelector('#mensajeVacio');

let organizacionesCargadas = [];
let organizacionesFiltradas = [];
let limiteVisibleOrgs = ORGS_INICIALES;
let correoActual = '';

if (botonExplorarOrgs && seccionOrganizaciones) {
    botonExplorarOrgs.addEventListener('click', function () {
        seccionOrganizaciones.scrollIntoView({ behavior: 'smooth' });
    });
}

const heroBgImg = document.querySelector('.hero-bg-img');
if (heroBgImg) {
    heroBgImg.addEventListener('error', function () {
        heroBgImg.remove();
    });
}

function crearLogoOrganizacion(org, colorPrimario, colorSecundario) {
    const marco = document.createElement('div');
    marco.className = 'org-logo-wrap';
    crearContenidoLogoStage(marco, org, {
        colorPrimario: colorPrimario,
        colorSecundario: colorSecundario,
        lazy: true
    });
    return marco;
}

function crearTarjetaOrganizacion(org) {
    const colorPrimario = colorHexSeguro(org.color_primario, '#6C4AE4');
    const colorSecundario = colorHexSeguro(org.color_secundario, '#FFCA58');
    const textoPrimario = colorTextoContraste(colorPrimario);

    const tarjeta = document.createElement('article');
    tarjeta.className = 'org-banner-card glass-panel';
    tarjeta.style.setProperty('--org-primario', colorPrimario);
    tarjeta.style.setProperty('--org-secundario', colorSecundario);
    tarjeta.style.setProperty('--org-texto-primario', textoPrimario);

    const urlBanner = urlImagenSegura(org.banner_url);
    if (urlBanner) {
        const capaBanner = document.createElement('img');
        capaBanner.className = 'org-banner-backdrop';
        capaBanner.src = urlBanner;
        capaBanner.alt = '';
        capaBanner.setAttribute('aria-hidden', 'true');
        capaBanner.loading = 'lazy';
        capaBanner.addEventListener('error', function () {
            capaBanner.remove();
        });
        tarjeta.appendChild(capaBanner);
    }

    const franja = document.createElement('div');
    franja.className = 'org-accent-strip';
    franja.setAttribute('aria-hidden', 'true');
    tarjeta.appendChild(franja);

    const logo = crearLogoOrganizacion(org, colorPrimario, colorSecundario);
    tarjeta.appendChild(logo);

    const cuerpo = document.createElement('div');
    cuerpo.className = 'org-card-body';

    const encabezado = document.createElement('div');
    encabezado.className = 'org-card-head';

    const titulo = document.createElement('h3');
    titulo.textContent = org.nombre;

    const insignia = document.createElement('span');
    insignia.className = 'org-badge';
    insignia.textContent = 'Organización';

    encabezado.appendChild(titulo);
    encabezado.appendChild(insignia);

    const descripcion = document.createElement('p');
    descripcion.className = 'org-card-desc';
    descripcion.textContent = org.descripcion_corta;

    const meta = document.createElement('p');
    meta.className = 'org-card-meta';
    const contacto = String(org.correo_contacto || '').trim();
    if (contacto.startsWith('https://')) {
        meta.appendChild(document.createTextNode('Canal oficial: '));
        const linkContacto = document.createElement('a');
        linkContacto.href = contacto;
        linkContacto.target = '_blank';
        linkContacto.rel = 'noopener noreferrer';
        linkContacto.textContent = contacto.replace(/^https:\/\//, '');
        meta.appendChild(linkContacto);
    } else {
        meta.textContent = 'Contacto: ' + contacto;
    }

    cuerpo.appendChild(encabezado);
    cuerpo.appendChild(descripcion);
    cuerpo.appendChild(meta);
    tarjeta.appendChild(cuerpo);

    const acciones = document.createElement('div');
    acciones.className = 'org-card-actions';

    const enlace = document.createElement('a');
    enlace.className = 'btn btn-primary org-btn-primario org-cta';
    enlace.href = 'organizacion.html?org=' + encodeURIComponent(org.slug);
    enlace.textContent = 'Explorar organización';
    enlace.setAttribute('aria-label', 'Explorar organización ' + org.nombre);

    acciones.appendChild(enlace);
    tarjeta.appendChild(acciones);

    return tarjeta;
}

function renderizarOrganizaciones() {
    contenedorOrganizaciones.replaceChildren();
    const total = organizacionesFiltradas.length;

    if (total === 0) {
        estadoOrganizaciones.textContent = 'No se encontraron organizaciones con ese criterio.';
        estadoOrganizaciones.hidden = false;
        if (paginacionOrganizaciones) paginacionOrganizaciones.hidden = true;
        if (contadorOrganizaciones) contadorOrganizaciones.textContent = '';
        return;
    }

    estadoOrganizaciones.hidden = true;
    const visibles = organizacionesFiltradas.slice(0, limiteVisibleOrgs);
    visibles.forEach(function (org) {
        contenedorOrganizaciones.appendChild(crearTarjetaOrganizacion(org));
    });

    if (paginacionOrganizaciones && contadorOrganizaciones && botonVerMasOrgs && textoVerMasOrgs) {
        paginacionOrganizaciones.hidden = false;
        contadorOrganizaciones.textContent =
            'Se muestran ' + visibles.length + ' de ' + total +
            (total === 1 ? ' organización.' : ' organizaciones.');

        if (total <= ORGS_INICIALES) {
            botonVerMasOrgs.hidden = true;
        } else if (visibles.length < total) {
            botonVerMasOrgs.hidden = false;
            botonVerMasOrgs.dataset.modo = 'mas';
            botonVerMasOrgs.setAttribute('aria-expanded', 'false');
            textoVerMasOrgs.textContent = 'Ver más organizaciones';
        } else {
            botonVerMasOrgs.hidden = false;
            botonVerMasOrgs.dataset.modo = 'menos';
            botonVerMasOrgs.setAttribute('aria-expanded', 'true');
            textoVerMasOrgs.textContent = 'Ver menos';
        }
    }
}

function filtrarOrganizaciones() {
    const termino = buscadorOrganizaciones.value.trim().toLowerCase();
    limiteVisibleOrgs = ORGS_INICIALES;
    organizacionesFiltradas = organizacionesCargadas.filter(function (org) {
        const sector = SECTOR_POR_SLUG[org.slug] || 'otros';
        const coincideSector = sectorSeleccionado === 'todos' || sector === sectorSeleccionado;
        if (!coincideSector) return false;
        if (!termino) return true;
        const texto = (org.nombre + ' ' + org.descripcion_corta + ' ' + org.slug).toLowerCase();
        return texto.includes(termino);
    });
    renderizarOrganizaciones();
}

async function cargarOrganizaciones() {
    estadoOrganizaciones.textContent = 'Cargando organizaciones...';
    estadoOrganizaciones.hidden = false;

    try {
        organizacionesCargadas = await api('/api/organizaciones');
        if (organizacionesCargadas.length === 0) {
            contenedorOrganizaciones.replaceChildren();
            estadoOrganizaciones.textContent = 'Aún no hay organizaciones activas disponibles.';
            estadoOrganizaciones.hidden = false;
            return;
        }
        filtrarOrganizaciones();
    } catch (error) {
        contenedorOrganizaciones.replaceChildren();
        estadoOrganizaciones.textContent = 'No se pudieron cargar las organizaciones: ' + error.message;
        estadoOrganizaciones.hidden = false;
    }
}

function mostrarInscripciones(inscripciones) {
    listaInscripciones.replaceChildren();
    mensajeVacio.textContent = 'No encontramos inscripciones registradas para ese correo.';
    mensajeVacio.hidden = inscripciones.length > 0;

    inscripciones.forEach(function (inscripcion) {
        const tarjeta = document.createElement('article');
        tarjeta.className = 'registration-card glass-panel';

        const titulo = document.createElement('h3');
        titulo.textContent = inscripcion.evento;

        if (inscripcion.organizacion_nombre) {
            const orgInfo = document.createElement('p');
            orgInfo.textContent = 'Organización: ' + inscripcion.organizacion_nombre;
            tarjeta.appendChild(titulo);
            tarjeta.appendChild(orgInfo);
        } else {
            tarjeta.appendChild(titulo);
        }

        const participante = document.createElement('p');
        participante.textContent = 'Participante: ' + inscripcion.nombre_completo;

        const correo = document.createElement('p');
        correo.textContent = 'Correo: ' + inscripcion.correo + ' · Estado: ' + inscripcion.estado;

        const botonEliminar = document.createElement('button');
        botonEliminar.type = 'button';
        botonEliminar.textContent = 'Eliminar inscripción';
        botonEliminar.className = 'btn-eliminar';
        botonEliminar.dataset.id = inscripcion.id_inscripcion;

        tarjeta.appendChild(participante);
        tarjeta.appendChild(correo);
        tarjeta.appendChild(botonEliminar);
        listaInscripciones.appendChild(tarjeta);
    });
}

async function cargarInscripciones() {
    if (!correoActual) {
        listaInscripciones.replaceChildren();
        mensajeVacio.textContent = 'Escribe tu correo para ver tus inscripciones.';
        mensajeVacio.hidden = false;
        return;
    }

    try {
        const lista = await api('/api/inscripciones?correo=' + encodeURIComponent(correoActual));
        mostrarInscripciones(lista);
    } catch (error) {
        listaInscripciones.replaceChildren();
        mensajeVacio.textContent = error.message;
        mensajeVacio.hidden = false;
    }
}

buscadorOrganizaciones.addEventListener('input', filtrarOrganizaciones);

if (botonVerMasOrgs) {
    botonVerMasOrgs.addEventListener('click', function () {
        if (botonVerMasOrgs.dataset.modo === 'menos') {
            limiteVisibleOrgs = ORGS_INICIALES;
            renderizarOrganizaciones();
            if (seccionOrganizaciones) {
                const reduceMotion = window.matchMedia &&
                    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                seccionOrganizaciones.scrollIntoView({
                    behavior: reduceMotion ? 'auto' : 'smooth'
                });
            }
            return;
        }
        limiteVisibleOrgs += ORGS_INCREMENTO;
        renderizarOrganizaciones();
    });
}

if (filtrosDirectorio) {
    filtrosDirectorio.addEventListener('click', function (evento) {
        const boton = evento.target.closest('.filter-btn');
        if (!boton) return;
        sectorSeleccionado = boton.dataset.sector || 'todos';
        filtrosDirectorio.querySelectorAll('.filter-btn').forEach(function (btn) {
            btn.classList.remove('active');
        });
        boton.classList.add('active');
        filtrarOrganizaciones();
    });
}

formularioConsulta.addEventListener('submit', function (evento) {
    evento.preventDefault();
    correoActual = campoCorreoConsulta.value.trim().toLowerCase();
    cargarInscripciones();
});

listaInscripciones.addEventListener('click', async function (evento) {
    const boton = evento.target.closest('.btn-eliminar');
    if (!boton) return;

    boton.disabled = true;
    try {
        await api('/api/inscripciones/' + boton.dataset.id + '?correo=' + encodeURIComponent(correoActual), {
            method: 'DELETE'
        });
        cargarInscripciones();
    } catch (error) {
        boton.disabled = false;
        mensajeVacio.textContent = error.message;
        mensajeVacio.hidden = false;
    }
});

cargarOrganizaciones();
cargarInscripciones();
consultarInstancia('#instanciaServidor');
setInterval(function () {
    consultarInstancia('#instanciaServidor');
}, 10000);
