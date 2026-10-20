// Orquestación de vistas, navegación y arranque de la aplicación

import {
  $,
  estado,
  peticionApi,
  mostrarAviso,
  mostrarErrorEn
} from './nucleo.js';
import {
  iniciarAutenticacion,
  ingresarAplicacion,
  mostrarInicioSesion,
  establecerManejadorInicioSesionExitoso
} from './autenticacion.js';
import { cargarSalas } from './salas.js';
import {
  iniciarCalendario,
  cargarCalendario,
  establecerManejadorSeleccionReserva
} from './calendario.js';
import {
  iniciarReservas,
  cargarHistorial,
  mostrarDetalleReserva,
  configurarLista,
  establecerManejadorReservaModificada
} from './reservas.js';

const titulos = {
  calendario: 'Calendario de salas',
  reservas: 'Reservas',
  historial: 'Historial de reservas',
};

async function cambiarVista(vista) {
  estado.generacion++;
  estado.vista = vista;
  estado.pagina = 1;
  mostrarAviso('');

  document.querySelectorAll('[data-vista]').forEach(boton => {
    const vistaBoton = boton.dataset.vista;
    const estaActivo = vistaBoton === vista;

    boton.classList.toggle('activo', estaActivo);
    if (estaActivo) boton.setAttribute('aria-current', 'page');
    else boton.removeAttribute('aria-current');
  });

  const tituloPagina = $('#pagina-asunto');
  if (tituloPagina) tituloPagina.textContent = titulos[vista] || 'Salas de reuniones';

  const vistaCalendario = $('#calendario-vista');
  if (vistaCalendario) vistaCalendario.hidden = vista !== 'calendario';

  const vistaLista = $('#lista-vista');
  if (vistaLista) vistaLista.hidden = !['reservas', 'historial'].includes(vista);

  if (vista === 'calendario') {
    await cargarCalendario();
  } else {
    configurarLista(vista);
    await cargarHistorial();
  }
}

async function actualizarVista(mensaje) {
  try {
    await cargarSalas();
    if (estado.vista === 'calendario') await cargarCalendario();
    else await cargarHistorial();
    mostrarAviso(mensaje);
  } catch (error) {
    mostrarAviso(`${mensaje} No se pudo actualizar la vista: ${error.message}`, true);
  }
}

// Conexión de eventos entre módulos
establecerManejadorInicioSesionExitoso(async () => {
  await cambiarVista('calendario');
});


establecerManejadorReservaModificada(async mensaje => {
  await actualizarVista(mensaje);
});

establecerManejadorSeleccionReserva(item => {
  mostrarDetalleReserva(item);
});

// Configuración de botones de cierre en todos los diálogos
document.querySelectorAll('.cerrar-dialogo').forEach(boton => {
  boton.addEventListener('click', () => {
    const modal = boton.closest('dialog');
    if (modal && modal.dataset.guardando !== 'true') modal.close();
  });
});
document.querySelectorAll('dialog').forEach(dialogo => dialogo.addEventListener('cancel', evento => {
  if (dialogo.dataset.guardando === 'true') evento.preventDefault();
}));

// Configuración de botones de navegación de la barra superior
document.querySelectorAll('[data-vista]').forEach(boton => {
  boton.addEventListener('click', () => {
    cambiarVista(boton.dataset.vista).catch(error => mostrarAviso(error.message, true));
  });
});

// Inicialización de submódulos
iniciarAutenticacion();
iniciarCalendario();
iniciarReservas();

// Verificación inicial de sesión
peticionApi('/sesion')
  .then(ingresarAplicacion)
  .catch(error => {
    mostrarInicioSesion();
    if (!error.message.includes('sesión terminó')) {
      mostrarErrorEn('#ingreso-error', error.message);
    }
  });
