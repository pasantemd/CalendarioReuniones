// Autenticación, sesión y perfil de usuario

import {
  $,
  estado,
  fechaActual,
  enviarFormulario,
  peticionApi,
  mostrarAviso,
  establecerManejadorSesionExpirada
} from './nucleo.js';
import { cargarSalas } from './salas.js';

let alIniciarSesionExitosamente = null;

export function establecerManejadorInicioSesionExitoso(manejador) {
  alIniciarSesionExitosamente = manejador;
}

export function mostrarInicioSesion() {
  estado.usuario = null;
  estado.generacion++;
  estado.elementos = [];
  estado.detalle = null;
  estado.salas = [];
  for (const selector of ['#reserva-lista', '#detalle-contenido', '#calendario-cuadricula', '#dia-agenda', '#sala-resumen']) {
    $(selector).replaceChildren();
  }
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  $('#aplicacion-vista').hidden = true;
  $('#carga').hidden = true;
  $('#ingreso-vista').hidden = false;
  const formulario = $('#ingreso-formulario');
  if (formulario && formulario.elements.contrasena) {
    formulario.elements.contrasena.value = '';
  }
}

establecerManejadorSesionExpirada(mostrarInicioSesion);

export async function ingresarAplicacion(usuario) {
  estado.usuario = usuario;
  estado.seleccionado = fechaActual();
  estado.mes = estado.seleccionado.slice(0, 7);

  $('#usuario-nombre').textContent = usuario.nombre;
  $('#usuario-correo').textContent = usuario.correo;
  $('#avatar').textContent = usuario.nombre
    .split(/\s+/)
    .slice(0, 2)
    .map(palabra => palabra[0])
    .join('')
    .toUpperCase();

  $('#ingreso-vista').hidden = true;
  $('#carga').hidden = false;
  $('#aplicacion-vista').hidden = true;

  try {
    await cargarSalas();
    if (estado.usuario?.id !== usuario.id) return;
    if (alIniciarSesionExitosamente) await alIniciarSesionExitosamente();
    if (estado.usuario?.id !== usuario.id) return;
    $('#carga').hidden = true;
    $('#aplicacion-vista').hidden = false;
  } catch (error) {
    mostrarInicioSesion();
    throw error;
  }
}

export function iniciarAutenticacion() {
  const formularioLogin = $('#ingreso-formulario');
  if (formularioLogin) {
    formularioLogin.addEventListener('submit', evento => {
      evento.preventDefault();
      enviarFormulario(evento.currentTarget, '#ingreso-error', async () => {
        const formulario = $('#ingreso-formulario');
        const usuario = await peticionApi('/ingresar', {
          method: 'POST',
          body: JSON.stringify({
            correo: formulario.elements.correo.value,
            contrasena: formulario.elements.contrasena.value
          })
        });
        formulario.reset();
        await ingresarAplicacion(usuario);
      });
    });
  }

  const botonCerrarSesion = $('#salir');
  if (botonCerrarSesion) {
    botonCerrarSesion.addEventListener('click', async () => {
      botonCerrarSesion.disabled = true;
      try {
        await peticionApi('/salir', { method: 'POST', body: '{}' });
        mostrarInicioSesion();
      } catch (error) {
        mostrarAviso(error.message, true);
      } finally {
        botonCerrarSesion.disabled = false;
      }
    });
  }
}
