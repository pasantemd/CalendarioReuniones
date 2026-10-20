import express from 'express';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { grupoConexiones } from './bibliotecas/base-datos.js';
import { cifrarContrasena, verificarContrasena, leerToken, hashToken } from './bibliotecas/autenticacion.js';
import { ErrorHttp, validarTexto, validarEntero, validarFechas, validarHorarioLaboral } from './bibliotecas/validacion.js';
import { enviarNotificacionReserva } from './bibliotecas/correo.js';

const aplicacion = express();
const produccion = process.env.NODE_ENV === 'production';
if (produccion && !process.env.APP_ORIGIN) throw new Error('Define APP_ORIGIN con la dirección pública HTTPS del sistema.');
const direccionOrigen = new URL(process.env.APP_ORIGIN || 'http://localhost:3000');
if (!['http:', 'https:'].includes(direccionOrigen.protocol) || direccionOrigen.pathname !== '/' || direccionOrigen.search || direccionOrigen.hash) {
  throw new Error('APP_ORIGIN debe ser el origen del sitio, por ejemplo https://calendario.empresa.com, sin subcarpetas.');
}
if (produccion && direccionOrigen.protocol !== 'https:') throw new Error('En producción APP_ORIGIN debe usar HTTPS.');
const origen = direccionOrigen.origin;
aplicacion.disable('x-powered-by');
aplicacion.use((solicitud, respuesta, siguiente) => {
  respuesta.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
  if (produccion) respuesta.set('Strict-Transport-Security', 'max-age=31536000');
  if (solicitud.path.startsWith('/api/')) {
    respuesta.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(solicitud.method) && solicitud.get('Origin') !== origen) return respuesta.status(403).json({ error: 'Origen no permitido. Recarga la aplicación desde su dirección configurada.' });
  }
  siguiente();
});
aplicacion.use(express.json({ limit: '16kb' }));
aplicacion.use('/api', (solicitud, respuesta, siguiente) => {
  if (!['GET', 'HEAD'].includes(solicitud.method) && (!solicitud.body || Array.isArray(solicitud.body) || typeof solicitud.body !== 'object')) {
    throw new ErrorHttp(400, 'Se requiere una solicitud JSON válida.');
  }
  siguiente();
});

const intentos = new Map();
const limpieza = setInterval(() => {
  for (const [key, value] of intentos) if (value.until < Date.now()) intentos.delete(key);
  grupoConexiones.query('DELETE FROM sesiones WHERE vence_en < now()').catch(error => console.error('Limpieza de sesiones:', error.message));
}, 60000);
limpieza.unref();
const hashFicticio = await cifrarContrasena(randomBytes(32).toString('hex'));
const opcionesCookie = { httpOnly: true, sameSite: 'strict', secure: produccion, path: '/' };

aplicacion.post('/api/ingresar', async (solicitud, respuesta) => {
  const key = solicitud.ip;
  const intento = intentos.get(key);
  if (intento?.until > Date.now() && intento.conteo >= 10) throw new ErrorHttp(429, 'Demasiados intentos. Espera 15 minutos.');
  const correo = validarTexto(solicitud.body.correo, 'Correo', 254).toLowerCase();
  validarTexto(solicitud.body.contrasena, 'Contraseña', 200);
  const contrasena = solicitud.body.contrasena;
  intentos.set(key, { conteo: (intento?.until > Date.now() ? intento.conteo : 0) + 1, until: Date.now() + 900000 });
  const { rows } = await grupoConexiones.query('SELECT * FROM usuarios WHERE correo=$1 AND activo=true', [correo]);
  const usuario = rows[0];
  const valida = await verificarContrasena(contrasena, usuario?.contrasena_hash || hashFicticio);
  if (!usuario || !valida) throw new ErrorHttp(401, 'Correo o contraseña incorrectos.');
  if (usuario && !usuario.contrasena_hash.includes(':')) {
    const nuevoHash = await cifrarContrasena(contrasena);
    const actualizacion = await grupoConexiones.query('UPDATE usuarios SET contrasena_hash=$1 WHERE id=$2 AND contrasena_hash=$3 RETURNING id', [nuevoHash, usuario.id, usuario.contrasena_hash]);
    if (!actualizacion.rowCount) throw new ErrorHttp(401, 'La cuenta cambió durante el ingreso. Vuelve a iniciar sesión.');
  }
  intentos.delete(key);
  const token = randomBytes(32).toString('hex');
  await grupoConexiones.query('INSERT INTO sesiones(token_hash,usuario_id,vence_en) VALUES($1,$2,now()+interval \'12 hours\')', [hashToken(token), usuario.id]);
  respuesta.cookie('apracom_session', token, { ...opcionesCookie, maxAge: 43200000 });
  respuesta.json({ id: usuario.id, nombre: usuario.nombre, correo: usuario.correo });
});

aplicacion.use('/api', async (solicitud, respuesta, siguiente) => {
  const token = leerToken(solicitud);
  const { rows } = await grupoConexiones.query(`SELECT u.id,u.nombre,u.correo FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id
    WHERE s.token_hash=$1 AND s.vence_en>now() AND u.activo=true`, [hashToken(token)]);
  if (!rows[0]) throw new ErrorHttp(401, 'Tu sesión terminó. Vuelve a iniciar sesión.');
  solicitud.usuario = rows[0]; siguiente();
});
aplicacion.get('/api/sesion', (solicitud, respuesta) => respuesta.json(solicitud.usuario));
aplicacion.post('/api/salir', async (solicitud, respuesta) => {
  await grupoConexiones.query('DELETE FROM sesiones WHERE token_hash=$1', [hashToken(leerToken(solicitud))]);
  respuesta.clearCookie('apracom_session', opcionesCookie); respuesta.json({ ok: true });
});
aplicacion.get('/api/salas', async (solicitud, respuesta) => {
  const { rows } = await grupoConexiones.query('SELECT id,nombre,capacidad,ubicacion,activo FROM salas ORDER BY id'); respuesta.json(rows);
});

const seleccionReserva = `SELECT r.*,u.nombre AS responsable,u.correo AS correo_responsable,rm.nombre AS nombre_sala,
  c.nombre AS nombre_cancelador FROM reservas r JOIN usuarios u ON u.id=r.usuario_id
  JOIN salas rm ON rm.id=r.sala_id LEFT JOIN usuarios c ON c.id=r.cancelada_por`;
aplicacion.get('/api/reservas', async (solicitud, respuesta) => {
  const [desde, hasta] = validarFechas(solicitud.query.desde, solicitud.query.hasta);
  if (new Date(hasta) - new Date(desde) > 366 * 86400000) throw new ErrorHttp(400, 'Consulta un máximo de un año por vez.');
  const valores = [desde, hasta], filtros = ['r.inicio<$2', 'r.fin>$1'];
  const vista = solicitud.query.vista || 'todas';
  if (!['todas', 'activo', 'historial'].includes(vista)) throw new ErrorHttp(400, 'Vista no válida.');
  if (vista !== 'todas') {
    valores.push(solicitud.usuario.id);
    filtros.push(`r.usuario_id=$${valores.length}`);
  }
  if (vista === 'activo') filtros.push("r.estado='confirmada' AND r.fin>now()");
  if (vista === 'historial') {
    filtros.splice(0, 2, 'COALESCE(r.cancelada_en,r.fin)>=$1', 'COALESCE(r.cancelada_en,r.fin)<$2');
    filtros.push("(r.estado='cancelada' OR r.fin<=now())");
  }
  if (solicitud.query.q) {
    const busqueda = validarTexto(solicitud.query.q, 'Búsqueda', 160).replace(/[\\%_]/g, '\\$&');
    valores.push(`%${busqueda}%`);
    filtros.push(`(r.asunto ILIKE $${valores.length} OR u.nombre ILIKE $${valores.length})`);
  }
  if (solicitud.query.sala) { valores.push(validarEntero(solicitud.query.sala, 'Sala')); filtros.push(`r.sala_id=$${valores.length}`); }
  if (solicitud.query.estado) {
    if (!['confirmada', 'cancelada', 'finalizada', 'proxima', 'iniciada'].includes(solicitud.query.estado)) throw new ErrorHttp(400, 'Estado no válido.');
    if (solicitud.query.estado === 'finalizada') filtros.push("r.estado='confirmada' AND r.fin<=now()");
    else if (solicitud.query.estado === 'proxima') filtros.push("r.estado='confirmada' AND r.inicio>now()");
    else if (solicitud.query.estado === 'iniciada') filtros.push("r.estado='confirmada' AND r.inicio<=now() AND r.fin>now()");
    else { valores.push(solicitud.query.estado); filtros.push(`r.estado=$${valores.length}`); }
  }
  const pagina = validarEntero(solicitud.query.pagina ?? 1, 'Página', 100000);
  const limite = validarEntero(solicitud.query.limite ?? 100, 'Tamaño de página', 100);
  valores.push(limite + 1, (pagina - 1) * limite);
  const orden = vista === 'historial' ? 'COALESCE(cancelada_en,fin) DESC,id DESC' : 'inicio,id';
  const { rows } = await grupoConexiones.query(`SELECT matches.*,count(*) OVER()::integer AS total_registros
    FROM (${seleccionReserva} WHERE ${filtros.join(' AND ')}) matches
    ORDER BY ${orden} LIMIT $${valores.length - 1} OFFSET $${valores.length}`, valores);
  const elementos = rows.slice(0, limite).map(({ total_registros, ...item }) => item);
  let total = rows[0]?.total_registros ?? 0;
  if (!rows.length && pagina > 1) {
    const conteo = await grupoConexiones.query(`SELECT count(*)::integer AS total FROM (${seleccionReserva} WHERE ${filtros.join(' AND ')}) matches`, valores.slice(0,-2));
    total = conteo.rows[0].total;
  }
  respuesta.json({ elementos, hayMas: rows.length > limite, total });
});
aplicacion.post('/api/reservas', async (solicitud, respuesta) => {
  const sala = validarEntero(solicitud.body.sala_id, 'Sala'), asistentes = validarEntero(solicitud.body.asistentes, 'Asistentes', 500);
  const asunto = validarTexto(solicitud.body.asunto, 'Asunto', 160), notas = validarTexto(solicitud.body.notas ?? '', 'Notas', 2000, false);
  const [inicio, fin] = validarFechas(solicitud.body.inicio, solicitud.body.fin, true);
  validarHorarioLaboral(inicio, fin);
  const cliente = await grupoConexiones.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT * FROM salas WHERE id=$1 FOR UPDATE', [sala]);
    if (!rows[0]?.activo) throw new ErrorHttp(400, 'La sala no está disponible.');
    if (asistentes > rows[0].capacidad) throw new ErrorHttp(400, `Esta sala permite hasta ${rows[0].capacidad} asistentes.`);
    if (+new Date(inicio) <= Date.now()) throw new ErrorHttp(409, 'La hora de inicio ya pasó mientras se comprobaba la sala. Elige otro horario.');
    const resultado = await cliente.query(`INSERT INTO reservas(sala_id,usuario_id,asunto,asistentes,notas,inicio,fin)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [sala, solicitud.usuario.id, asunto, asistentes, notas, inicio, fin]);
    const { rows: filasCompletas } = await cliente.query(`${seleccionReserva} WHERE r.id=$1`, [resultado.rows[0].id]);
    await cliente.query('COMMIT');
    const reservaCreada = filasCompletas[0] || resultado.rows[0];
    enviarNotificacionReserva(reservaCreada, 'creada').catch(err => console.error('[CORREO]', err.message));
    respuesta.status(201).json(reservaCreada);
  } catch (error) { await cliente.query('ROLLBACK'); throw error; } finally { cliente.release(); }
});
aplicacion.patch('/api/reservas/:id', async (solicitud, respuesta) => {
  const id = validarEntero(solicitud.params.id, 'Reserva');
  const sala = validarEntero(solicitud.body.sala_id, 'Sala'), asistentes = validarEntero(solicitud.body.asistentes, 'Asistentes', 500);
  const asunto = validarTexto(solicitud.body.asunto, 'Asunto', 160), notas = validarTexto(solicitud.body.notas ?? '', 'Notas', 2000, false);
  const [inicio, fin] = validarFechas(solicitud.body.inicio, solicitud.body.fin, true);
  validarHorarioLaboral(inicio, fin);

  const cliente = await grupoConexiones.connect();
  try {
    await cliente.query('BEGIN');
    const { rows: filasAnteriores } = await cliente.query('SELECT * FROM reservas WHERE id=$1 FOR UPDATE', [id]);
    const anterior = filasAnteriores[0];
    if (!anterior) throw new ErrorHttp(404, 'Reunión no encontrada.');
    if (anterior.estado !== 'confirmada') throw new ErrorHttp(409, 'Solo se pueden editar reuniones confirmadas.');
    if (new Date(anterior.inicio) <= new Date()) {
      throw new ErrorHttp(409, 'Solo se pueden editar reuniones futuras que aún no hayan comenzado.');
    }

    const { rows: filasSalas } = await cliente.query('SELECT * FROM salas WHERE id=$1 FOR UPDATE', [sala]);
    if (!filasSalas[0]?.activo) throw new ErrorHttp(400, 'La sala seleccionada no está disponible.');
    if (asistentes > filasSalas[0].capacidad) {
      throw new ErrorHttp(400, `Esta sala permite hasta ${filasSalas[0].capacidad} asistentes.`);
    }

    if (+new Date(inicio) <= Date.now() || +new Date(anterior.inicio) <= Date.now()) throw new ErrorHttp(409, 'La reunión ya comenzó mientras se comprobaba la sala. Actualiza el calendario.');
    await cliente.query(
      `UPDATE reservas
       SET sala_id=$1, asunto=$2, asistentes=$3, notas=$4, inicio=$5, fin=$6
       WHERE id=$7`,
      [sala, asunto, asistentes, notas, inicio, fin, id]
    );

    const { rows: filasCompletas } = await cliente.query(`${seleccionReserva} WHERE r.id=$1`, [id]);
    await cliente.query('COMMIT');

    const reservaModificada = filasCompletas[0];
    enviarNotificacionReserva(reservaModificada, 'actualizada').catch(err => console.error('[CORREO]', err.message));
    respuesta.json(reservaModificada);
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
});
async function cancelarReserva(id, usuario, motivo, soloPropia) {
  const cliente = await grupoConexiones.connect();
  try {
    await cliente.query('BEGIN');
    const { rows } = await cliente.query('SELECT usuario_id,estado,inicio FROM reservas WHERE id=$1 FOR UPDATE', [id]);
    const reserva = rows[0];
    if (soloPropia && reserva?.usuario_id !== usuario) throw new ErrorHttp(403, 'Solo puedes eliminar tus propias reuniones.');
    if (!reserva || reserva.estado !== 'confirmada' || +new Date(reserva.inicio) <= Date.now()) {
      throw new ErrorHttp(soloPropia ? 403 : 409, 'Solo puedes cancelar o eliminar reuniones que aún no han comenzado.');
    }
    await cliente.query(`UPDATE reservas SET estado='cancelada',cancelada_en=clock_timestamp(),cancelada_por=$1,motivo_cancelacion=$2 WHERE id=$3`, [usuario, motivo, id]);
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally { cliente.release(); }
}
aplicacion.post('/api/reservas/:id/cancelar', async (solicitud, respuesta) => {
  const id = validarEntero(solicitud.params.id, 'Reserva');
  const motivo = validarTexto(solicitud.body.motivo, 'Motivo de cancelación', 500);
  await cancelarReserva(id, solicitud.usuario.id, motivo, false);
  respuesta.json({ ok: true });
});
aplicacion.delete('/api/reservas/:id', async (solicitud, respuesta) => {
  const id = validarEntero(solicitud.params.id, 'Reserva');
  await cancelarReserva(id, solicitud.usuario.id, 'Reunión eliminada por su responsable', true);
  respuesta.json({ ok: true });
});
aplicacion.use('/api', (solicitud, respuesta) => respuesta.status(404).json({ error: 'Ruta no encontrada.' }));
aplicacion.use(express.static(fileURLToPath(new URL('./public', import.meta.url)), { index: 'inicio.html' }));
aplicacion.use((error, solicitud, respuesta, siguiente) => {
  if (error.code === '23P01') return respuesta.status(409).json({ error: 'Ese horario ya está reservado. Selecciona otro horario o sala.' });
  if (error.code === '23505') return respuesta.status(409).json({ error: 'Ya existe un registro con ese nombre o correo.' });
  if (error instanceof SyntaxError || error.type === 'entity.too.large') return respuesta.status(400).json({ error: 'Solicitud no válida o demasiado grande.' });
  if (!error.status) console.error(error.message);
  respuesta.status(error.status || 503).json({ error: error.status ? error.message : 'No se pudo acceder al servicio. Intenta de nuevo en unos momentos.' });
});
const puerto = validarEntero(process.env.PORT ?? 3000, 'Puerto', 65535);
const servidor = aplicacion.listen(puerto, process.env.HOST || (produccion ? '0.0.0.0' : '127.0.0.1'), () => console.log(`Calendario Apracom: ${origen}`));
servidor.on('error', async error => {
  console.error('No se pudo iniciar el servidor:', error.message);
  await grupoConexiones.end();
  process.exitCode = 1;
});
process.on('SIGTERM', () => servidor.close(() => grupoConexiones.end()));
