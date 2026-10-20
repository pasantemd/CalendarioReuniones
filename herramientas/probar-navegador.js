import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { auditarInterfaz } from './auditar-interfaz.js';

export async function probarNavegador(origen) {
  const navegador = await chromium.launch({ headless: true });
  const pagina = await navegador.newPage({ viewport: { width: 1440, height: 1050 } });
  pagina.setDefaultTimeout(10000);
  const errores = [];
  pagina.on('pageerror', error => errores.push(error.message));
  await mkdir('test-results', { recursive: true });
  try {
    await pagina.goto(origen); await pagina.waitForLoadState('networkidle');
    await expect(pagina.locator('#ingreso-vista')).toBeVisible();
    await auditarInterfaz(pagina, 'Login');
    await pagina.screenshot({ path: 'test-results/ingreso-escritorio.png', fullPage: true });
    await pagina.getByLabel('Correo corporativo').fill('administrador@test.invalido');
    await pagina.getByLabel('Contraseña', { exact: true }).fill('Prueba-segura-2026');
    await pagina.getByRole('button', { name: 'Ingresar', exact: true }).click();
    await expect(pagina.locator('#calendario-cuadricula .dia')).toHaveCount(42);
    await auditarInterfaz(pagina, 'Calendario');
    const perfil = await pagina.evaluate(() => ({nombre:document.querySelector('#usuario-nombre').textContent,correo:document.querySelector('#usuario-correo').textContent}));
    await pagina.evaluate(() => {
      document.querySelector('#usuario-nombre').textContent = 'X'.repeat(120);
      document.querySelector('#usuario-correo').textContent = 'x'.repeat(230)+'@example.com';
    });
    for (const width of [320,390,768,1024,1440]) {
      await pagina.setViewportSize({width,height:1050});
      await auditarInterfaz(pagina,`Perfil largo ${width}`);
    }
    await pagina.evaluate(({nombre,correo}) => {
      document.querySelector('#usuario-nombre').textContent=nombre;
      document.querySelector('#usuario-correo').textContent=correo;
    },perfil);
    await expect(pagina.locator('#usuario-nombre')).toHaveText(perfil.nombre);
    await pagina.setViewportSize({width:1440,height:1050});
    const elementosOriginales = await pagina.evaluate(async () => {
      const { estado } = await import('/js/nucleo.js');
      const { renderizarAgenda } = await import('/js/calendario.js');
      const originales = estado.elementos;
      estado.elementos = [{asunto:'Asunto'.repeat(26),responsable:'X'.repeat(120),nombre_sala:'Sala comedor',asistentes:3,
        inicio:`${estado.seleccionado}T09:00:00-05:00`,fin:`${estado.seleccionado}T10:00:00-05:00`}];
      renderizarAgenda();
      return originales;
    });
    for (const width of [320,390,1024]) {
      await pagina.setViewportSize({width,height:1050});
      await auditarInterfaz(pagina,`Agenda con textos largos ${width}`);
      expect(await pagina.locator('#dia-agenda').evaluate(nodo => nodo.scrollWidth <= nodo.clientWidth)).toBe(true);
    }
    await pagina.evaluate(async originales => {
      const { estado } = await import('/js/nucleo.js');
      const { renderizarAgenda } = await import('/js/calendario.js');
      estado.elementos=originales; renderizarAgenda();
    },elementosOriginales);
    await pagina.setViewportSize({width:1440,height:1050});
    await pagina.screenshot({ path: 'test-results/calendario-escritorio.png', fullPage: true });
    await pagina.getByRole('button', { name: 'Mes siguiente' }).click();
    await expect(pagina.locator('#calendario-cuadricula .dia')).toHaveCount(42);
    await pagina.getByRole('button', { name: 'Mes anterior' }).click();
    await expect(pagina.locator('#calendario-cuadricula .dia')).toHaveCount(42);
    await pagina.getByRole('button', { name: 'Hoy', exact: true }).click();
    await expect(pagina.locator('#calendario-cuadricula .dia')).toHaveCount(42);
    await pagina.locator('#calendario-sala').selectOption('2');
    await expect(pagina.locator('#calendario-cuadricula .dia')).toHaveCount(42);
    await pagina.locator('#calendario-sala').selectOption('');
    await expect(pagina.locator('#calendario-cuadricula .dia')).toHaveCount(42);
    await pagina.getByRole('button', { name: 'Nueva reserva', exact: false }).click();
    const formulario = pagina.locator('#reserva-formulario');
    const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    await formulario.getByLabel('Asunto de la reunión').fill('Revisión del equipo · prueba de navegador');
    await formulario.locator('[name="sala_id"]').selectOption('1');
    await formulario.getByLabel('Fecha', { exact: true }).fill(date);
    await formulario.getByLabel('Asistentes', { exact: true }).fill('3');
    await formulario.getByLabel('Desde', { exact: true }).fill('15:00');
    await formulario.getByLabel('Hasta', { exact: true }).fill('16:00');
    await formulario.getByLabel('Notas', { exact: false }).fill('Información verificada en navegador.');
    await auditarInterfaz(pagina, 'Formulario de reserva');
    let liberarGuardado;
    const guardadoPendiente = new Promise(resolve => { liberarGuardado = resolve; });
    await pagina.route('**/api/reservas', async route => {
      if (route.request().method() === 'POST') await guardadoPendiente;
      await route.continue();
    });
    await formulario.getByRole('button', { name: 'Confirmar reserva' }).click();
    await expect(formulario.getByLabel('Asunto de la reunión')).toBeDisabled();
    await pagina.keyboard.press('Escape');
    await expect(pagina.locator('#reserva-dialogo')).toBeVisible();
    liberarGuardado();
    await expect(pagina.locator('#reserva-dialogo')).not.toBeVisible();
    await expect(pagina.locator('#mensaje')).toContainText('Reserva confirmada');
    await pagina.unroute('**/api/reservas');
    await expect(pagina.locator('#dia-agenda')).toContainText('Revisión del equipo');
    await pagina.locator('#dia-agenda .agenda-item').click();
    await expect(pagina.locator('#detalle-contenido')).toContainText('Información verificada');
    await expect(pagina.locator('#detalle-dialogo')).toHaveAccessibleName('Detalle de la reserva');
    await auditarInterfaz(pagina, 'Detalle');
    await pagina.evaluate(async () => {
      const { estado } = await import('/js/nucleo.js');
      const { mostrarDetalleReserva } = await import('/js/reservas.js');
      mostrarDetalleReserva({...estado.detalle,inicio:new Date(Date.now()+200).toISOString()});
    });
    await expect(pagina.locator('#detalle-acciones')).toBeHidden();
    await expect(pagina.locator('#detail-action-note')).toContainText('Esta reunión ya comenzó');
    await pagina.keyboard.press('Escape');
    await pagina.locator('#dia-agenda .agenda-item').click();
    await pagina.getByRole('button', { name: 'Cancelar reunión', exact: true }).click();
    await pagina.getByLabel('Motivo de cancelación').fill('Cancelación de prueba');
    await pagina.getByRole('button', { name: 'Confirmar cancelación', exact: true }).click();
    await expect(pagina.locator('#detalle-dialogo')).not.toBeVisible();
    await expect(pagina.locator('#mensaje')).toContainText('Reserva cancelada');
    for (const reunion of [
      { asunto:'Coordinación de operaciones', inicio:'12:00', fin:'13:00', sala:'1' },
      { asunto:'Revisión de proyectos', inicio:'14:00', fin:'15:00', sala:'2' }
    ]) {
      await pagina.getByRole('button', { name:'Nueva reserva', exact:false }).click();
      await formulario.getByLabel('Asunto de la reunión').fill(reunion.asunto);
      await formulario.locator('[name="sala_id"]').selectOption(reunion.sala);
      await formulario.getByLabel('Fecha', { exact:true }).fill(date);
      await formulario.getByLabel('Desde', { exact:true }).fill(reunion.inicio);
      await formulario.getByLabel('Hasta', { exact:true }).fill(reunion.fin);
      await formulario.getByRole('button', { name:'Confirmar reserva' }).click();
      await expect(pagina.locator('#reserva-dialogo')).not.toBeVisible();
      await expect(pagina.locator('#mensaje')).toContainText('Reserva confirmada');
    }
    await pagina.getByRole('button', { name: 'Reservas', exact: true }).click();
    await expect(pagina.locator('#lista-pagina')).toContainText('Página 1');
    await pagina.getByRole('button', { name: 'Historial', exact: true }).click();
    await expect(pagina.locator('#reserva-lista')).toContainText('Revisión del equipo');
    await pagina.locator('.reserva-tarjeta').filter({hasText:'Reunión terminada propia'}).getByRole('button', {name:/^Ver detalle:/}).click();
    await expect(pagina.locator('#detalle-acciones')).toBeHidden();
    await expect(pagina.locator('#editar-reserva-boton')).toBeHidden();
    await expect(pagina.locator('#mostrar-cancelar-boton')).toBeHidden();
    await expect(pagina.locator('#delete-reserva-btn')).toBeHidden();
    await pagina.keyboard.press('Escape');
    await pagina.getByRole('button', { name: 'Consultar', exact: true }).click();
    await expect(pagina.locator('#reserva-lista')).toContainText('Cancelada el');
    await pagina.locator('#reserva-lista .reserva-tarjeta').filter({ hasText: 'Revisión del equipo' }).getByRole('button', { name: /^Ver detalle:/ }).click();
    await expect(pagina.locator('#detalle-contenido')).toContainText('Cancelación de prueba');
    await pagina.keyboard.press('Escape');
    await expect(pagina.locator('#salas-nav, #salas-view, #sala-dialog, #list-caption, .workspace-footer, #filtro-estado, .state, .calendar-legend')).toHaveCount(0);
    await pagina.locator('#filtro-sala').selectOption('2');
    await expect(pagina.locator('#reserva-lista')).toContainText('No hay registros');
    await pagina.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(pagina.locator('#filtro-sala')).toHaveValue('');
    await pagina.route('**/api/reservas?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fallo controlado' }) }));
    await pagina.getByRole('button', { name: 'Consultar', exact: true }).click();
    await expect(pagina.locator('#reserva-lista')).toContainText('No se pudieron cargar');
    await pagina.unroute('**/api/reservas?**');
    await pagina.getByRole('button', { name: 'Consultar', exact: true }).click();
    await expect(pagina.locator('#lista-pagina')).toContainText('Página 1');
    await pagina.locator('#filtro-desde').fill('2030-03-02');
    await pagina.locator('#filtro-hasta').fill('2030-03-01');
    await pagina.getByRole('button', { name: 'Consultar', exact: true }).click();
    await expect(pagina.locator('#mensaje')).toContainText('rango de fechas válido');
    await pagina.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(pagina.locator('#lista-pagina')).toContainText('Página 1');
    await pagina.screenshot({ path: 'test-results/historial-escritorio.png', fullPage: true });
    await auditarInterfaz(pagina, 'Historial');
    await pagina.locator('#filtro-q').fill('NO-EXISTE-ESTA-REUNION');
    await pagina.getByRole('button', { name: 'Consultar', exact: true }).click();
    await expect(pagina.locator('#reserva-lista')).toContainText('No hay registros');
    await pagina.getByRole('button', { name: 'Reservas', exact: true }).click();
    await expect(pagina.locator('#lista-pagina')).toContainText('Página 1');
    await expect(pagina.locator('#reserva-lista')).not.toContainText('Cancelada');
    await pagina.screenshot({ path: 'test-results/reservas-escritorio.png', fullPage: true });
    await auditarInterfaz(pagina, 'Reservas');
    await expect(pagina.locator('#filtro-estado, .state')).toHaveCount(0);
    for (const ancho of [320,390,768,1024,1440]) {
      await pagina.setViewportSize({ width:ancho, height:900 });
      await auditarInterfaz(pagina, `Reservas ${ancho}`);
    }
    await pagina.getByRole('button', { name: 'Historial', exact: true }).click();
    await expect(pagina.locator('#filtro-q')).toHaveValue('NO-EXISTE-ESTA-REUNION');
    await pagina.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(pagina.locator('#lista-pagina')).toContainText('Página 1');
    await pagina.setViewportSize({ width: 390, height: 844 });
    await pagina.screenshot({ path: 'test-results/historial-movil.png', fullPage: true });
    expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await pagina.getByRole('button', { name: 'Reservas', exact: true }).click();
    await expect(pagina.locator('#lista-pagina')).toContainText('Página 1');
    await pagina.screenshot({ path: 'test-results/reservas-movil.png', fullPage: true });
    expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(pagina.locator('#reserva-lista')).not.toContainText('<script>alert(1)</script> Prueba');
    await pagina.locator('.reserva-tarjeta').filter({hasText:'Coordinación de operaciones'}).getByRole('button', {name:/^Ver detalle:/}).click();
    await pagina.getByRole('button', {name:'Eliminar mi reunión', exact:true}).click();
    await expect(pagina.locator('#eliminar-dialogo')).toBeVisible();
    await auditarInterfaz(pagina, 'Confirmación de eliminación');
    await pagina.locator('#eliminar-dialogo').getByRole('button', {name:'Volver', exact:true}).click();
    await expect(pagina.locator('#detalle-dialogo')).toBeVisible();
    await pagina.getByRole('button', {name:'Eliminar mi reunión', exact:true}).click();
    await pagina.getByRole('button', {name:'Eliminar reunión', exact:true}).click();
    await expect(pagina.locator('#eliminar-dialogo')).toBeHidden();
    await expect(pagina.locator('#detalle-dialogo')).toBeHidden();
    await expect(pagina.locator('#mensaje')).toContainText('Reunión eliminada');
    await expect(pagina.locator('#reserva-lista')).not.toContainText('Coordinación de operaciones');
    await pagina.getByRole('button', { name: 'Calendario', exact: true }).click();
    await expect(pagina.locator('#calendario-cuadricula .dia')).toHaveCount(42);
    await pagina.setViewportSize({ width: 390, height: 844 });
    await pagina.screenshot({ path: 'test-results/calendario-movil.png', fullPage: true });
    expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await pagina.getByRole('button', { name: 'Reservar este día', exact: true }).click();
    await expect(pagina.locator('#reserva-dialogo')).toBeVisible();
    await expect(pagina.locator('#reserva-dialogo')).toHaveAccessibleName('Nueva reserva');
    await pagina.screenshot({ path: 'test-results/formulario-movil.png', fullPage: true });
    await auditarInterfaz(pagina, 'Formulario móvil');
    await pagina.locator('#reserva-dialogo').getByRole('button', { name: 'Volver', exact: true }).click();
    await pagina.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(pagina.locator('#ingreso-vista')).toBeVisible();
    await pagina.screenshot({ path: 'test-results/ingreso-movil.png', fullPage: true });
    expect(await pagina.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(pagina.locator('#reserva-lista')).toBeEmpty();
    await expect(pagina.locator('#detalle-contenido')).toBeEmpty();
    await pagina.route('**/api/salas', route => route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Salas temporalmente no disponibles'})}));
    await pagina.getByLabel('Correo corporativo').fill('empleado@test.invalido');
    await pagina.getByLabel('Contraseña', {exact:true}).fill('Prueba-segura-2026');
    await pagina.getByRole('button', {name:'Ingresar',exact:true}).click();
    await expect(pagina.locator('#ingreso-error')).toContainText('Salas temporalmente no disponibles');
    await expect(pagina.locator('#aplicacion-vista')).toBeHidden();
    await expect(pagina.locator('#reserva-lista')).toBeEmpty();
    await pagina.unroute('**/api/salas');
    comprobarAusenciaErrores(errores);
  } finally { await navegador.close(); }
}
function comprobarAusenciaErrores(errores) { if (errores.length) throw new Error(`Errores del navegador: ${errores.join('; ')}`); }
