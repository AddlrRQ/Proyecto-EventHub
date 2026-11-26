let token = '';
try { token = sessionStorage.getItem('eventhubToken') || ''; } catch (e) { token = ''; }

const seccionLogin = document.querySelector('#seccionLogin');
const seccionPanel = document.querySelector('#seccionPanel');
const portalTituloHeader = document.querySelector('#portalTituloHeader');
const botonSalir = document.querySelector('#botonSalir');
const enlaceMicrositio = document.querySelector('#enlaceMicrositio');
const navEnlaces = document.querySelectorAll('#navResumen, #navOrganizacion, #navEventos, #navInscripciones');

const msgLogin = document.querySelector('#msgLogin');
const msgCms = document.querySelector('#msgCms');

const resumenOrgNombre = document.querySelector('#resumenOrgNombre');
const statTotalEventos = document.querySelector('#statTotalEventos');
const statEventosActivos = document.querySelector('#statEventosActivos');
const statTotalInscripciones = document.querySelector('#statTotalInscripciones');

const formularioPerfil = document.querySelector('#formularioPerfil');
const perfilNombre = document.querySelector('#perfilNombre');
const perfilCorreo = document.querySelector('#perfilCorreo');
const perfilDescripcionCorta = document.querySelector('#perfilDescripcionCorta');
const perfilDescripcion = document.querySelector('#perfilDescripcion');
const perfilLogoUrl = document.querySelector('#perfilLogoUrl');
const perfilBannerUrl = document.querySelector('#perfilBannerUrl');
const perfilColorPrimario = document.querySelector('#perfilColorPrimario');
const perfilColorPrimarioHex = document.querySelector('#perfilColorPrimarioHex');
const perfilColorSecundario = document.querySelector('#perfilColorSecundario');
const perfilColorSecundarioHex = document.querySelector('#perfilColorSecundarioHex');

const previewBranding = document.querySelector('#previewBranding');
const previewLogo = document.querySelector('#previewLogo');
const previewNombre = document.querySelector('#previewNombre');
const previewDescCorta = document.querySelector('#previewDescCorta');
const previewBoton = document.querySelector('#previewBoton');

const formularioEvento = document.querySelector('#formularioEvento');
const listaActividades = document.querySelector('#listaActividades');
const listaEventosAdmin = document.querySelector('#listaEventosAdmin');
const vacioEventos = document.querySelector('#vacioEventos');
const listaInscripcionesAdmin = document.querySelector('#listaInscripcionesAdmin');
const vacioInscripciones = document.querySelector('#vacioInscripciones');
const selectCategoria = document.querySelector('#id_categoria');

let eventoEditando = null;
let eventosAdmin = {};

async function apiPortal(ruta, opciones) {
    const cabeceras = { 'Content-Type': 'application/json' };
    if (token) {
        cabeceras.Authorization = 'Bearer ' + token;
    }

    const respuesta = await fetch(ruta, Object.assign({ headers: cabeceras, cache: 'no-store' }, opciones || {}));
    let datos = null;
    try { datos = await respuesta.json(); } catch (e) { datos = null; }

    if (respuesta.status === 401 && token) {
        cerrarSesion('Tu sesión expiró. Inicia sesión nuevamente.');
    }

    if (!respuesta.ok) {
        throw new Error((datos && datos.error) || 'Error del servidor (' + respuesta.status + ')');
    }

    return datos;
}

function avisar(texto, esError) {
    if (!seccionLogin.hidden) return;
    msgCms.textContent = texto;
    msgCms.classList.toggle('mensaje-error', Boolean(esError));
    msgCms.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function mostrarPanel(visible) {
    seccionLogin.hidden = visible;
    seccionPanel.hidden = !visible;
    botonSalir.hidden = !visible;
    enlaceMicrositio.hidden = !visible;
    navEnlaces.forEach(function (el) { el.hidden = !visible; });
}

function cerrarSesion(mensajeLogin) {
    token = '';
    try { sessionStorage.removeItem('eventhubToken'); } catch (e) { /* sin storage */ }
    portalTituloHeader.textContent = 'Portal de Organizaciones';
    msgCms.hidden = true;
    mostrarPanel(false);
    if (mensajeLogin) {
        msgLogin.textContent = mensajeLogin;
        msgLogin.hidden = false;
    } else {
        msgLogin.hidden = true;
    }
}

function aplicarTemaPortal(primario, secundario) {
    const p = colorHexSeguro(primario, '#6C4AE4');
    const s = colorHexSeguro(secundario, '#FFCA58');
    const raiz = document.documentElement;
    raiz.style.setProperty('--org-primario', p);
    raiz.style.setProperty('--org-secundario', s);
    raiz.style.setProperty('--org-texto-primario', colorTextoContraste(p));
}

function actualizarVistaPreviaBranding() {
    const nombre = perfilNombre.value.trim() || 'Tu organización';
    const corta = perfilDescripcionCorta.value.trim() || 'Descripción corta de tu organización';
    const primario = colorHexSeguro(perfilColorPrimarioHex.value, '#6C4AE4');
    const secundario = colorHexSeguro(perfilColorSecundarioHex.value, '#FFCA58');
    const textoPrimario = colorTextoContraste(primario);

    previewBranding.style.setProperty('--org-primario', primario);
    previewBranding.style.setProperty('--org-secundario', secundario);
    previewBoton.style.backgroundColor = primario;
    previewBoton.style.color = textoPrimario;
    previewNombre.textContent = nombre;
    previewDescCorta.textContent = corta;

    const bannerPrevio = previewBranding.querySelector('.org-banner-backdrop');
    if (bannerPrevio) bannerPrevio.remove();
    const urlBanner = urlImagenSegura(perfilBannerUrl.value);
    if (urlBanner) {
        const bannerImg = document.createElement('img');
        bannerImg.className = 'org-banner-backdrop';
        bannerImg.src = urlBanner;
        bannerImg.alt = '';
        bannerImg.setAttribute('aria-hidden', 'true');
        bannerImg.addEventListener('error', function () { bannerImg.remove(); });
        previewBranding.prepend(bannerImg);
    }

    crearContenidoLogoStage(previewLogo, {
        nombre: nombre,
        logo_url: perfilLogoUrl.value
    }, {
        colorPrimario: primario,
        colorSecundario: secundario,
        alt: 'Vista previa del logo'
    });
}

function sincronizarColor(inputColor, inputHex) {
    inputColor.addEventListener('input', function () {
        inputHex.value = inputColor.value.toUpperCase();
        actualizarVistaPreviaBranding();
    });
    inputHex.addEventListener('input', function () {
        const val = inputHex.value.trim();
        if (REGEX_COLOR_HEX.test(val)) {
            inputColor.value = val;
        }
        actualizarVistaPreviaBranding();
    });
}

sincronizarColor(perfilColorPrimario, perfilColorPrimarioHex);
sincronizarColor(perfilColorSecundario, perfilColorSecundarioHex);
[perfilNombre, perfilDescripcionCorta, perfilLogoUrl, perfilBannerUrl].forEach(function (el) {
    el.addEventListener('input', actualizarVistaPreviaBranding);
});

document.querySelector('#formularioLogin').addEventListener('submit', async function (evento) {
    evento.preventDefault();
    msgLogin.hidden = true;

    try {
        const r = await apiPortal('/api/admin/login', {
            method: 'POST',
            body: JSON.stringify({
                usuario: document.querySelector('#usuario').value,
                password: document.querySelector('#password').value
            })
        });

        token = r.token;
        try { sessionStorage.setItem('eventhubToken', token); } catch (e) { /* sin storage */ }
        document.querySelector('#password').value = '';
        iniciarPanel();
    } catch (error) {
        msgLogin.textContent = error.message;
        msgLogin.hidden = false;
    }
});

botonSalir.addEventListener('click', function (evento) {
    evento.preventDefault();
    cerrarSesion();
});

async function cargarResumen() {
    const r = await apiPortal('/api/portal/resumen');
    resumenOrgNombre.textContent = r.nombre;
    portalTituloHeader.textContent = 'Portal · ' + r.nombre;
    enlaceMicrositio.href = '../organizacion.html?org=' + encodeURIComponent(r.slug);
    statTotalEventos.textContent = r.total_eventos;
    statEventosActivos.textContent = r.eventos_activos;
    statTotalInscripciones.textContent = r.total_inscripciones;
}

async function cargarPerfil() {
    const org = await apiPortal('/api/portal/perfil');
    perfilNombre.value = org.nombre;
    perfilCorreo.value = org.correo_contacto;
    perfilDescripcionCorta.value = org.descripcion_corta;
    perfilDescripcion.value = org.descripcion;
    perfilLogoUrl.value = org.logo_url || '';
    perfilBannerUrl.value = org.banner_url || '';

    const primario = colorHexSeguro(org.color_primario, '#6C4AE4').toUpperCase();
    const secundario = colorHexSeguro(org.color_secundario, '#FFCA58').toUpperCase();
    perfilColorPrimario.value = primario;
    perfilColorPrimarioHex.value = primario;
    perfilColorSecundario.value = secundario;
    perfilColorSecundarioHex.value = secundario;

    aplicarTemaPortal(primario, secundario);
    actualizarVistaPreviaBranding();
}

formularioPerfil.addEventListener('submit', async function (evento) {
    evento.preventDefault();

    const primario = perfilColorPrimarioHex.value.trim();
    const secundario = perfilColorSecundarioHex.value.trim();
    const logo = perfilLogoUrl.value.trim();
    const banner = perfilBannerUrl.value.trim();

    if (!REGEX_COLOR_HEX.test(primario) || !REGEX_COLOR_HEX.test(secundario)) {
        avisar('Los colores deben tener formato hexadecimal #RRGGBB.', true);
        return;
    }
    if (logo && !urlImagenSegura(logo)) {
        avisar('La URL del logo debe empezar con https://, http:// o /.', true);
        return;
    }
    if (banner && !urlImagenSegura(banner)) {
        avisar('La URL del banner debe empezar con https://, http:// o /.', true);
        return;
    }

    try {
        const actualizado = await apiPortal('/api/portal/perfil', {
            method: 'PUT',
            body: JSON.stringify({
                nombre: perfilNombre.value.trim(),
                correo_contacto: perfilCorreo.value.trim(),
                descripcion_corta: perfilDescripcionCorta.value.trim(),
                descripcion: perfilDescripcion.value.trim(),
                logo_url: logo || null,
                banner_url: banner || null,
                color_primario: primario,
                color_secundario: secundario
            })
        });

        aplicarTemaPortal(actualizado.color_primario, actualizado.color_secundario);
        await cargarResumen();
        avisar('Perfil y personalización guardados correctamente.', false);
    } catch (error) {
        avisar(error.message, true);
    }
});

function agregarFilaActividad(texto) {
    const fila = document.createElement('div');
    fila.classList.add('actividad-fila');

    const campo = document.createElement('input');
    campo.type = 'text';
    campo.maxLength = 200;
    campo.placeholder = 'Descripción de la actividad';
    campo.value = texto || '';

    const quitar = document.createElement('button');
    quitar.type = 'button';
    quitar.classList.add('btn-eliminar');
    quitar.textContent = 'Quitar';
    quitar.addEventListener('click', function () { fila.remove(); });

    fila.appendChild(campo);
    fila.appendChild(quitar);
    listaActividades.appendChild(fila);
}

document.querySelector('#botonAgregarActividad').addEventListener('click', function () {
    agregarFilaActividad('');
});

function reiniciarFormulario() {
    eventoEditando = null;
    formularioEvento.reset();
    document.querySelector('#capacidad').value = 100;
    document.querySelector('#activo').checked = true;
    listaActividades.replaceChildren();
    agregarFilaActividad('');

    document.querySelector('#tituloFormulario').textContent = 'Crear evento';
    document.querySelector('#botonGuardar').textContent = 'Guardar evento';
    document.querySelector('#botonCancelar').hidden = true;
}

document.querySelector('#botonCancelar').addEventListener('click', reiniciarFormulario);

formularioEvento.addEventListener('submit', async function (evento) {
    evento.preventDefault();

    const actividades = Array.from(listaActividades.querySelectorAll('input'))
        .map(function (campo) { return campo.value.trim(); })
        .filter(Boolean);

    const cuerpo = {
        titulo: document.querySelector('#titulo').value,
        id_categoria: Number(selectCategoria.value),
        fecha_evento: document.querySelector('#fecha_evento').value,
        lugar: document.querySelector('#lugar').value,
        horario: document.querySelector('#horario').value,
        capacidad: Number(document.querySelector('#capacidad').value),
        descripcion: document.querySelector('#descripcion').value,
        activo: document.querySelector('#activo').checked,
        actividades: actividades
    };

    const editando = eventoEditando !== null;

    try {
        await apiPortal(editando ? '/api/eventos/' + eventoEditando : '/api/eventos', {
            method: editando ? 'PUT' : 'POST',
            body: JSON.stringify(cuerpo)
        });

        avisar(editando ? 'Evento actualizado correctamente.' : 'Evento creado correctamente.', false);
        reiniciarFormulario();
        await Promise.all([cargarEventos(), cargarResumen()]);
    } catch (error) {
        avisar(error.message, true);
    }
});

function crearTarjetaEvento(ev) {
    const tarjeta = document.createElement('article');
    tarjeta.className = 'registration-card glass-panel';

    const titulo = document.createElement('h3');
    titulo.textContent = ev.titulo;

    const estado = document.createElement('span');
    estado.classList.add('estado');
    estado.classList.toggle('inactivo', !ev.activo);
    estado.textContent = ev.activo ? 'Visible' : 'Oculto';

    const datos = document.createElement('p');
    datos.textContent = ev.categoria_nombre + ' · ' + ev.fecha_evento + ' · ' + ev.lugar + ' · ' + ev.horario;

    const ocupacion = document.createElement('p');
    ocupacion.textContent =
        'Capacidad: ' + ev.capacidad +
        ' · Inscritos: ' + ev.inscritos_vigentes +
        ' · Cupos disponibles: ' + ev.cupos_disponibles;

    const acts = document.createElement('p');
    acts.textContent = 'Actividades: ' + (ev.actividades.length
        ? ev.actividades.map(function (a) { return a.descripcion_actividad; }).join(' | ')
        : 'ninguna');

    const acciones = document.createElement('div');
    acciones.classList.add('acciones-evento');

    const crearBoton = function (texto, clase, accion) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = clase;
        b.textContent = texto;
        b.dataset.accion = accion;
        b.dataset.id = ev.id_evento;
        return b;
    };

    acciones.appendChild(crearBoton('Editar', 'btn btn-detalles', 'editar'));
    acciones.appendChild(crearBoton(ev.activo ? 'Desactivar' : 'Activar', 'btn btn-secundario', 'alternar'));
    acciones.appendChild(crearBoton('Eliminar', 'btn-eliminar', 'eliminar'));

    tarjeta.appendChild(titulo);
    tarjeta.appendChild(estado);
    tarjeta.appendChild(datos);
    tarjeta.appendChild(ocupacion);
    tarjeta.appendChild(acts);
    tarjeta.appendChild(acciones);

    return tarjeta;
}

async function cargarEventos() {
    try {
        const lista = await apiPortal('/api/eventos?todos=1');
        eventosAdmin = {};
        listaEventosAdmin.replaceChildren();
        vacioEventos.hidden = lista.length > 0;

        lista.forEach(function (ev) {
            eventosAdmin[ev.id_evento] = ev;
            listaEventosAdmin.appendChild(crearTarjetaEvento(ev));
        });
    } catch (error) {
        avisar(error.message, true);
    }
}

function editarEvento(ev) {
    eventoEditando = ev.id_evento;

    document.querySelector('#titulo').value = ev.titulo;
    selectCategoria.value = ev.id_categoria;
    document.querySelector('#fecha_evento').value = ev.fecha_evento;
    document.querySelector('#lugar').value = ev.lugar;
    document.querySelector('#horario').value = ev.horario;
    document.querySelector('#capacidad').value = ev.capacidad;
    document.querySelector('#descripcion').value = ev.descripcion;
    document.querySelector('#activo').checked = ev.activo;

    listaActividades.replaceChildren();
    ev.actividades.forEach(function (a) { agregarFilaActividad(a.descripcion_actividad); });
    if (ev.actividades.length === 0) {
        agregarFilaActividad('');
    }

    document.querySelector('#tituloFormulario').textContent = 'Editar evento #' + ev.id_evento;
    document.querySelector('#botonGuardar').textContent = 'Guardar cambios';
    document.querySelector('#botonCancelar').hidden = false;

    formularioEvento.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

listaEventosAdmin.addEventListener('click', async function (evento) {
    const boton = evento.target.closest('button[data-accion]');
    if (!boton) return;

    const ev = eventosAdmin[boton.dataset.id];
    if (!ev) return;

    try {
        if (boton.dataset.accion === 'editar') {
            editarEvento(ev);
        } else if (boton.dataset.accion === 'alternar') {
            await apiPortal('/api/eventos/' + ev.id_evento, {
                method: 'PUT',
                body: JSON.stringify({
                    id_categoria: ev.id_categoria,
                    titulo: ev.titulo,
                    fecha_evento: ev.fecha_evento,
                    lugar: ev.lugar,
                    horario: ev.horario,
                    capacidad: ev.capacidad,
                    descripcion: ev.descripcion,
                    activo: !ev.activo
                })
            });

            avisar(ev.activo ? 'Evento desactivado.' : 'Evento activado.', false);
            await Promise.all([cargarEventos(), cargarResumen()]);
        } else if (boton.dataset.accion === 'eliminar') {
            if (!confirm('¿Eliminar "' + ev.titulo + '" definitivamente? Se borrarán también sus inscripciones.')) {
                return;
            }

            await apiPortal('/api/eventos/' + ev.id_evento + '?permanente=true', { method: 'DELETE' });
            avisar('Evento eliminado.', false);
            if (eventoEditando === ev.id_evento) {
                reiniciarFormulario();
            }
            await Promise.all([cargarEventos(), cargarInscripciones(), cargarResumen()]);
        }
    } catch (error) {
        avisar(error.message, true);
    }
});

async function cargarInscripciones() {
    try {
        const lista = await apiPortal('/api/inscripciones');
        listaInscripcionesAdmin.replaceChildren();
        vacioInscripciones.hidden = lista.length > 0;

        lista.forEach(function (i) {
            const tarjeta = document.createElement('article');
            tarjeta.className = 'registration-card glass-panel';

            const t = document.createElement('h3');
            t.textContent = i.evento;

            const p = document.createElement('p');
            p.textContent = i.nombre_completo + ' · ' + i.correo + ' · ' + i.estado;

            const b = document.createElement('button');
            b.type = 'button';
            b.classList.add('btn-eliminar');
            b.textContent = 'Eliminar inscripción';
            b.dataset.id = i.id_inscripcion;

            tarjeta.appendChild(t);
            tarjeta.appendChild(p);
            tarjeta.appendChild(b);
            listaInscripcionesAdmin.appendChild(tarjeta);
        });
    } catch (error) {
        avisar(error.message, true);
    }
}

listaInscripcionesAdmin.addEventListener('click', async function (evento) {
    const boton = evento.target.closest('.btn-eliminar');
    if (!boton) return;

    try {
        await apiPortal('/api/inscripciones/' + boton.dataset.id, { method: 'DELETE' });
        await Promise.all([cargarInscripciones(), cargarEventos(), cargarResumen()]);
    } catch (error) {
        avisar(error.message, true);
    }
});

async function iniciarPanel() {
    try {
        const categorias = await apiPortal('/api/categorias');
        selectCategoria.replaceChildren();
        categorias.forEach(function (c) {
            const opcion = document.createElement('option');
            opcion.value = c.id_categoria;
            opcion.textContent = c.nombre;
            selectCategoria.appendChild(opcion);
        });

        await Promise.all([cargarResumen(), cargarPerfil()]);
        mostrarPanel(true);
        reiniciarFormulario();
        await Promise.all([cargarEventos(), cargarInscripciones()]);
    } catch (error) {
        msgLogin.textContent = error.message;
        msgLogin.hidden = false;
    }
}

consultarInstancia('#instanciaServidor');
if (token) {
    iniciarPanel();
}
