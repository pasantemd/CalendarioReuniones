import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.env.DATABASE_URL) throw new Error('Define DATABASE_URL para respaldar la base.');
const conexion = new URL(process.env.DATABASE_URL);
const carpeta = new URL('../datos-locales/', import.meta.url);
await mkdir(carpeta, { recursive: true });
const archivo = fileURLToPath(new URL(`CalendarioApracom-espanol-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`, carpeta));
const rutaWindows = 'C:/Program Files/PostgreSQL/18/bin/pg_dump.exe';
const ejecutable = process.env.PG_DUMP_RUTA || (process.platform === 'win32' && existsSync(rutaWindows) ? rutaWindows : 'pg_dump');
try {
  execFileSync(ejecutable, ['--format=custom', '--no-owner', '--no-privileges', '--file', archivo], {
    env: { ...process.env, PGHOST: conexion.hostname, PGPORT: conexion.port || '5432',
      PGUSER: decodeURIComponent(conexion.username), PGPASSWORD: decodeURIComponent(conexion.password),
      PGDATABASE: decodeURIComponent(conexion.pathname.slice(1)),
      ...(conexion.searchParams.has('sslmode') ? { PGSSLMODE: conexion.searchParams.get('sslmode') } : {}) },
    stdio: 'pipe'
  });
  console.log(`Respaldo completo creado: ${archivo}`);
} catch {
  throw new Error('No se pudo crear el respaldo. Comprueba pg_dump, la conexión, los permisos y la configuración TLS.');
}
