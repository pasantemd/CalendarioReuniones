// Configuración inicial del esquema de base de datos

import { readFile } from 'node:fs/promises';
import { grupoConexiones } from '../bibliotecas/base-datos.js';

try {
  const esquemaSql = await readFile(new URL('../bd/esquema.sql', import.meta.url), 'utf8');
  await grupoConexiones.query(esquemaSql);
  console.log('Tablas e índices creados con éxito. Ejecuta "npm run usuario:crear" para registrar usuarios.');
} finally {
  await grupoConexiones.end();
}
