import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { cifrarContrasena } from '../bibliotecas/autenticacion.js';

test('PostgreSQL y API: autenticación, cruces simultáneos, aforo, permisos e historial', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  // Use only a disposable database explicitly named *_test.
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.match(url.pathname, /_test$/);
  const grupoConexiones = new pg.Pool({ connectionString: url.toString() });
  await grupoConexiones.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await grupoConexiones.query(await readFile(new URL('../bd/esquema.sql', import.meta.url), 'utf8'));
  const hash = await cifrarContrasena('Prueba-segura-2026');
  await grupoConexiones.query(`INSERT INTO usuarios(nombre,correo,contrasena_hash) VALUES ('Admin Test','administrador@test.invalido',$1),('Empleado Test','empleado@test.invalido',$1),('Otro Test','otro@test.invalido',$1)`, [hash]);
  const puerto = 3107, origen = `http://localhost:${puerto}`;
  const procesoHijo = spawn(process.execPath, ['servidor.js'], { env: { ...process.env, DATABASE_URL: url.toString(), PORT: String(puerto), APP_ORIGIN: `${origen}/` }, stdio: 'pipe' });
  let salidaProceso = ''; procesoHijo.stdout.on('data', data => salidaProceso += data); procesoHijo.stderr.on('data', data => salidaProceso += data);
  t.after(async () => { procesoHijo.kill(); await grupoConexiones.end(); });
  for (let intento = 0; intento < 60; intento++) {
    try { await fetch(`${origen}/`); break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    if (intento === 59) throw new Error(salidaProceso || 'No inició el servidor');
  }
  async function solicitar(path, method = 'GET', body, cookie = '') {
    const resultado = await fetch(`${origen}/api${path}`, { method, headers: { Origin: origen, 'Content-Type': 'application/json', Cookie: cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: resultado.status, data: await resultado.json(), cookie: resultado.headers.get('set-cookie')?.split(';')[0], headers: resultado.headers };
  }
  assert.equal((await solicitar('/salas')).status, 401);
  assert.match((await solicitar('/salas')).headers.get('content-security-policy'), /form-action 'self'/);
  assert.equal((await solicitar('/ingresar', 'POST', { correo: 'administrador@test.invalido', contrasena: 'incorrecta' })).status, 401);
  const administrador = await solicitar('/ingresar', 'POST', { correo: 'administrador@test.invalido', contrasena: 'Prueba-segura-2026' });
  const empleado = await solicitar('/ingresar', 'POST', { correo: 'empleado@test.invalido', contrasena: 'Prueba-segura-2026' });
  const otro = await solicitar('/ingresar', 'POST', { correo: 'otro@test.invalido', contrasena: 'Prueba-segura-2026' });
  assert.equal(administrador.status, 200); assert.match(administrador.headers.get('set-cookie'), /HttpOnly/);
  const procesoUsuario = spawn(process.execPath, ['herramientas/crear-usuario.js'], {
    env: {...process.env,DATABASE_URL:url.toString(),NEW_USER_PASSWORD:'Clave-nueva-prueba-2026'}, stdio:'pipe'
  });
  const respuestasUsuario = [['Nombre completo: ','Nuevo Test\n'],['Correo corporativo: ','nuevo@test.invalid\n']];
  let etapaUsuario=0, salidaUsuario='';
  procesoUsuario.stdout.on('data',dato=>{
    salidaUsuario+=dato;
    while(etapaUsuario<respuestasUsuario.length && salidaUsuario.includes(respuestasUsuario[etapaUsuario][0])) {
      procesoUsuario.stdin.write(respuestasUsuario[etapaUsuario++][1]);
    }
  });
  procesoUsuario.stderr.on('data',dato=>{salidaUsuario+=dato;});
  await new Promise((resolver,rechazar)=>{
    const limite=setTimeout(()=>{procesoUsuario.kill();rechazar(new Error('No finalizó la creación de usuario.'));},10000);
    procesoUsuario.once('error',error=>{clearTimeout(limite);rechazar(error);});
    procesoUsuario.once('close',codigo=>{clearTimeout(limite);codigo===0?resolver():rechazar(new Error(salidaUsuario));});
  });
  const nuevoUsuario=await solicitar('/ingresar','POST',{correo:'nuevo@test.invalid',contrasena:'Clave-nueva-prueba-2026'});
  assert.equal(nuevoUsuario.status,200);
  assert.equal(nuevoUsuario.data.nombre,'Nuevo Test');
  assert.equal(Object.hasOwn(nuevoUsuario.data, 'rol'), false);
  for (const [herramienta, respuestas] of [
    ['crear-usuario.js', [['Nombre completo: ', 'Clave vacía\n'], ['Correo corporativo: ', 'vacia@test.invalid\n']]],
    ['restablecer-clave.js', [['Correo de la cuenta: ', 'nuevo@test.invalid\n']]]
  ]) {
    const proceso = spawn(process.execPath, [`herramientas/${herramienta}`], {
      env: {...process.env,DATABASE_URL:url.toString(),NEW_USER_PASSWORD:' '.repeat(12)},stdio:'pipe'
    });
    let salida='', etapa=0;
    proceso.stdout.on('data', dato=>{
      salida+=dato;
      while(etapa<respuestas.length && salida.includes(respuestas[etapa][0])) proceso.stdin.write(respuestas[etapa++][1]);
    });
    proceso.stderr.on('data', dato=>{salida+=dato;});
    const codigo=await new Promise((resolver,rechazar)=>{
      const limite=setTimeout(()=>{proceso.kill();rechazar(new Error('La herramienta no terminó.'));},10000);
      proceso.once('error',error=>{clearTimeout(limite);rechazar(error);});
      proceso.once('close',codigo=>{clearTimeout(limite);resolver(codigo);});
    });
    assert.equal(codigo,1,salida);
    assert.match(salida,/NEW_USER_PASSWORD/);
  }
  assert.equal((await solicitar('/ingresar','POST',{correo:'nuevo@test.invalid',contrasena:'Clave-nueva-prueba-2026'})).status,200);
  for (const cookie of [empleado.cookie, administrador.cookie]) {
    assert.equal((await solicitar('/salas', 'POST', { nombre: 'No permitido', capacidad: 2 }, cookie)).status, 404);
    assert.equal((await solicitar('/salas/1', 'PATCH', { nombre: 'Cambio' }, cookie)).status, 404);
  }
  const salas = await solicitar('/salas', 'GET', undefined, administrador.cookie); assert.equal(salas.data.length, 2);
  const inicio = new Date(Date.now() + 3 * 86400000); inicio.setUTCHours(14, 0, 0, 0);
  const fin = new Date(+inicio + 3600000);
  const reservaNueva = { asunto: '<script>alert(1)</script> Prueba', sala_id: 1, asistentes: 4, inicio: inicio.toISOString(), fin: fin.toISOString(), notas: 'Validación real' };
  const simultaneas = await Promise.all([solicitar('/reservas', 'POST', reservaNueva, empleado.cookie), solicitar('/reservas', 'POST', reservaNueva, empleado.cookie)]);
  assert.deepEqual(simultaneas.map(value => value.status).sort(), [201, 409]);
  const reserva = simultaneas.find(value => value.status === 201).data;
  await assert.rejects(grupoConexiones.query(`UPDATE reservas SET estado='cancelada',cancelada_en=now(),cancelada_por=usuario_id,motivo_cancelacion=NULL WHERE id=$1`, [reserva.id]), {code:'23514'});
  assert.equal((await solicitar('/reservas', 'POST', { ...reservaNueva, sala_id: 2 }, otro.cookie)).status, 201);
  assert.equal((await solicitar('/reservas', 'POST', { ...reservaNueva, inicio: fin.toISOString(), fin: new Date(+fin + 3600000).toISOString() }, empleado.cookie)).status, 201);
  assert.equal((await solicitar('/reservas', 'POST', { ...reservaNueva, asistentes: 501 }, empleado.cookie)).status, 400);
  assert.equal((await solicitar(`/reservas/${reserva.id}`, 'PATCH', { ...reservaNueva, asunto: 'Edición compartida' }, otro.cookie)).status, 200);
  assert.equal((await solicitar(`/reservas/${reserva.id}/cancelar`, 'POST', { motivo: 'Cambio de horario' }, otro.cookie)).status, 200);
  assert.equal((await solicitar(`/reservas/${reserva.id}/cancelar`, 'POST', { motivo: 'Repetida' }, empleado.cookie)).status, 409);
  assert.equal((await solicitar('/reservas', 'POST', reservaNueva, empleado.cookie)).status, 201);
  const consulta = new URLSearchParams({ desde: new Date(+inicio - 3600000).toISOString(), hasta: new Date(+fin + 7200000).toISOString() });
  const historial = await solicitar(`/reservas?${consulta}`, 'GET', undefined, administrador.cookie);
  assert.equal(historial.data.elementos.length, 4);
  const cancelada = historial.data.elementos.find(value => value.id === reserva.id);
  assert.equal(cancelada.estado, 'cancelada'); assert.equal(cancelada.nombre_cancelador, 'Otro Test'); assert.equal(cancelada.motivo_cancelacion, 'Cambio de horario');
  for (const cookie of [empleado.cookie, otro.cookie]) {
    assert.deepEqual((await solicitar(`/reservas?${consulta}`, 'GET', undefined, cookie)).data, historial.data);
    assert.deepEqual((await solicitar(`/reservas?${consulta}&mine=true`, 'GET', undefined, cookie)).data, historial.data);
  }
  const soloCanceladas = await solicitar(`/reservas?${consulta}&estado=cancelada&sala=1`, 'GET', undefined, empleado.cookie);
  assert.equal(soloCanceladas.data.elementos.length, 1);
  assert.equal(soloCanceladas.data.elementos[0].id, reserva.id);
  assert.equal((await solicitar(`/reservas?${consulta}&sala=2`, 'GET', undefined, empleado.cookie)).data.elementos.length, 1);
  assert.equal((await solicitar(`/reservas?${consulta}&estado=finalizada`, 'GET', undefined, empleado.cookie)).data.elementos.length, 0);
  const activo = await solicitar(`/reservas?${consulta}&vista=activo`, 'GET', undefined, empleado.cookie);
  assert.equal(activo.data.elementos.length, 2);
  assert.ok(activo.data.elementos.every(item => item.estado === 'confirmada'));
  assert.ok(activo.data.elementos.every(item => item.usuario_id === empleado.data.id));
  const otrasActivas = await solicitar(`/reservas?${consulta}&vista=activo`, 'GET', undefined, otro.cookie);
  assert.equal(otrasActivas.data.elementos.length, 1);
  assert.ok(otrasActivas.data.elementos.every(item => item.usuario_id === otro.data.id));
  const consultaActividad = new URLSearchParams({ desde: new Date(Date.now()-86400000).toISOString(), hasta: new Date(Date.now()+86400000).toISOString(), vista: 'historial' });
  const actividad = await solicitar(`/reservas?${consultaActividad}`, 'GET', undefined, empleado.cookie);
  assert.equal(actividad.data.elementos.length, 1);
  assert.equal(actividad.data.elementos[0].id, reserva.id);
  const otroHistorial = await solicitar(`/reservas?${consultaActividad}`, 'GET', undefined, otro.cookie);
  assert.equal(otroHistorial.data.total, 0);
  assert.equal((await solicitar(`/reservas?${consulta}&q=Edición%20compartida`, 'GET', undefined, empleado.cookie)).data.total, 1);
  assert.equal((await solicitar(`/reservas?${consulta}&q=NO-EXISTE`, 'GET', undefined, empleado.cookie)).data.total, 0);
  const paginaPequena = await solicitar(`/reservas?${consulta}&vista=activo&limite=2`, 'GET', undefined, empleado.cookie);
  assert.equal(paginaPequena.data.elementos.length, 2); assert.equal(paginaPequena.data.total, 2); assert.equal(paginaPequena.data.hayMas, false);
  assert.equal((await solicitar(`/reservas?${consulta}&vista=invalido`, 'GET', undefined, empleado.cookie)).status, 400);
  assert.equal((await solicitar(`/reservas?${consulta}&limite=101`, 'GET', undefined, empleado.cookie)).status, 400);
  assert.equal((await solicitar(`/reservas?${consulta}&estado=invalido`, 'GET', undefined, empleado.cookie)).status, 400);
  const consultaLarga = new URLSearchParams({ desde: inicio.toISOString(), hasta: new Date(+inicio + 367*86400000).toISOString() });
  assert.equal((await solicitar(`/reservas?${consultaLarga}`, 'GET', undefined, empleado.cookie)).status, 400);
  await grupoConexiones.query(`INSERT INTO reservas(sala_id,usuario_id,asunto,asistentes,inicio,fin)
    SELECT 2,$1,'Histórico de prueba ' || g,1,$2::timestamptz-g*interval '1 day',
      $2::timestamptz-g*interval '1 day'+interval '1 hour' FROM generate_series(200,300) g`, [otro.data.id, inicio.toISOString()]);
  const consultaPasada = new URLSearchParams({ desde: new Date(+inicio-301*86400000).toISOString(), hasta: new Date(+inicio-198*86400000).toISOString(), sala: '2', status: 'finalizada' });
  const primeraPagina = await solicitar(`/reservas?${consultaPasada}`, 'GET', undefined, empleado.cookie);
  const segundaPagina = await solicitar(`/reservas?${consultaPasada}&pagina=2`, 'GET', undefined, empleado.cookie);
  assert.equal(primeraPagina.data.elementos.length, 100); assert.equal(primeraPagina.data.hayMas, true);
  assert.equal(segundaPagina.data.elementos.length, 1); assert.equal(segundaPagina.data.hayMas, false);
  const paginaVacia = await solicitar(`/reservas?${consultaPasada}&pagina=3`, 'GET', undefined, empleado.cookie);
  assert.equal(paginaVacia.data.elementos.length, 0); assert.equal(paginaVacia.data.total, 101);
  assert.equal((await solicitar('/reservas','POST',{...reservaNueva,sala_id:true},empleado.cookie)).status,400);
  assert.equal((await solicitar('/reservas','POST',{...reservaNueva,inicio:[reservaNueva.inicio]},empleado.cookie)).status,400);
  assert.ok(!primeraPagina.data.elementos.some(item => item.id === segundaPagina.data.elementos[0].id));
  const bloqueada = await fetch(`${origen}/api/salir`, { method: 'POST', headers: { Origin: 'https://externo.invalido', Cookie: administrador.cookie, 'Content-Type': 'application/json' }, body: '{}' });
  const propia = await solicitar('/reservas', 'POST', { ...reservaNueva, inicio:new Date(+inicio+7200000).toISOString(), fin:new Date(+inicio+10800000).toISOString() }, empleado.cookie);
  assert.equal(propia.status, 201);
  assert.equal((await solicitar(`/reservas/${propia.data.id}`, 'DELETE', {}, otro.cookie)).status, 403);
  assert.equal((await solicitar(`/reservas/${propia.data.id}`, 'DELETE', {}, administrador.cookie)).status, 403);
  assert.equal((await solicitar(`/reservas/${propia.data.id}`, 'DELETE', {}, empleado.cookie)).status, 200);
  assert.equal((await solicitar(`/reservas/${propia.data.id}`, 'DELETE', {}, empleado.cookie)).status, 403);
  const eliminada = await grupoConexiones.query('SELECT estado,cancelada_por,motivo_cancelacion FROM reservas WHERE id=$1', [propia.data.id]);
  assert.equal(eliminada.rows[0].estado, 'cancelada');
  assert.equal(eliminada.rows[0].cancelada_por, empleado.data.id);
  assert.match(eliminada.rows[0].motivo_cancelacion, /eliminada/);
  for (const [asunto, desde, hasta] of [['Reunión terminada propia', -7200000, -3600000], ['Reunión iniciada propia', -1800000, 1800000]]) {
    const datosPrueba = await grupoConexiones.query(`INSERT INTO reservas(sala_id,usuario_id,asunto,asistentes,inicio,fin)
      VALUES(1,$1,$2,2,$3,$4) RETURNING id`, [administrador.data.id, asunto, new Date(Date.now()+desde), new Date(Date.now()+hasta)]);
    const id = datosPrueba.rows[0].id;
    assert.equal((await solicitar(`/reservas/${id}`, 'DELETE', {}, administrador.cookie)).status, 403);
    assert.equal((await solicitar(`/reservas/${id}/cancelar`, 'POST', {motivo:'Prueba'}, administrador.cookie)).status, 409);
    assert.equal((await solicitar(`/reservas/${id}`, 'PATCH', reservaNueva, administrador.cookie)).status, 409);
  }
  assert.equal(bloqueada.status, 403);
  for (const method of ['cancel', 'delete']) {
    const datosPrueba = await grupoConexiones.query(`INSERT INTO reservas(sala_id,usuario_id,asunto,asistentes,inicio,fin)
      VALUES(2,$1,'Comienza durante el bloqueo',1,$2,$3) RETURNING id`,
      [administrador.data.id,new Date(Date.now()+1800),new Date(Date.now()+3600000)]);
    const id = datosPrueba.rows[0].id;
    const bloqueo = await grupoConexiones.connect();
    let pendiente;
    try {
      await bloqueo.query('BEGIN');
      await bloqueo.query('SELECT id FROM reservas WHERE id=$1 FOR UPDATE',[id]);
      pendiente = method === 'cancel'
        ? solicitar(`/reservas/${id}/cancelar`,'POST',{motivo:'Prueba concurrente'},administrador.cookie)
        : solicitar(`/reservas/${id}`,'DELETE',{},administrador.cookie);
      await new Promise(resolve => setTimeout(resolve,2000));
      await bloqueo.query('COMMIT');
      assert.equal((await pendiente).status,method === 'cancel' ? 409 : 403);
    } finally {
      await bloqueo.query('ROLLBACK'); bloqueo.release();
      if (pendiente) await pendiente;
      await grupoConexiones.query('DELETE FROM reservas WHERE id=$1',[id]);
    }
  }
  assert.equal((await solicitar('/salir', 'POST', {}, empleado.cookie)).status, 200);
  assert.equal((await solicitar('/sesion', 'GET', undefined, empleado.cookie)).status, 401);
  if (process.env.RUN_BROWSER_TESTS === '1') {
    const { probarNavegador } = await import('../herramientas/probar-navegador.js');
    await probarNavegador(origen);
  }
});
