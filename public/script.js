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


function formatearFecha(fechaISO, conAnio) {

    const partes = fechaISO.split('-').map(Number);
    const fecha = new Date(partes[0], partes[1] - 1, partes[2]);

    const opciones = conAnio
        ? { day: 'numeric', month: 'long', year: 'numeric' }
        : { day: 'numeric', month: 'long' };

    return fecha.toLocaleDateString('es-PE', opciones);

}


const botonExplorar = document.querySelector('#botonExplorar');
const seccionEventos = document.querySelector('#eventos');

botonExplorar.addEventListener('click', function() {
    seccionEventos.scrollIntoView({
        behavior: 'smooth'
    });
});


const contenedorEventos = document.querySelector('#contenedorEventos');
const selectorEvento = document.querySelector('#evento');
const mensajeSinResultados = document.querySelector('#sinResultados');


let eventos = {};

let ultimaHuellaEventos = '';


function crearTarjeta(evento) {

    const tarjeta = document.createElement('article');
    tarjeta.classList.add('event-card');
    tarjeta.dataset.category = evento.categoria_slug;

    const info = document.createElement('div');
    info.classList.add('event-info');

    const categoria = document.createElement('span');
    categoria.classList.add('event-category');
    categoria.textContent = evento.categoria_nombre;

    const titulo = document.createElement('h3');
    titulo.textContent = evento.titulo;

    const resumen = document.createElement('p');
    resumen.textContent = formatearFecha(evento.fecha_evento, false) + ' · ' + evento.lugar;

    const pie = document.createElement('div');
    pie.classList.add('event-footer');

    const botonDetalles = document.createElement('button');
    botonDetalles.classList.add('btn', 'btn-detalles');
    botonDetalles.dataset.id = evento.id_evento;
    botonDetalles.textContent = 'Ver detalles';

    const botonInscribirse = document.createElement('a');
    botonInscribirse.href = '#inscripcion';
    botonInscribirse.classList.add('btn', 'btn-primary', 'btn-inscribirse');
    botonInscribirse.dataset.id = evento.id_evento;
    botonInscribirse.textContent = 'Inscribirme';

    pie.appendChild(botonDetalles);
    pie.appendChild(botonInscribirse);

    info.appendChild(categoria);
    info.appendChild(titulo);
    info.appendChild(resumen);
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

    lista.forEach(function(evento) {

        eventos[evento.id_evento] = evento;

        contenedorEventos.appendChild(crearTarjeta(evento));

        const opcion = document.createElement('option');
        opcion.value = evento.id_evento;
        opcion.textContent = evento.titulo;
        selectorEvento.appendChild(opcion);

    });

    selectorEvento.value = valorPrevio;

    filtrarEventos();

}


async function cargarEventos() {

    try {

        const lista = await api('/api/eventos');

        mensajeSinResultados.textContent = 'No se encontraron eventos.';

        const huella = JSON.stringify(lista);

        if (huella !== ultimaHuellaEventos) {

            ultimaHuellaEventos = huella;

            mostrarEventos(lista);

        }

        if (lista.length === 0) {
            mensajeSinResultados.hidden = false;
        }

    } catch (error) {

        mensajeSinResultados.textContent =
            'No se pudieron cargar los eventos: ' + error.message;

        mensajeSinResultados.hidden = false;

    }

}



const buscador = document.querySelector('#buscadorEventos');
const botonesFiltro = document.querySelectorAll('.filter-btn');

let categoriaSeleccionada = 'todos';


function filtrarEventos() {

    const texto = buscador.value.toLowerCase().trim();

    const tarjetas = document.querySelectorAll('.event-card');

    let encontrados = 0;

    tarjetas.forEach(function(tarjeta) {

        const contenido = tarjeta.textContent.toLowerCase();
        const categoria = tarjeta.dataset.category;

        const coincideTexto = contenido.includes(texto);

        const coincideCategoria =
            categoriaSeleccionada === 'todos' ||
            categoria === categoriaSeleccionada;

        if (coincideTexto && coincideCategoria) {

            tarjeta.hidden = false;
            encontrados++;

        } else {

            tarjeta.hidden = true;

        }

    });

    mensajeSinResultados.hidden = encontrados > 0;

}


buscador.addEventListener('input', filtrarEventos);


botonesFiltro.forEach(function(boton) {

    boton.addEventListener('click', function() {

        categoriaSeleccionada = boton.dataset.filter;

        botonesFiltro.forEach(function(btn) {
            btn.classList.remove('active');
        });

        boton.classList.add('active');

        filtrarEventos();

    });

});



const seccionDetalles = document.querySelector('#detallesEvento');
const botonCerrarDetalles = document.querySelector('#cerrarDetalles');

const detalleTitulo = document.querySelector('#detalleTitulo');
const detalleCategoria = document.querySelector('#detalleCategoria');
const detalleFecha = document.querySelector('#detalleFecha');
const detalleLugar = document.querySelector('#detalleLugar');
const detalleHorario = document.querySelector('#detalleHorario');
const detalleDescripcion = document.querySelector('#detalleDescripcion');
const detalleActividades = document.querySelector('#detalleActividades');

let eventoEnDetalle = null;


function mostrarDetalles(idEvento) {

    const informacion = eventos[idEvento];

    if (!informacion) {
        return;
    }

    eventoEnDetalle = informacion.id_evento;

    detalleTitulo.textContent = informacion.titulo;
    detalleCategoria.textContent = 'Categoría: ' + informacion.categoria_nombre;
    detalleFecha.textContent = 'Fecha: ' + formatearFecha(informacion.fecha_evento, true);
    detalleLugar.textContent = 'Lugar: ' + informacion.lugar;
    detalleHorario.textContent = 'Horario: ' + informacion.horario;

    detalleDescripcion.textContent = informacion.descripcion;

    detalleActividades.replaceChildren();

    informacion.actividades.forEach(function(actividad) {

        const elemento = document.createElement('li');

        elemento.textContent = actividad.descripcion_actividad;

        detalleActividades.appendChild(elemento);

    });

    seccionDetalles.hidden = false;

    seccionDetalles.scrollIntoView({
        behavior: 'smooth'
    });

}


contenedorEventos.addEventListener('click', function(evento) {

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


botonCerrarDetalles.addEventListener('click', function() {

    seccionDetalles.hidden = true;

    seccionEventos.scrollIntoView({
        behavior: 'smooth'
    });

});


const botonInscribirDesdeDetalles =
    document.querySelector('#detalleInscribirse');

botonInscribirDesdeDetalles.addEventListener('click', function() {

    if (eventoEnDetalle !== null) {
        selectorEvento.value = eventoEnDetalle;
    }

});




const formulario = document.querySelector('#formularioInscripcion');
const mensajeInscripcion = document.querySelector('#mensajeInscripcion');
const listaInscripciones = document.querySelector('#listaInscripciones');
const mensajeVacio = document.querySelector('#mensajeVacio');

const formularioConsulta = document.querySelector('#formularioConsulta');
const campoCorreoConsulta = document.querySelector('#correoConsulta');

let correoActual = '';


function mostrarInscripciones(inscripciones) {

    listaInscripciones.replaceChildren();

    mensajeVacio.textContent = 'Todavía no tienes inscripciones.';
    mensajeVacio.hidden = inscripciones.length > 0;

    inscripciones.forEach(function(inscripcion) {

        const tarjeta = document.createElement('div');

        tarjeta.classList.add('registration-card');


        const titulo = document.createElement('h3');

        titulo.textContent = inscripcion.evento;


        const participante = document.createElement('p');

        participante.textContent =
            'Participante: ' + inscripcion.nombre_completo;


        const correo = document.createElement('p');

        correo.textContent =
            'Correo: ' + inscripcion.correo;


        const botonEliminar = document.createElement('button');

        botonEliminar.textContent = 'Eliminar inscripción';

        botonEliminar.classList.add('btn-eliminar');

        botonEliminar.dataset.id = inscripcion.id_inscripcion;


        tarjeta.appendChild(titulo);

        tarjeta.appendChild(participante);

        tarjeta.appendChild(correo);

        tarjeta.appendChild(botonEliminar);


        listaInscripciones.appendChild(tarjeta);

    });

}


async function cargarInscripciones() {

    if (!correoActual) {

        mostrarInscripciones([]);

        mensajeVacio.textContent = 'Escribe tu correo para ver tus inscripciones.';

        return;

    }

    try {

        const lista = await api(
            '/api/inscripciones?correo=' + encodeURIComponent(correoActual)
        );

        mostrarInscripciones(lista);

    } catch (error) {

        listaInscripciones.replaceChildren();

        mensajeVacio.textContent = error.message;

        mensajeVacio.hidden = false;

    }

}


formularioConsulta.addEventListener('submit', function(evento) {

    evento.preventDefault();

    correoActual = campoCorreoConsulta.value.trim().toLowerCase();

    cargarInscripciones();

});



formulario.addEventListener('submit', async function(evento) {

    evento.preventDefault();

    const nombre = document.querySelector('#nombre').value.trim();

    const correo = document.querySelector('#correo').value.trim();

    const botonConfirmar = formulario.querySelector('button[type="submit"]');

    botonConfirmar.disabled = true;

    try {

        await api('/api/inscripciones', {
            method: 'POST',
            body: JSON.stringify({
                nombre: nombre,
                correo: correo,
                id_evento: Number(selectorEvento.value)
            })
        });

        mensajeInscripcion.classList.remove('mensaje-error');

        mensajeInscripcion.textContent =
            '¡Inscripción realizada correctamente, ' + nombre + '!';

        mensajeInscripcion.hidden = false;

        formulario.reset();

        correoActual = correo.toLowerCase();

        campoCorreoConsulta.value = correoActual;

        cargarInscripciones();

    } catch (error) {

        mensajeInscripcion.classList.add('mensaje-error');

        mensajeInscripcion.textContent = error.message;

        mensajeInscripcion.hidden = false;

    } finally {

        botonConfirmar.disabled = false;

    }

});



listaInscripciones.addEventListener('click', async function(evento) {

    const boton = evento.target.closest('.btn-eliminar');

    if (!boton) {
        return;
    }

    boton.disabled = true;

    try {

        await api(
            '/api/inscripciones/' + boton.dataset.id +
            '?correo=' + encodeURIComponent(correoActual),
            { method: 'DELETE' }
        );

        cargarInscripciones();

    } catch (error) {

        boton.disabled = false;

        alert(error.message);

    }

});




const instanciaServidor = document.querySelector('#instanciaServidor');


async function consultarInstancia() {

    try {

        const salud = await api('/api/health');

        instanciaServidor.textContent =
            'Atendido por: ' + salud.servidor +
            ' · Base de datos: ' + salud.baseDatos;

    } catch (error) {

        instanciaServidor.textContent = 'Servidor no disponible';

    }

}



cargarEventos();

cargarInscripciones();

consultarInstancia();


setInterval(function() {

    cargarEventos();

    consultarInstancia();

}, 10000);
