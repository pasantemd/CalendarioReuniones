// Estado reactivo, utilidades de fecha y cliente API

export const $ = selector => document.querySelector(selector);

// Estado centralizado de la aplicación
export const estado = {
  usuario: null,
  salas: [],
  vista: 'calendario',
  mes: '',
  seleccionado: '',
  elementos: [],
  pagina: 1,
  detalle: null,
  generacion: 0
};


const zonaHoraria = 'America/Guayaquil';

export const fechaActual = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export const fechaLocal = fecha =>
  new Intl.DateTimeFormat('en-CA', { timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(fecha));

export const formatearHora = fecha =>
  new Intl.DateTimeFormat(['es-EC', 'es'], { timeZone: zonaHoraria, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(fecha));

export function sugerirHorario(dia, ahora = new Date()) {
  const hoy = fechaLocal(ahora);
  let fecha = dia < hoy ? hoy : dia;
  let inicio = 480;
  if (fecha === hoy) {
    const local = new Date(+ahora - 5*3600000);
    inicio = Math.max(480, (Math.floor((local.getUTCHours()*60+local.getUTCMinutes())/30)+1)*30);
    if (inicio >= 1020) { fecha = desplazarDia(hoy,1); inicio = 480; }
  }
  const hora = minutos => `${String(Math.floor(minutos/60)).padStart(2,'0')}:${String(minutos%60).padStart(2,'0')}`;
  return { fecha, inicio:hora(inicio), fin:hora(Math.min(inicio+60,1020)) };
}

export const formatearFecha = (fecha, opciones = {}) =>
  new Intl.DateTimeFormat(['es-EC', 'es'], { timeZone: zonaHoraria, day: 'numeric', month: 'long', ...opciones }).format(new Date(fecha));

export function obtenerFranjaHoraria(fechaInicio) {
  const hora = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: zonaHoraria, hour: 'numeric', hour12: false }).format(new Date(fechaInicio))
  );
  if (hora < 12) {
    return { id: 'manana', etiqueta: 'Mañana (08:00 – 12:00)', clase: 'franja-manana' };
  }
  if (hora < 14) {
    return { id: 'mediodia', etiqueta: 'Mediodía (12:00 – 14:00)', clase: 'franja-mediodia' };
  }
  return { id: 'tarde', etiqueta: 'Tarde (14:00 – 17:00)', clase: 'franja-tarde' };
}

export const medianoche = valor => `${valor}T00:00:00-05:00`;

export function desplazarDia(valor, dias) {
  const fecha = new Date(`${valor}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return fecha.toISOString().slice(0, 10);
}

export function inicioMes(mes) {
  return `${mes}-01`;
}

export function desplazarMes(mes, desplazamiento) {
  const fecha = new Date(`${mes}-01T12:00:00Z`);
  fecha.setUTCMonth(fecha.getUTCMonth() + desplazamiento);
  return fecha.toISOString().slice(0, 7);
}

export function crearElemento(etiqueta, clase, contenido) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (contenido !== undefined) nodo.textContent = contenido;
  return nodo;
}

export function mostrarErrorEn(selector, mensaje) {
  const nodo = $(selector);
  if (nodo) {
    nodo.textContent = mensaje;
    nodo.hidden = !mensaje;
  }
}

export function mostrarAviso(mensaje, esError = false) {
  const nodo = $('#mensaje');
  if (nodo) {
    nodo.textContent = mensaje;
    nodo.className = esError ? 'aviso error' : 'aviso';
    nodo.hidden = !mensaje;
  }
}

export async function enviarFormulario(formulario, selectorError, accion) {
  const boton = formulario.querySelector('[type="submit"]');
  if (boton.disabled) return;
  mostrarErrorEn(selectorError, '');
  boton.disabled = true;
  const textoOriginal = boton.textContent;
  boton.textContent = 'Guardando…';
  const dialogo = formulario.closest('dialog');
  if (dialogo) dialogo.dataset.guardando = 'true';
  const controles = [...formulario.querySelectorAll('input,select,textarea,button')].map(nodo => [nodo,nodo.disabled]);
  try {
    const tarea = accion();
    controles.forEach(([nodo]) => { nodo.disabled = true; });
    await tarea;
  } catch (error) {
    mostrarErrorEn(selectorError, error.message);
  } finally {
    controles.forEach(([nodo,deshabilitado]) => { nodo.disabled = deshabilitado; });
    boton.disabled = false;
    boton.textContent = textoOriginal;
    if (dialogo) delete dialogo.dataset.guardando;
  }
}

let alExpirarSesion = null;
export function establecerManejadorSesionExpirada(manejador) {
  alExpirarSesion = manejador;
}

export async function peticionApi(ruta, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...opciones.headers }
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Sin conexión con el servidor. Revisa tu red e intenta nuevamente.');
  }

  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    throw new Error('El servidor no respondió en el formato esperado. Intenta nuevamente.');
  }

  if (!respuesta.ok) {
    if (respuesta.status === 401 && ruta !== '/ingresar' && alExpirarSesion) {
      alExpirarSesion();
    }
    throw new Error(datos.error || 'No se pudo completar la solicitud.');
  }
  return datos;
}
