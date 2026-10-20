// Creación de la base de datos PostgreSQL

import pg from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('Configura la variable DATABASE_URL en el archivo .env.');
}

const urlDestino = new URL(process.env.DATABASE_URL);
if (decodeURIComponent(urlDestino.pathname) !== '/CalendarioApracom') {
  throw new Error('DATABASE_URL debe apuntar a la base de datos "CalendarioApracom".');
}

urlDestino.pathname = '/postgres';
const cliente = new pg.Client({ connectionString: urlDestino.toString() });

try {
  await cliente.connect();
  const existente = await cliente.query('SELECT 1 FROM pg_database WHERE datname = $1', ['CalendarioApracom']);
  if (existente.rowCount) {
    console.log('La base de datos "CalendarioApracom" ya existe.');
  } else {
    await cliente.query('CREATE DATABASE "CalendarioApracom"');
    console.log('Base de datos "CalendarioApracom" creada exitosamente.');
  }
} finally {
  await cliente.end();
}
