import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

test('arranque de hosting sin .env, desde otra carpeta y con recursos correctos', async t => {
  const carpeta = await mkdtemp(join(tmpdir(), 'apracom-despliegue-'));
  const variables = { ...process.env, NODE_ENV: 'production', PORT: '3108',
    APP_ORIGIN: 'https://calendario.test.invalid/', DATABASE_URL: 'postgresql://pruebas@127.0.0.1:1/despliegue_test' };
  delete variables.HOST;
  const proceso = spawn(process.execPath, ['--env-file-if-exists=.env', fileURLToPath(new URL('../servidor.js', import.meta.url))],
    { cwd: carpeta, env: variables, stdio: 'pipe' });
  let salida = '';
  proceso.stdout.on('data', dato => { salida += dato; });
  proceso.stderr.on('data', dato => { salida += dato; });
  t.after(async () => {
    if (proceso.exitCode === null && proceso.signalCode === null) {
      const terminado = once(proceso, 'exit'); proceso.kill(); await terminado;
    }
    await rmdir(carpeta);
  });
  let respuesta;
  for (let intento = 0; intento < 60; intento++) {
    try { respuesta = await fetch('http://127.0.0.1:3108/'); break; }
    catch { await new Promise(resolver => setTimeout(resolver, 100)); }
  }
  assert.ok(respuesta, salida || 'No inició el servidor de hosting');
  assert.equal(respuesta.status, 200);
  assert.match(respuesta.headers.get('strict-transport-security'), /max-age=/);
  const html = await respuesta.text();
  const rutas = [...html.matchAll(/(?:src|href)="(\/[^"\s]+)"/g)].map(coincidencia => coincidencia[1]);
  assert.ok(rutas.includes('/recursos/favicon-apracom.png'));
  for (const ruta of new Set(rutas)) {
    assert.equal((await fetch(`http://127.0.0.1:3108${ruta}`)).status, 200, `Recurso inexistente: ${ruta}`);
  }
});
