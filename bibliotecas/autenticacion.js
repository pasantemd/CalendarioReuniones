// Autenticación, cifrado y sesiones

import { randomBytes, scrypt as scryptOriginal, timingSafeEqual, createHash, createHmac } from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';

const scrypt = promisify(scryptOriginal);

const alfabeto64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function codificar64(entrada, cantidad) {
  let salida = '';
  let i = 0;
  do {
    let valor = entrada[i++];
    salida += alfabeto64[valor & 0x3f];
    if (i < cantidad) valor |= entrada[i] << 8;
    salida += alfabeto64[(valor >> 6) & 0x3f];
    if (i++ >= cantidad) break;
    if (i < cantidad) valor |= entrada[i] << 16;
    salida += alfabeto64[(valor >> 12) & 0x3f];
    if (i++ >= cantidad) break;
    salida += alfabeto64[(valor >> 18) & 0x3f];
  } while (i < cantidad);
  return salida;
}

function verificarPhpass(contrasena, hashAlmacenado) {
  if (hashAlmacenado.length !== 34 || (!hashAlmacenado.startsWith('$P$') && !hashAlmacenado.startsWith('$H$'))) return false;
  const log2Conteo = alfabeto64.indexOf(hashAlmacenado[3]);
  if (log2Conteo < 7 || log2Conteo > 30) return false;
  const conteo = 1 << log2Conteo;
  const sal = hashAlmacenado.substring(4, 12);
  if (sal.length !== 8) return false;
  let bytesHash = createHash('md5').update(sal + contrasena, 'utf8').digest();
  const bufferClave = Buffer.from(contrasena, 'utf8');
  for (let i = 0; i < conteo; i++) {
    bytesHash = createHash('md5').update(Buffer.concat([bytesHash, bufferClave])).digest();
  }
  const codificado = codificar64(bytesHash, 16);
  return (hashAlmacenado.substring(0, 12) + codificado) === hashAlmacenado;
}

export async function cifrarContrasena(contrasena) {
  const sal = randomBytes(16).toString('hex');
  const hash = await scrypt(contrasena, sal, 64);
  return `${sal}:${hash.toString('hex')}`;
}

export async function verificarContrasena(contrasena, hashAlmacenado) {
  if (!hashAlmacenado) return false;
  if (
    hashAlmacenado.startsWith('$wp$2y$') ||
    hashAlmacenado.startsWith('$2y$') ||
    hashAlmacenado.startsWith('$2a$') ||
    hashAlmacenado.startsWith('$2b$')
  ) {
    const esWordPress = hashAlmacenado.startsWith('$wp$2y$');
    const estandar = esWordPress
      ? hashAlmacenado.replace('$wp$2y$', '$2a$')
      : hashAlmacenado.replace('$2y$', '$2a$');
    const entrada = esWordPress ? createHmac('sha384', 'wp-sha384').update(contrasena).digest('base64') : contrasena;
    return bcrypt.compare(entrada, estandar);
  }
  if (hashAlmacenado.startsWith('$P$') || hashAlmacenado.startsWith('$H$')) {
    return verificarPhpass(contrasena, hashAlmacenado);
  }
  if (hashAlmacenado.includes(':')) {
    const [sal, valor] = hashAlmacenado.split(':');
    const hash = await scrypt(contrasena, sal, 64);
    const esperado = Buffer.from(valor, 'hex');
    return esperado.length === hash.length && timingSafeEqual(hash, esperado);
  }
  return false;
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function leerToken(peticion) {
  return (
    (peticion.headers.cookie || '')
      .split(';')
      .map(v => v.trim())
      .find(v => v.startsWith('apracom_session='))
      ?.slice(16) || ''
  );
}
