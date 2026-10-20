// Vista de calendario mensual y panel de agenda diaria

import {
  $,
  estado,
  crearElemento,
  peticionApi,
  fechaActual,
  fechaLocal,
  formatearHora,
  formatearFecha,
  obtenerFranjaHoraria,
  medianoche,
  desplazarDia,
  inicioMes,
  desplazarMes,
  mostrarAviso
} from './nucleo.js';

let alSeleccionarReserva = null;

export function establecerManejadorSeleccionReserva(manejador) {
  alSeleccionarReserva = manejador;
}

async function obtenerReservasCalendario(desde, hasta, sala) {
  const elementos = [];
  let pagina = 1;
  let hayMas;

  do {
    const parametros = new URLSearchParams({ desde: desde, hasta: hasta, estado: 'confirmada', pagina: pagina });
    if (sala) parametros.set('sala', sala);
    const datos = await peticionApi(`/reservas?${parametros}`);
    elementos.push(...datos.elementos);
    hayMas = datos.hayMas;
    pagina++;
  } while (hayMas);

  return elementos;
}

export async function cargarCalendario() {
  const generacionActual = ++estado.generacion;
  const primerDiaMes = inicioMes(estado.mes);
  const diaSemana = new Date(`${primerDiaMes}T12:00:00Z`).getUTCDay();
  const inicioCuadricula = desplazarDia(primerDiaMes, -(diaSemana + 6) % 7);
  const finCuadricula = desplazarDia(inicioCuadricula, 42);

  $('#mes-asunto').textContent = formatearFecha(medianoche(primerDiaMes), { month: 'long', year: 'numeric', day: undefined });
  $('#calendario-cuadricula').setAttribute('aria-busy', 'true');
  $('#calendario-cuadricula').replaceChildren(crearElemento('p', 'vacio', 'Cargando reservas…'));
  $('#dia-agenda').replaceChildren(crearElemento('p', 'vacio', 'Cargando…'));

  try {
    const salaSeleccionada = $('#calendario-sala').value;
    const elementos = await obtenerReservasCalendario(medianoche(inicioCuadricula), medianoche(finCuadricula), salaSeleccionada);
    if (generacionActual !== estado.generacion || !estado.usuario) return;
    estado.elementos = elementos;
    renderizarCalendario(inicioCuadricula);
    renderizarAgenda();
  } catch (error) {
    if (generacionActual !== estado.generacion) return;
    $('#calendario-cuadricula').replaceChildren(crearElemento('p', 'vacio', 'No se pudieron cargar las reservas.'));
    $('#dia-agenda').replaceChildren(crearElemento('p', 'vacio', 'Usa Hoy o cambia de mes para volver a intentar.'));
    throw error;
  } finally {
    if (generacionActual === estado.generacion) {
      $('#calendario-cuadricula').removeAttribute('aria-busy');
    }
  }
}

function reservasDelDia(dia) {
  const inicio = +new Date(medianoche(dia));
  const fin = +new Date(medianoche(desplazarDia(dia, 1)));
  return estado.elementos.filter(item => +new Date(item.inicio) < fin && +new Date(item.fin) > inicio);
}

function renderizarCalendario(inicio) {
  const cuadricula = $('#calendario-cuadricula');
  cuadricula.replaceChildren();

  for (let indice = 0; indice < 42; indice++) {
    const dia = desplazarDia(inicio, indice);
    const eventos = reservasDelDia(dia);
    const esMesExterior = dia.slice(0, 7) !== estado.mes;
    const esHoy = dia === fechaActual();
    const estaSeleccionado = dia === estado.seleccionado;

    const boton = crearElemento(
      'button',
      `dia${esMesExterior ? ' exterior' : ''}${esHoy ? ' hoy' : ''}${estaSeleccionado ? ' seleccionado' : ''}`
    );
    boton.type = 'button';
    boton.dataset.fecha = dia;
    boton.setAttribute('aria-pressed', String(estaSeleccionado));
    boton.setAttribute('aria-label', `${formatearFecha(medianoche(dia), { weekday: 'long', year: 'numeric' })}, ${eventos.length} reservas`);

    boton.append(crearElemento('span', 'dia-numero', String(Number(dia.slice(8)))));

    for (const item of eventos.slice(0, 2)) {
      const textoEvento = `${fechaLocal(item.inicio) === dia ? formatearHora(item.inicio) : 'Continúa'} ${item.asunto}`;
      const etiqueta = crearElemento('span', `evento-etiqueta ${obtenerFranjaHoraria(item.inicio).clase}`, textoEvento);
      etiqueta.title = `${item.asunto} · ${item.nombre_sala}`;
      boton.append(etiqueta);
    }

    if (eventos.length > 2) {
      boton.append(crearElemento('span', 'dia-mas', `+${eventos.length - 2} más`));
    }

    boton.addEventListener('click', () => {
      estado.seleccionado = dia;
      cuadricula.querySelectorAll('.dia').forEach(nodo => {
        const seleccionado = nodo.dataset.fecha === dia;
        nodo.classList.toggle('seleccionado', seleccionado);
        nodo.setAttribute('aria-pressed', String(seleccionado));
      });
      renderizarAgenda();
    });

    cuadricula.append(boton);
  }
}

export function renderizarAgenda() {
  $('#dia-asunto').textContent = formatearFecha(medianoche(estado.seleccionado), { weekday: 'long' });
  const eventos = reservasDelDia(estado.seleccionado);
  $('#dia-conteo').textContent = `${eventos.length} ${eventos.length === 1 ? 'reunión' : 'reuniones'}`;

  const agenda = $('#dia-agenda');
  agenda.replaceChildren();

  if (!eventos.length) {
    const vacio = crearElemento('div', 'vacio');
    vacio.append(
      crearElemento('strong', '', 'El día tiene espacio disponible.'),
      crearElemento('p', '', 'No hay reuniones programadas para esta fecha y sala.')
    );
    agenda.append(vacio);
  }

  for (const item of eventos) {
    const franja = obtenerFranjaHoraria(item.inicio);
    const boton = crearElemento('button', `agenda-item ${franja.clase}`);
    boton.type = 'button';
    const horario = crearElemento(
      'time',
      '',
      `${formatearHora(item.inicio)} – ${formatearHora(item.fin)}${
        fechaLocal(item.inicio) !== fechaLocal(item.fin) ? ' · cruza medianoche' : ''
      }`
    );
    boton.append(
      crearElemento('span', 'reunion-franja', franja.etiqueta.split(' (')[0]),
      horario,
      crearElemento('h3', '', item.asunto),
      crearElemento('p', '', `${item.nombre_sala} · ${item.asistentes} asistentes`),
      crearElemento('p', 'responsable', item.responsable)
    );

    boton.addEventListener('click', () => {
      if (alSeleccionarReserva) alSeleccionarReserva(item);
    });
    agenda.append(boton);
  }

  const botonReservarDia = $('#reservar-dia');
  if (botonReservarDia) {
    botonReservarDia.disabled = !estado.salas.some(sala => sala.activo) || estado.seleccionado < fechaActual();
  }
}

export async function navegarMes(desplazamiento) {
  estado.mes = desplazarMes(estado.mes, desplazamiento);
  estado.seleccionado = inicioMes(estado.mes);
  await cargarCalendario();
}

export function iniciarCalendario() {
  const botonMesAnterior = $('#anterior-mes');
  if (botonMesAnterior) {
    botonMesAnterior.addEventListener('click', () => navegarMes(-1).catch(error => mostrarAviso(error.message, true)));
  }

  const botonMesSiguiente = $('#siguiente-mes');
  if (botonMesSiguiente) {
    botonMesSiguiente.addEventListener('click', () => navegarMes(1).catch(error => mostrarAviso(error.message, true)));
  }

  const botonHoy = $('#hoy');
  if (botonHoy) {
    botonHoy.addEventListener('click', () => {
      estado.seleccionado = fechaActual();
      estado.mes = estado.seleccionado.slice(0, 7);
      cargarCalendario().catch(error => mostrarAviso(error.message, true));
    });
  }

  const selectorSala = $('#calendario-sala');
  if (selectorSala) {
    selectorSala.addEventListener('change', () => cargarCalendario().catch(error => mostrarAviso(error.message, true)));
  }
}
