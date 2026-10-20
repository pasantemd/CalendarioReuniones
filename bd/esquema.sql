BEGIN;
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL OR to_regclass('public.rooms') IS NOT NULL
    OR to_regclass('public.reservations') IS NOT NULL OR to_regclass('public.sessions') IS NOT NULL THEN
    RAISE EXCEPTION 'La base contiene el esquema antiguo en inglés. Restaura un respaldo actual con tablas en español en una base vacía.';
  END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS usuarios (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre varchar(120) NOT NULL CHECK (length(trim(nombre)) > 0),
  correo varchar(254) NOT NULL UNIQUE CHECK (correo = lower(correo)),
  contrasena_hash text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creada_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE usuarios DROP COLUMN IF EXISTS rol;

CREATE TABLE IF NOT EXISTS salas (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre varchar(80) NOT NULL UNIQUE CHECK (length(trim(nombre)) > 0),
  capacidad integer NOT NULL CHECK (capacidad BETWEEN 1 AND 500),
  ubicacion varchar(160) NOT NULL DEFAULT '',
  activo boolean NOT NULL DEFAULT true,
  creada_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reservas (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sala_id integer NOT NULL REFERENCES salas(id),
  usuario_id integer NOT NULL REFERENCES usuarios(id),
  asunto varchar(160) NOT NULL CHECK (length(trim(asunto)) > 0),
  asistentes integer NOT NULL CHECK (asistentes BETWEEN 1 AND 500),
  notas varchar(2000) NOT NULL DEFAULT '',
  inicio timestamptz NOT NULL,
  fin timestamptz NOT NULL,
  estado varchar(12) NOT NULL DEFAULT 'confirmada' CHECK (estado IN ('confirmada', 'cancelada')),
  creada_en timestamptz NOT NULL DEFAULT now(),
  cancelada_en timestamptz,
  cancelada_por integer REFERENCES usuarios(id),
  motivo_cancelacion varchar(500),
  CHECK (fin > inicio AND fin - inicio <= interval '24 hours'),
  CHECK ((estado = 'confirmada' AND cancelada_en IS NULL AND cancelada_por IS NULL AND motivo_cancelacion IS NULL)
    OR (estado = 'cancelada' AND cancelada_en IS NOT NULL AND cancelada_por IS NOT NULL
      AND motivo_cancelacion IS NOT NULL AND length(trim(motivo_cancelacion)) > 0)),
  EXCLUDE USING gist (sala_id WITH =, tstzrange(inicio, fin, '[)') WITH &&)
    WHERE (estado = 'confirmada')
);

CREATE INDEX IF NOT EXISTS reservas_usuario_inicio ON reservas(usuario_id, inicio DESC);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='reservas'::regclass AND conname='reservas_motivo_obligatorio') THEN
    ALTER TABLE reservas ADD CONSTRAINT reservas_motivo_obligatorio
      CHECK (estado <> 'cancelada' OR motivo_cancelacion IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS reservas_inicio ON reservas(inicio DESC);

CREATE TABLE IF NOT EXISTS sesiones (
  token_hash char(64) PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  vence_en timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sesiones_vencimiento ON sesiones(vence_en);

INSERT INTO salas(nombre, capacidad, ubicacion) VALUES
  ('Sala comedor', 500, 'Comedor'),
  ('Sala bodega', 500, 'Bodega')
ON CONFLICT (nombre) DO NOTHING;
COMMIT;
