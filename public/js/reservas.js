// Historial, detalle individual y reserva de salas (8am - 5pm)

import {
  $,
  estado,
  crearElemento,
  peticionApi,
  enviarFormulario,
  fechaActual,
  fechaLocal,
  formatearHora,
  formatearFecha,
  obtenerFranjaHoraria,
  medianoche,
  desplazarDia,
  mostrarErrorEn,
  mostrarAviso,
  sugerirHorario
} from './nucleo.js';

let alModificarReserva = null;
const filtrosGuardados = new Map();
let consultaLista = null;
let temporizadorAcciones = null;

function actualizarAccionesDetalle() {
  clearTimeout(temporizadorAcciones);
  if (!estado.detalle || !estado.usuario || !$('#detalle-dialogo').open) return;
  const restante = +new Date(estado.detalle.inicio) - Date.now();
  const gestionar = estado.detalle.estado === 'confirmada' && restante > 0;
  $('#detalle-acciones').hidden = !gestionar;
  $('#editar-reserva-boton').hidden = !gestionar;
  $('#mostrar-cancelar-boton').hidden = !gestionar;
  $('#delete-reserva-btn').hidden = !gestionar || estado.detalle.usuario_id !== estado.usuario.id;
  let motivo = $('#detail-action-note');
  if (!motivo) {
    motivo = crearElemento('p', 'atenuado');
    motivo.id = 'detail-action-note';
    $('#detalle-contenido').append(motivo);
  }
  motivo.hidden = gestionar;
  motivo.textContent = estado.detalle.estado === 'cancelada'
    ? 'Esta reunión fue cancelada o eliminada y ya no permite cambios.'
    : 'Esta reunión ya comenzó. Solo se permite editar, cancelar o eliminar antes de la hora de inicio.';
  if (!gestionar) {
    $('#cancelar-formulario').hidden = true;
    if ($('#eliminar-dialogo').open) $('#eliminar-dialogo').close();
  } else temporizadorAcciones = setTimeout(actualizarAccionesDetalle, Math.min(restante+25,2147483647));
}
const esHistorial = () => estado.vista === 'historial';

export function configurarLista(vista, limpiar = false) {
  const historial = vista === 'historial';
  const key = historial ? 'historial' : 'activo';
  const filtros = (!limpiar && filtrosGuardados.get(key)) || {
    desde: historial ? desplazarDia(fechaActual(), -90) : fechaActual(),
    hasta: historial ? fechaActual() : desplazarDia(fechaActual(), 90), sala: '', q: '', pagina: 1
  };
  for (const nombre of ['desde', 'hasta', 'sala', 'q']) $(`#filtro-${nombre}`).value = filtros[nombre];
  estado.pagina = filtros.pagina;
  $('#lista-descripcion').textContent = historial
    ? 'Tus reuniones finalizadas y cancelaciones. Las fechas filtran cuándo finalizaron o se cancelaron.'
    : 'Tus reuniones de las dos salas, ordenadas por fecha y hora de inicio. Consulta el calendario para ver todas las reuniones.';
}

export function establecerManejadorReservaModificada(manejador) {
  alModificarReserva = manejador;
}

export async function cargarHistorial() {
  const generacionActual = ++estado.generacion;
  consultaLista?.abort();
  consultaLista = new AbortController();
  const campoDesde = $('#filtro-desde');
  const campoHasta = $('#filtro-hasta');
  if (!campoDesde || !campoHasta) return;

  const desde = campoDesde.value;
  const hasta = campoHasta.value;
  if (!desde || !hasta || hasta < desde || new Date(hasta) - new Date(desde) > 365 * 86400000) {
    $('#reserva-lista').replaceChildren(crearElemento('p', 'vacio', 'Corrige las fechas para consultar las reservas.'));
    $('#lista-anterior').disabled = true;
    $('#lista-siguiente').disabled = true;
    $('#lista-pagina').textContent = '';
    $('#lista-resumen').textContent = '';
    $('#reserva-lista').removeAttribute('aria-busy');
  }
  if (!desde || !hasta || hasta < desde) {
    throw new Error('Selecciona un rango de fechas válido.');
  }
  if (new Date(hasta) - new Date(desde) > 365 * 86400000) {
    throw new Error('Consulta un máximo de un año por vez.');
  }

  const parametros = new URLSearchParams({
    desde: medianoche(desde),
    hasta: medianoche(desplazarDia(hasta, 1)),
    pagina: estado.pagina
  });
  const vista = esHistorial() ? 'historial' : 'activo';
  parametros.set('vista', vista);
  parametros.set('limite', '25');
  const q = $('#filtro-q').value.trim();
  if (q) parametros.set('q', q);
  filtrosGuardados.set(vista, { desde: desde, hasta: hasta, sala: $('#filtro-sala').value, q, pagina: estado.pagina });

  if ($('#filtro-sala').value) parametros.set('sala', $('#filtro-sala').value);

  const listaReservas = $('#reserva-lista');
  mostrarAviso('');
  listaReservas.replaceChildren(crearElemento('p', 'vacio', 'Cargando reservas…'));
  listaReservas.setAttribute('aria-busy', 'true');
  $('#lista-resumen').textContent = 'Cargando…';
  $('#lista-pagina').textContent = '';
  $('#lista-anterior').disabled = true;
  $('#lista-siguiente').disabled = true;

  let datos;
  try {
    datos = await peticionApi(`/reservas?${parametros}`, { signal: consultaLista.signal });
  } catch (error) {
    if (generacionActual !== estado.generacion) return;
    listaReservas.replaceChildren(crearElemento('p', 'vacio', 'No se pudieron cargar las reservas. Vuelve a consultar.'));
    $('#lista-pagina').textContent = '';
    $('#lista-resumen').textContent = 'Consulta no disponible';
    listaReservas.removeAttribute('aria-busy');
    throw error;
  }
  if (generacionActual !== estado.generacion || !estado.usuario) return;
  listaReservas.removeAttribute('aria-busy');
  if (!datos.elementos.length && estado.pagina > 1) { estado.pagina = 1; return cargarHistorial(); }

  listaReservas.replaceChildren();

  if (!datos.elementos.length) {
    const sinResultados = crearElemento('div', 'vacio');
    sinResultados.append(
      crearElemento('strong', '', esHistorial() ? 'No hay registros con estos filtros.' : 'No hay reuniones con estos filtros.'),
      crearElemento('p', '', 'Cambia las fechas, la sala o la búsqueda. También puedes limpiar los filtros.')
    );
    listaReservas.append(sinResultados);
  }

  for (const item of datos.elementos) {
    const franja = obtenerFranjaHoraria(item.inicio);
    const fila = crearElemento('article', `reserva-tarjeta ${franja.clase}`);
    const cabecera = crearElemento('div', 'reunion-tarjeta-cabecera');
    cabecera.append(crearElemento('span', 'reunion-franja', franja.etiqueta.split(' (')[0]), crearElemento('time', 'reunion-hora', `${formatearHora(item.inicio)} – ${formatearHora(item.fin)}`));
    const informacion = crearElemento('div', 'reserva-informacion');
    informacion.append(
      crearElemento('h3', '', item.asunto),
      crearElemento(
        'p',
        'reserva-horario',
        `${formatearFecha(item.inicio, { weekday: 'short', year: 'numeric' })}${
          fechaLocal(item.inicio) !== fechaLocal(item.fin) ? ` (${formatearFecha(item.fin)})` : ''
        }`
      ),
      crearElemento('p', 'reserva-responsable', `${item.responsable} · ${item.asistentes} asistentes`)
    );
    const sala = crearElemento('p', 'reserva-sala', item.nombre_sala);
    if (esHistorial() && item.estado === 'cancelada') {
      const accion = item.motivo_cancelacion === 'Reunión eliminada por su responsable' ? 'Eliminada' : 'Cancelada';
      informacion.append(crearElemento('p', 'reserva-actividad', `${accion} el ${formatearFecha(item.cancelada_en, { year: 'numeric' })} · ${formatearHora(item.cancelada_en)}`));
    }

    const boton = crearElemento('button', 'secundario', 'Ver detalle');
    boton.type = 'button';
    boton.setAttribute('aria-label', `Ver detalle: ${item.asunto}`);
    boton.addEventListener('click', () => mostrarDetalleReserva(item));

    const pie = crearElemento('div', 'reunion-tarjeta-pie');
    pie.append(sala, boton);
    fila.append(cabecera, informacion, pie);
    listaReservas.append(fila);
  }

  const total = datos.total ?? datos.elementos.length;
  $('#lista-resumen').textContent = `${total} ${esHistorial() ? (total === 1 ? 'registro' : 'registros') : (total === 1 ? 'reunión' : 'reuniones')}`;
  $('#lista-pagina').textContent = `Página ${estado.pagina} de ${Math.max(1, Math.ceil(total / 25))}`;
  $('#lista-anterior').disabled = estado.pagina === 1;
  $('#lista-siguiente').disabled = !datos.hayMas;
}

export function mostrarDetalleReserva(item) {
  estado.detalle = item;
  mostrarErrorEn('#cancelar-error', '');
  $('#cancelar-formulario').reset();

  const contenedor = $('#detalle-contenido');
  contenedor.replaceChildren(crearElemento('h3', 'detalle-asunto', item.asunto));

  const listaDefinicion = crearElemento('dl', 'detalle-cuadricula');
  const campos = [
    ['Sala', item.nombre_sala],
    ['Horario', `${formatearHora(item.inicio)} – ${formatearHora(item.fin)}`],
    ['Fecha', formatearFecha(item.inicio, { weekday: 'long', year: 'numeric' })],
    ['Responsable', item.responsable],
    ['Correo', item.correo_responsable],
    ['Asistentes', `${item.asistentes} personas`],
    ['Notas', item.notas || 'Sin notas adicionales'],
    ['Creada', `${formatearFecha(item.creada_en, { year: 'numeric' })}, ${formatearHora(item.creada_en)}`]
  ];

  for (const [etiqueta, valor] of campos) {
    listaDefinicion.append(crearElemento('dt', '', etiqueta), crearElemento('dd', '', valor));
  }
  contenedor.append(listaDefinicion);
  if (fechaLocal(item.inicio) !== fechaLocal(item.fin)) listaDefinicion.append(
    crearElemento('dt', '', 'Finaliza'),
    crearElemento('dd', '', `${formatearFecha(item.fin, {year:'numeric'})}, ${formatearHora(item.fin)}`)
  );

  if (item.estado === 'cancelada') {
    contenedor.append(
      crearElemento(
        'p',
        'cancelar-informacion',
        `Cancelada por ${item.nombre_cancelador}, ${formatearFecha(item.cancelada_en, { year: 'numeric' })} a las ${formatearHora(
          item.cancelada_en
        )}.\nMotivo: ${item.motivo_cancelacion}`
      )
    );
  }

  const formularioCancel = $('#cancelar-formulario');
  if (formularioCancel) formularioCancel.hidden = true;

  $('#detalle-dialogo').showModal();
  actualizarAccionesDetalle();
}

export function abrirFormularioReserva(dia) {
  const formulario = $('#reserva-formulario');
  if (!formulario) return;
  formulario.reset();
  mostrarErrorEn('#reservaNueva-error', '');

  const campoId = $('#reservaNueva-id');
  if (campoId) campoId.value = '';
  const tituloDialogo = $('#reserva-dialogo-asunto');
  if (tituloDialogo) tituloDialogo.textContent = 'Nueva reserva';
  const botonEnvio = $('#reservaNueva-enviar-boton');
  if (botonEnvio) botonEnvio.textContent = 'Confirmar reserva';

  formulario.elements.fecha.min = fechaActual();
  const sugerido = sugerirHorario(dia);
  formulario.elements.fecha.value = sugerido.fecha;
  formulario.elements.inicio.min = '08:00';
  formulario.elements.inicio.max = '17:00';
  formulario.elements.inicio.value = sugerido.inicio;
  formulario.elements.fin.min = '08:00';
  formulario.elements.fin.max = '17:00';
  formulario.elements.fin.value = sugerido.fin;

  const preferenciaSala = $('#calendario-sala').value;
  if (estado.salas.some(sala => sala.activo && String(sala.id) === preferenciaSala)) {
    formulario.elements.sala_id.value = preferenciaSala;
  }
  $('#reserva-dialogo').showModal();
}

function abrirFormularioEdicion(item) {
  const formulario = $('#reserva-formulario');
  if (!formulario) return;
  formulario.reset();
  mostrarErrorEn('#reservaNueva-error', '');

  const tituloDialogo = $('#reserva-dialogo-asunto');
  if (tituloDialogo) tituloDialogo.textContent = 'Editar reunión';
  const botonEnvio = $('#reservaNueva-enviar-boton');
  if (botonEnvio) botonEnvio.textContent = 'Guardar cambios';

  const campoId = $('#reservaNueva-id');
  if (campoId) campoId.value = item.id;

  formulario.elements.asunto.value = item.asunto;
  formulario.elements.sala_id.value = String(item.sala_id);
  formulario.elements.asistentes.value = item.asistentes;
  formulario.elements.notas.value = item.notas || '';

  const dia = fechaLocal(item.inicio);
  formulario.elements.fecha.min = fechaActual();
  formulario.elements.fecha.value = dia;

  formulario.elements.inicio.min = '08:00';
  formulario.elements.inicio.max = '17:00';
  formulario.elements.inicio.value = formatearHora(item.inicio);

  formulario.elements.fin.min = '08:00';
  formulario.elements.fin.max = '17:00';
  formulario.elements.fin.value = formatearHora(item.fin);

  const detalleDialogo = $('#detalle-dialogo');
  if (detalleDialogo && typeof detalleDialogo.close === 'function') {
    detalleDialogo.close();
  }
  $('#reserva-dialogo').showModal();
}

export function iniciarReservas() {
  $('#detalle-dialogo').addEventListener('close', () => clearTimeout(temporizadorAcciones));
  const eliminar = crearElemento('button', 'peligro', 'Eliminar mi reunión');
  eliminar.type = 'button';
  eliminar.id = 'delete-reserva-btn';
  eliminar.hidden = true;
  $('#detalle-acciones').append(eliminar);
  eliminar.addEventListener('click', () => {
    mostrarErrorEn('#eliminar-error', '');
    $('#eliminar-reunion-asunto').textContent = estado.detalle.asunto;
    $('#eliminar-dialogo').showModal();
  });
  $('#eliminar-formulario').addEventListener('submit', evento => {
    evento.preventDefault();
    enviarFormulario(evento.currentTarget, '#eliminar-error', async () => {
      await peticionApi(`/reservas/${estado.detalle.id}`, { method:'DELETE', body:'{}' });
      $('#eliminar-dialogo').close();
      $('#detalle-dialogo').close();
      if (alModificarReserva) await alModificarReserva('Reunión eliminada. Su registro se conserva en el historial.');
    });
  });
  const botonNuevaReserva = $('#nueva-reserva');
  if (botonNuevaReserva) {
    botonNuevaReserva.addEventListener('click', () => abrirFormularioReserva(fechaActual()));
  }

  const botonReservarDia = $('#reservar-dia');
  if (botonReservarDia) {
    botonReservarDia.addEventListener('click', () => abrirFormularioReserva(estado.seleccionado));
  }

  const formularioFiltros = $('#filtro-formulario');
  if (formularioFiltros) {
    formularioFiltros.addEventListener('change', () => {
      estado.pagina = 1;
      cargarHistorial().catch(error => mostrarAviso(error.message, true));
    });
    $('#limpiar-filtros').addEventListener('click', () => {
      configurarLista(estado.vista, true);
      cargarHistorial().catch(error => mostrarAviso(error.message, true));
    });
    formularioFiltros.addEventListener('submit', evento => {
      evento.preventDefault();
      estado.pagina = 1;
      cargarHistorial()
        .catch(error => mostrarAviso(error.message, true));
    });
  }

  const botonAnterior = $('#lista-anterior');
  if (botonAnterior) {
    botonAnterior.addEventListener('click', () => {
      estado.pagina--;
      cargarHistorial().catch(error => mostrarAviso(error.message, true));
    });
  }

  const botonSiguiente = $('#lista-siguiente');
  if (botonSiguiente) {
    botonSiguiente.addEventListener('click', () => {
      estado.pagina++;
      cargarHistorial().catch(error => mostrarAviso(error.message, true));
    });
  }

  const botonEditar = $('#editar-reserva-boton');
  if (botonEditar) {
    botonEditar.addEventListener('click', () => {
      if (estado.detalle) abrirFormularioEdicion(estado.detalle);
    });
  }

  const botonMostrarCancelacion = $('#mostrar-cancelar-boton');
  if (botonMostrarCancelacion) {
    botonMostrarCancelacion.addEventListener('click', () => {
      const acciones = $('#detalle-acciones');
      const formularioCancelacion = $('#cancelar-formulario');
      if (acciones) acciones.hidden = true;
      if (formularioCancelacion) {
        formularioCancelacion.hidden = false;
        formularioCancelacion.elements.motivo?.focus();
      }
    });
  }

  const botonAbortarCancelacion = $('#volver-cancelar-boton');
  if (botonAbortarCancelacion) {
    botonAbortarCancelacion.addEventListener('click', () => {
      const formularioCancelacion = $('#cancelar-formulario');
      if (formularioCancelacion) formularioCancelacion.hidden = true;
      actualizarAccionesDetalle();
    });
  }

  const formularioReserva = $('#reserva-formulario');
  if (formularioReserva) {
    formularioReserva.addEventListener('submit', evento => {
      evento.preventDefault();
      enviarFormulario(evento.currentTarget, '#reservaNueva-error', async () => {
        const valores = Object.fromEntries(new FormData(formularioReserva));

        if (valores.inicio < '08:00' || valores.inicio >= '17:00' || valores.fin <= '08:00' || valores.fin > '17:00') {
          throw new Error('El horario de reservas permitido es exclusivamente de 8:00 a.m. a 5:00 p.m. (08:00 a 17:00).');
        }
        if (valores.fin <= valores.inicio) {
          throw new Error('La hora de finalización debe ser posterior a la de inicio.');
        }

        const inicio = `${valores.fecha}T${valores.inicio}:00-05:00`;
        const fin = `${valores.fecha}T${valores.fin}:00-05:00`;

        if (+new Date(inicio) <= Date.now()) throw new Error('Selecciona un horario futuro dentro de la jornada laboral.');

        const id = valores.id;
        const esEdicion = Boolean(id);

        await peticionApi(esEdicion ? `/reservas/${id}` : '/reservas', {
          method: esEdicion ? 'PATCH' : 'POST',
          body: JSON.stringify({ ...valores, inicio: inicio, fin: fin })
        });
        $('#reserva-dialogo').close();
        estado.seleccionado = valores.fecha;
        estado.mes = valores.fecha.slice(0, 7);
        if (alModificarReserva) {
          await alModificarReserva(
            esEdicion
              ? 'Reunión actualizada correctamente.'
              : 'Reserva confirmada.'
          );
        }
      });
    });
  }

  const formularioCancelacion = $('#cancelar-formulario');
  if (formularioCancelacion) {
    formularioCancelacion.addEventListener('submit', evento => {
      evento.preventDefault();
      enviarFormulario(evento.currentTarget, '#cancelar-error', async () => {
        await peticionApi(`/reservas/${estado.detalle.id}/cancelar`, {
          method: 'POST',
          body: JSON.stringify({ motivo: formularioCancelacion.elements.motivo.value })
        });
        $('#detalle-dialogo').close();
        if (alModificarReserva) {
          await alModificarReserva('Reserva cancelada correctamente. Se conserva en el historial.');
        }
      });
    });
  }
}
