import { $, estado, crearElemento, peticionApi } from './nucleo.js';

export async function cargarSalas() {
  estado.salas = await peticionApi('/salas');
  for (const selector of ['#calendario-sala', '#filtro-sala', '#reservaNueva-sala']) {
    const select = $(selector), previous = select.value;
    select.replaceChildren();
    if (selector !== '#reservaNueva-sala') select.append(new Option('Todas las salas', ''));
    for (const sala of estado.salas) select.append(new Option(sala.nombre, sala.id));
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  }
  const resumen = $('#sala-resumen');
  resumen.replaceChildren();
  for (const sala of estado.salas) {
    const bloque = crearElemento('div', 'sala-informacion'), informacion = crearElemento('div');
    bloque.append(crearElemento('span', 'sala-indicador', String(sala.id).padStart(2, '0')));
    informacion.append(crearElemento('strong', '', sala.nombre));
    if (sala.ubicacion) informacion.append(crearElemento('small', '', sala.ubicacion));
    bloque.append(informacion); resumen.append(bloque);
  }
  $('#nueva-reserva').disabled = !estado.salas.length;
  $('#reservar-dia').disabled = !estado.salas.length;
}
