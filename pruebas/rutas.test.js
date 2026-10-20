import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../', import.meta.url));
async function comprobarRuta(ruta) {
  const partes = relative(raiz, ruta).split(sep);
  assert.ok(!partes.includes('..'), `Ruta fuera del proyecto: ${ruta}`);
  let carpeta = raiz;
  for (const parte of partes) {
    assert.ok((await readdir(carpeta)).includes(parte), `Nombre o mayúsculas incorrectos: ${ruta}`);
    carpeta = join(carpeta, parte);
  }
}
async function listar(carpeta) {
  const entradas = await readdir(carpeta, {withFileTypes:true});
  return (await Promise.all(entradas.map(entrada => entrada.isDirectory()
    ? listar(join(carpeta,entrada.name)) : [join(carpeta,entrada.name)]))).flat();
}
test('importaciones, comandos npm y documentos tienen rutas exactas para Linux', async () => {
  const archivos = [join(raiz,'servidor.js'), ...(await Promise.all(
    ['bibliotecas','herramientas','pruebas','public/js'].map(carpeta => listar(join(raiz,carpeta))))).flat()];
  for (const archivo of archivos.filter(ruta => ruta.endsWith('.js'))) {
    const codigo = await readFile(archivo,'utf8');
    for (const coincidencia of codigo.matchAll(/(?:from\s+|import\s*\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      await comprobarRuta(resolve(dirname(archivo),coincidencia[1]));
    }
  }
  const paquete = JSON.parse(await readFile(join(raiz,'package.json'),'utf8'));
  for (const comando of Object.values(paquete.scripts)) {
    const archivo = comando.match(/\s([\w./-]+\.js)(?:\s|$)/)?.[1];
    if (archivo) await comprobarRuta(resolve(raiz,archivo));
  }
  const instrucciones = await readFile(join(raiz,'README.md'),'utf8');
  for (const coincidencia of instrucciones.matchAll(/\]\(([^:)]+\.md)\)/g)) {
    await comprobarRuta(resolve(raiz,coincidencia[1]));
  }
});
