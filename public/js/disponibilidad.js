import { crearElemento, peticionApi, medianoche, desplazarDia } from './nucleo.js';

export const duracionesReserva = [30, 60, 90, 120, 150, 180, 210, 240];
const minutosHora = (hora) => {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
};
const horaMinutos = (minutos) =>
  `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

export function horarioEstaLibre(
  fecha,
  inicio,
  duracion,
  reservas,
  ahora = Date.now(),
  excluirId = ''
) {
  if (!duracionesReserva.includes(Number(duracion)) || !/^\d{2}:\d{2}$/.test(inicio)) return false;
  const minuto = minutosHora(inicio);
  if (minuto < 480 || minuto + Number(duracion) > 1020) return false;
  const desde = +new Date(`${fecha}T${inicio}:00-05:00`);
  const hasta = desde + Number(duracion) * 60000;
  if (!Number.isFinite(desde) || desde <= Number(ahora)) return false;
  // Los rangos son [inicio, fin): una reunión puede empezar justo cuando termina otra.
  return !reservas.some(
    (reserva) =>
      reserva.estado !== 'cancelada' &&
      String(reserva.id) !== String(excluirId) &&
      +new Date(reserva.inicio) < hasta &&
      +new Date(reserva.fin) > desde
  );
}

export function calcularHorariosDisponibles(
  fecha,
  duracion,
  reservas,
  ahora = Date.now(),
  excluirId = ''
) {
  const horarios = [];
  for (let minuto = 480; minuto + Number(duracion) <= 1020; minuto += 30) {
    const inicio = horaMinutos(minuto);
    if (horarioEstaLibre(fecha, inicio, duracion, reservas, ahora, excluirId))
      horarios.push({ inicio, fin: horaMinutos(minuto + Number(duracion)) });
  }
  return horarios;
}

let actualizarAlAbrir = null;
let comprobarAntesDeGuardar = null;
export function actualizarDisponibilidad(inicioDeseado) {
  actualizarAlAbrir?.(inicioDeseado);
}
export async function comprobarDisponibilidad() {
  await comprobarAntesDeGuardar?.();
}

export function iniciarDisponibilidad() {
  const formulario = document.querySelector('#reserva-formulario');
  const { fecha, sala_id: sala, inicio, fin } = formulario.elements;
  let preferenciaInicio = '',
    inicioOriginal = '';
  const etiqueta = crearElemento('label', '', 'Duración de la reunión');
  const duracion = crearElemento('select');
  duracion.name = 'duracion';
  duracion.required = true;
  for (const minutos of duracionesReserva) {
    const horas = Math.floor(minutos / 60),
      resto = minutos % 60;
    const texto = horas ? `${horas} h${resto ? ' 30 min' : ''}` : '30 min';
    duracion.add(new Option(texto, minutos, minutos === 60, minutos === 60));
  }
  etiqueta.append(duracion);
  const panel = crearElemento('section', 'disponibilidad');
  panel.setAttribute('aria-label', 'Horarios disponibles');
  const encabezado = crearElemento('h3', '', 'Horarios disponibles');
  const mensaje = crearElemento('p', 'disponibilidad-mensaje');
  mensaje.setAttribute('role', 'status');
  mensaje.setAttribute('aria-live', 'polite');
  const opciones = crearElemento('div', 'disponibilidad-opciones');
  panel.append(encabezado, mensaje, opciones);
  inicio.before(etiqueta, panel);
  const dialogoReserva = formulario.closest('dialog');
  // Los botones se regeneran durante la consulta; inert también bloquea los controles nuevos.
  new MutationObserver(() => {
    panel.inert = dialogoReserva.dataset.guardando === 'true';
  }).observe(dialogoReserva, { attributes: true, attributeFilter: ['data-guardando'] });
  let reservas = [],
    consulta = null,
    generacion = 0,
    lista = false,
    temporizador = null;

  function actualizarFin() {
    fin.value =
      inicio.value && minutosHora(inicio.value) + Number(duracion.value) <= 1020
        ? horaMinutos(minutosHora(inicio.value) + Number(duracion.value))
        : '';
    for (const boton of opciones.children)
      boton.setAttribute('aria-pressed', String(boton.dataset.inicio === inicio.value));
  }
  function renderizar() {
    const seleccionado = inicio.value || preferenciaInicio;
    const horarios = calcularHorariosDisponibles(
      fecha.value,
      Number(duracion.value),
      reservas,
      Date.now(),
      formulario.elements.id.value
    );
    if (
      inicioOriginal &&
      !horarios.some((horario) => horario.inicio === inicioOriginal) &&
      horarioEstaLibre(
        fecha.value,
        inicioOriginal,
        Number(duracion.value),
        reservas,
        Date.now(),
        formulario.elements.id.value
      )
    ) {
      horarios.push({
        inicio: inicioOriginal,
        fin: horaMinutos(minutosHora(inicioOriginal) + Number(duracion.value))
      });
      horarios.sort((a, b) => a.inicio.localeCompare(b.inicio));
    }
    const botones = [...opciones.children];
    const sinCambios =
      horarios.length === botones.length &&
      horarios.every(
        (horario, indice) =>
          botones[indice].dataset.inicio === horario.inicio &&
          botones[indice].textContent === `${horario.inicio} – ${horario.fin}`
      );
    const desplazamiento = opciones.scrollTop;
    const enfocado = opciones.contains(document.activeElement)
      ? document.activeElement.dataset.inicio
      : null;
    if (!sinCambios) opciones.replaceChildren();
    for (const horario of sinCambios ? [] : horarios) {
      const boton = crearElemento('button', 'secundario', `${horario.inicio} – ${horario.fin}`);
      boton.type = 'button';
      boton.dataset.inicio = horario.inicio;
      boton.addEventListener('click', () => {
        if (dialogoReserva.dataset.guardando === 'true') return;
        inicio.value = horario.inicio;
        actualizarFin();
      });
      opciones.append(boton);
    }
    if (!sinCambios) {
      opciones.scrollTop = desplazamiento;
      if (enfocado) {
        const destino = [...opciones.children].find((boton) => boton.dataset.inicio === enfocado);
        if (destino) destino.focus({ preventScroll: true });
        else {
          panel.tabIndex = -1;
          panel.focus({ preventScroll: true });
        }
      }
    }
    inicio.value = horarios.some((horario) => horario.inicio === seleccionado) ? seleccionado : '';
    preferenciaInicio = '';
    mensaje.textContent = horarios.length
      ? 'Solo se muestran horarios libres para esta sala y duración. Hora de Ecuador.'
      : 'No hay horarios libres para esta duración. Prueba otra duración, sala o fecha.';
    actualizarFin();
  }
  async function cargar(silenciosa = false) {
    // Una consulta antigua nunca debe reemplazar las opciones de otra sala o fecha.
    const actual = ++generacion;
    const conservar = silenciosa === true && lista;
    preferenciaInicio = inicio.value || preferenciaInicio;
    consulta?.abort();
    consulta = new AbortController();
    if (!conservar) {
      inicio.value = '';
      lista = false;
      reservas = [];
      opciones.replaceChildren();
      actualizarFin();
    }
    if (!fecha.value || !fecha.validity.valid || !sala.value) {
      mensaje.textContent = 'Selecciona una sala y una fecha válida.';
      panel.removeAttribute('aria-busy');
      return;
    }
    if (!conservar) {
      panel.setAttribute('aria-busy', 'true');
      mensaje.textContent = 'Buscando horarios libres…';
    }
    try {
      const recibidas = [];
      let pagina = 1,
        hayMas;
      do {
        const parametros = new URLSearchParams({
          desde: medianoche(fecha.value),
          hasta: medianoche(desplazarDia(fecha.value, 1)),
          sala: sala.value,
          estado: 'confirmada',
          pagina
        });
        const datos = await peticionApi(`/reservas?${parametros}`, { signal: consulta.signal });
        if (actual !== generacion || !document.querySelector('#reserva-dialogo').open) return;
        recibidas.push(...datos.elementos);
        hayMas = datos.hayMas;
        pagina++;
      } while (hayMas);
      reservas = recibidas;
      lista = true;
      renderizar();
      return true;
    } catch (error) {
      if (actual === generacion && error.name !== 'AbortError')
        mensaje.textContent = 'No se pudo comprobar la disponibilidad. Vuelve a intentar.';
      return false;
    } finally {
      if (actual === generacion) panel.removeAttribute('aria-busy');
    }
  }
  const reintentar = crearElemento('button', 'secundario', 'Actualizar horarios');
  reintentar.type = 'button';
  reintentar.addEventListener('click', cargar);
  panel.append(reintentar);
  sala.addEventListener('change', cargar);
  fecha.addEventListener('change', cargar);
  duracion.addEventListener('change', () => {
    if (lista) renderizar();
    else actualizarFin();
  });
  document.querySelector('#reserva-dialogo').addEventListener('close', () => {
    clearInterval(temporizador);
    generacion++;
    consulta?.abort();
    panel.removeAttribute('aria-busy');
  });
  actualizarAlAbrir = (inicioDeseado) => {
    preferenciaInicio = inicioDeseado || inicio.value;
    inicioOriginal = formulario.elements.id.value ? preferenciaInicio : '';
    const diferencia =
      minutosHora(fin.value || '00:00') - minutosHora(preferenciaInicio || '00:00');
    duracion.value = String(duracionesReserva.includes(diferencia) ? diferencia : 60);
    cargar();
    clearInterval(temporizador);
    temporizador = setInterval(() => {
      if (
        !document.hidden &&
        document.querySelector('#reserva-dialogo').dataset.guardando !== 'true'
      )
        cargar(true);
    }, 30000);
  };
  window.addEventListener('focus', () => {
    const dialogo = document.querySelector('#reserva-dialogo');
    if (dialogo.open && dialogo.dataset.guardando !== 'true') cargar(true);
  });
  comprobarAntesDeGuardar = async () => {
    // Esta consulta reduce datos obsoletos; la exclusión de PostgreSQL resuelve la carrera final.
    const actualizada = await cargar(true);
    if (
      !actualizada ||
      !lista ||
      !inicio.value ||
      !horarioEstaLibre(
        fecha.value,
        inicio.value,
        Number(duracion.value),
        reservas,
        Date.now(),
        formulario.elements.id.value
      )
    ) {
      throw new Error(
        'Ese horario ya no está disponible. Elige otra opción de la lista actualizada.'
      );
    }
  };
}
