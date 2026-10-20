// Conexión a base de datos PostgreSQL

import pg from 'pg';

export const grupoConexiones = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000
});

grupoConexiones.on('error', error => console.error('Error de conexión PostgreSQL:', error.message));
