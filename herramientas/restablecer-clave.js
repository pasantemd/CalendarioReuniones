// Restablecimiento de contraseña y cierre de sesiones activas

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { grupoConexiones } from '../bibliotecas/base-datos.js';
import { cifrarContrasena } from '../bibliotecas/autenticacion.js';

const interfazLectura = createInterface({ input: stdin, output: stdout });
const cliente = await grupoConexiones.connect();

try {
  const correo = (await interfazLectura.question('Correo de la cuenta: ')).trim().toLowerCase();
  const contrasena = process.env.NEW_USER_PASSWORD;
  if (!contrasena?.trim() || contrasena.length < 12 || contrasena.length > 200) {
    throw new Error('Define NEW_USER_PASSWORD con entre 12 y 200 caracteres.');
  }

  await cliente.query('BEGIN');
  const resultado = await cliente.query(
    'UPDATE usuarios SET contrasena_hash = $1 WHERE correo = $2 RETURNING id',
    [await cifrarContrasena(contrasena), correo]
  );

  if (!resultado.rowCount) {
    throw new Error('Cuenta de usuario no encontrada.');
  }

  await cliente.query('DELETE FROM sesiones WHERE usuario_id = $1', [resultado.rows[0].id]);
  await cliente.query('COMMIT');
  console.log(`Contraseña actualizada para "${correo}". Se cerraron las sesiones anteriores.`);
} catch (error) {
  await cliente.query('ROLLBACK');
  console.error(error.message);
  process.exitCode = 1;
} finally {
  interfazLectura.close();
  cliente.release();
  await grupoConexiones.end();
}
