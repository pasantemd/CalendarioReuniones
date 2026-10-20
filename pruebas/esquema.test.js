import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

test('el esquema instala una base vacía y puede repetirse sin perder datos', {skip:!process.env.TEST_DATABASE_URL}, async () => {
  const conexion=new URL(process.env.TEST_DATABASE_URL);
  assert.match(conexion.pathname,/_test$/);
  const cliente=new pg.Client({connectionString:conexion.toString()});
  await cliente.connect();
  try {
    const esquema=await readFile(new URL('../bd/esquema.sql',import.meta.url),'utf8');
    await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await cliente.query(esquema);
    await cliente.query("INSERT INTO usuarios(nombre,correo,contrasena_hash) VALUES('Persona sintética','persona@test.invalid','hash-sintetico')");
    await cliente.query("INSERT INTO reservas(sala_id,usuario_id,asunto,asistentes,inicio,fin) VALUES(1,1,'Reserva sintética',2,'2030-01-02T14:00:00Z','2030-01-02T15:00:00Z')");
    const antes=(await cliente.query('SELECT * FROM reservas')).rows;
    await cliente.query("ALTER TABLE usuarios ADD COLUMN rol varchar(16) DEFAULT 'empleado'");
    await cliente.query(esquema);
    assert.equal((await cliente.query("SELECT count(*)::integer AS total FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios' AND column_name='rol'")).rows[0].total,0);
    assert.equal((await cliente.query('SELECT count(*)::integer AS total FROM usuarios')).rows[0].total,1);
    assert.deepEqual((await cliente.query('SELECT * FROM reservas')).rows,antes);
    assert.equal((await cliente.query('SELECT count(*)::integer AS total FROM salas')).rows[0].total,2);
    await assert.rejects(cliente.query(`INSERT INTO reservas(sala_id,usuario_id,asunto,asistentes,inicio,fin)
      VALUES(1,1,'Cruce',2,'2030-01-02T14:00:00Z','2030-01-02T15:00:00Z')`),{code:'23P01'});
    await cliente.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; CREATE TABLE users(id integer)');
    await assert.rejects(cliente.query(esquema),/esquema antiguo/);
    await cliente.query('ROLLBACK');
    assert.equal((await cliente.query("SELECT to_regclass('public.usuarios') AS tabla")).rows[0].tabla,null);
  } finally {await cliente.end();}
});
