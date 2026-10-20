import test from 'node:test';
import assert from 'node:assert/strict';
import { validarFechas, validarEntero, validarTexto, validarHorarioLaboral } from '../bibliotecas/validacion.js';
import { createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { cifrarContrasena, verificarContrasena, leerToken } from '../bibliotecas/autenticacion.js';
import { sugerirHorario } from '../public/js/nucleo.js';

test('horarios con zona explícita, duración máxima y fecha futura', () => {
  assert.throws(() => validarFechas('2030-01-01T10:00', '2030-01-01T11:00'));
  assert.throws(() => validarFechas('2030-01-01T10:00:00Z', '2030-01-01T09:00:00Z'));
  assert.throws(() => validarFechas('2020-01-01T10:00:00Z', '2020-01-01T11:00:00Z', true));
  assert.throws(() => validarFechas('2030-02-30T10:00:00Z', '2030-03-02T11:00:00Z', true));
  assert.throws(() => validarFechas('2030-01-01T10:00:00Z', '2030-01-03T11:00:00Z', true));
  assert.deepEqual(validarFechas('2030-01-01T23:00:00-05:00', '2030-01-02T01:00:00-05:00', true), ['2030-01-02T04:00:00.000Z', '2030-01-02T06:00:00.000Z']);
});
test('validación de aforo y límites de texto', () => {
  for (const invalido of [0, -1, 1.5, 'x', 501, true, false, [], [1], null, '1e2']) assert.throws(() => validarEntero(invalido, 'Aforo', 500));
  assert.equal(validarEntero('8', 'Aforo'), 8);
  assert.throws(() => validarTexto('   ', 'Asunto', 160));
  assert.throws(() => validarTexto('a'.repeat(161), 'Asunto', 160));
  assert.equal(validarTexto(' Reunión ', 'Asunto', 160), 'Reunión');
});
test('contraseñas con sal y cookies de sesión', async () => {
  const contrasena = ' Clave larga de prueba ';
  const hash = await cifrarContrasena(contrasena);
  assert.notEqual(hash, await cifrarContrasena(contrasena));
  assert.equal(await verificarContrasena(contrasena, hash), true);
  assert.equal(await verificarContrasena('incorrecta', hash), false);
  assert.equal(leerToken({ headers: { cookie: 'otro=abc; apracom_session=123abc; foo=bar' } }), '123abc');
});

test('WordPress moderno valida el HMAC antes de bcrypt', async () => {
  const contrasena = 'Contraseña importada ñ';
  const hashPrevio = createHmac('sha384', 'wp-sha384').update(contrasena).digest('base64');
  const hashAnterior = '$wp' + (await bcrypt.hash(hashPrevio, 4)).replace('$2b$', '$2y$');
  assert.equal(await verificarContrasena(contrasena, hashAnterior), true);
  assert.equal(await verificarContrasena('incorrecta', hashAnterior), false);
});

test('el cierre a las 17:00 incluye segundos y milisegundos', () => {
  validarHorarioLaboral('2030-01-01T08:00:00-05:00', '2030-01-01T17:00:00-05:00');
  assert.throws(() => validarHorarioLaboral('2030-01-01T16:00:00-05:00', '2030-01-01T17:00:01-05:00'));
  assert.throws(() => validarHorarioLaboral('2030-01-01T16:00:00-05:00', '2030-01-01T17:00:00.001-05:00'));
});

test('rechaza fechas con tipos incorrectos sin TypeError', () => {
  for (const valor of [[], ['2030-01-01T10:00:00Z'], null, {}, 123]) {
    assert.throws(() => validarFechas(valor, '2030-01-01T11:00:00Z'), error => error.status === 400);
  }
});

test('sugiere horarios futuros dentro de la jornada de Ecuador', () => {
  assert.deepEqual(sugerirHorario('2030-01-01',new Date('2030-01-01T15:10:00-05:00')), {fecha:'2030-01-01',inicio:'15:30',fin:'16:30'});
  assert.deepEqual(sugerirHorario('2030-01-01',new Date('2030-01-01T16:10:00-05:00')), {fecha:'2030-01-01',inicio:'16:30',fin:'17:00'});
  assert.deepEqual(sugerirHorario('2030-01-01',new Date('2030-01-01T16:45:00-05:00')), {fecha:'2030-01-02',inicio:'08:00',fin:'09:00'});
  assert.deepEqual(sugerirHorario('2030-01-01',new Date('2030-01-01T06:00:00-05:00')), {fecha:'2030-01-01',inicio:'08:00',fin:'09:00'});
});
