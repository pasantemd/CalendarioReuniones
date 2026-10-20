// Registro manual de usuario con clave cifrada

import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { grupoConexiones } from '../bibliotecas/base-datos.js';
import { cifrarContrasena } from '../bibliotecas/autenticacion.js';
import { validarTexto } from '../bibliotecas/validacion.js';

const interfazLectura = createInterface({ input: stdin, output: stdout });

try {
  const nombre = validarTexto(await interfazLectura.question('Nombre completo: '), 'Nombre', 120);
  const correo = validarTexto(await interfazLectura.question('Correo corporativo: '), 'Correo', 254).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new Error('Correo electrónico no válido.');
  }

  // Leer la contraseña desde la variable de entorno para mayor seguridad
  const contrasena = process.env.NEW_USER_PASSWORD;
  if (!contrasena?.trim() || contrasena.length < 12 || contrasena.length > 200) {
    throw new Error('Define NEW_USER_PASSWORD con entre 12 y 200 caracteres antes de ejecutar.');
  }

  const hash = await cifrarContrasena(contrasena);
  await grupoConexiones.query(
    'INSERT INTO usuarios(nombre, correo, contrasena_hash) VALUES($1, $2, $3)',
    [nombre, correo, hash]
  );

  console.log(`Usuario "${nombre}" (${correo}) creado exitosamente.`);
} catch (error) {
  console.error(error.code === '23505' ? 'Ese correo ya está registrado.' : error.message);
  process.exitCode = 1;
} finally {
  interfazLectura.close();
  await grupoConexiones.end();
}
