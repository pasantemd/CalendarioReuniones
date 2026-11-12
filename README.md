# Calendario Apracom

Reservas de Sala comedor y Sala bodega para el personal de Apracom. Interfaz HTML, CSS y JavaScript; servidor Node.js y PostgreSQL. Todas las cuentas son usuarios, sin roles ni administración de salas.

## Iniciar la instalación existente

Con PostgreSQL activo, desde la carpeta del proyecto:

```powershell
npm start
```

Abrir http://localhost:3000. La conexión se toma del archivo `.env` existente; no sobrescribirlo para reiniciar.

## Instalación nueva

Requisitos: Node.js 22.9 o posterior y PostgreSQL 15 o posterior, con extensión btree_gist disponible.

```powershell
npm ci --omit=dev
Copy-Item .env.example .env
```

Completar DATABASE_URL y APP_ORIGIN en `.env`. Codificar los caracteres reservados de la contraseña cuando se incluyen en una URL de conexión.

Hay dos formas de preparar la base:

- **Conservar usuarios y reservas:** restaurar un respaldo completo y actual en una base vacía. Incluye tablas, usuarios, hashes, salas, reuniones, índices y secuencias. No ejecutar antes el esquema ni volver a crear esas cuentas.
- **Empezar sin datos:** crear una base PostgreSQL y ejecutar `bd/esquema.sql` desde el editor SQL de pgAdmin o con psql. Crea estructura y las dos salas, pero no crea usuarios ni reservas.

Para ejecutar el esquema contra una base ya creada:

```sh
psql --set=ON_ERROR_STOP=1 --dbname="postgresql://USUARIO:CLAVE@HOST:PUERTO/BASE" --file=bd/esquema.sql
```

También puede repetirse sobre una instalación con tablas en español: elimina la columna antigua de roles sin borrar usuarios ni reservas. No convierte versiones antiguas con tablas en inglés.

## Respaldos y cuentas

Generar un respaldo completo desde pgAdmin mediante **Backup**, formato Custom, o con pg_dump:

```sh
pg_dump --format=custom --no-owner --no-privileges --dbname="CONEXION" --file=respaldo.dump
```

Restaurarlo en una base vacía mediante **Restore**, con **No owner** y **No privileges**, o con:

```sh
pg_restore --no-owner --no-privileges --exit-on-error --dbname="CONEXION" respaldo.dump
```

Un respaldo SQL de texto se ejecuta con psql o el editor SQL; no se restaura con pg_restore. El respaldo actual debe incluir `usuarios`, `salas`, `reservas` y `sesiones`. Para los respaldos generados con PostgreSQL 18, utilizar PostgreSQL 18 o posterior o revisar la compatibilidad antes de restaurar en una versión anterior.

Los usuarios restaurados conservan sus contraseñas. No hay registro público ni pantalla de administración de cuentas. La creación de cuentas y el restablecimiento de claves se realizan con las utilidades privadas de mantenimiento, que no se publican en este repositorio. Nunca guardar contraseñas en texto plano en `contrasena_hash`.

## Despliegue

El hosting necesita un proceso Node.js y PostgreSQL. Un servicio que solo publica HTML/PHP no ejecuta el servidor.

1. Clonar el repositorio y ejecutar `npm ci --omit=dev`.
2. Crear o restaurar la base con una de las alternativas anteriores.
3. Configurar DATABASE_URL, NODE_ENV=production, APP_ORIGIN=https://calendario.tu-dominio.com, HOST=0.0.0.0 y el PORT asignado por el proveedor. Utilizar sus parámetros de conexión/TLS de PostgreSQL.
4. Iniciar con `npm start` o `npm run iniciar` desde la carpeta de package.json.
5. Dirigir el dominio HTTPS al puerto del proceso Node.js.

El servidor admite variables inyectadas por el hosting sin archivo `.env`. APP_ORIGIN debe ser el origen público HTTPS, sin subcarpetas, consulta ni fragmento; se admite barra final.

Publicar en la raíz del dominio o en un subdominio dedicado. Las rutas `/api`, `/css`, `/js` y `/recursos` pertenecen a ese origen. No subir solo `public/` ni colocar el sistema bajo `/calendario/`, porque esta versión no configura ese prefijo. Los archivos estáticos se localizan desde el módulo del servidor; conservar nombres y mayúsculas de las rutas, también en Linux.

`.env`, `node_modules/`, respaldos, `datos-locales/`, `test-results/`, `herramientas/` y `pruebas/` están excluidos de Git. Las dos últimas carpetas se conservan únicamente en el entorno local de mantenimiento. El repositorio publicado contiene el código de la aplicación, el esquema y su documentación.

## Estructura

| Archivo o carpeta | Responsabilidad |
| --- | --- |
| `servidor.js` | Arranque HTTP, sesiones, permisos, consultas y transacciones de la API. |
| `bibliotecas/autenticacion.js` | Contraseñas, compatibilidad con hashes anteriores y tokens. |
| `bibliotecas/base-datos.js` | Grupo de conexiones PostgreSQL. |
| `bibliotecas/validacion.js` | Datos, fechas, jornada y duraciones. |
| `bibliotecas/correo.js` | Destinatarios, plantilla y transporte SMTP. |
| `public/inicio.html` | Estructura, vistas y ventanas de la interfaz. |
| `public/js/aplicacion.js` | Inicialización y coordinación de vistas. |
| `public/js/nucleo.js` | Estado compartido, fechas de Ecuador, cliente HTTP y bloqueo de formularios. |
| `public/js/autenticacion.js` | Ingreso, salida y limpieza de datos de la sesión anterior. |
| `public/js/calendario.js` | Calendario mensual y agenda del día. |
| `public/js/reservas.js` | Listas, filtros, detalles y acciones de reservas e historial. |
| `public/js/disponibilidad.js` | Intervalos libres, duración y actualización de opciones. |
| `public/js/selector-fecha.js` | Selector de fecha, teclado y límites del campo original. |
| `public/js/salas.js` | Las dos salas y sus selectores. |
| `public/css/` | Estilos por componente, movimiento y estados de carga. |
| `bd/esquema.sql` | Tablas, índices, restricciones y salas iniciales. |

## Reglas de reservas

- Calendario, Reservas e Historial son compartidos. De reuniones ajenas solo se muestran sala, fecha, horario y responsable; la API excluye asunto, notas, correo, asistentes y motivo de cancelación. La búsqueda por asunto solo encuentra reuniones propias.
- Reservas muestra las confirmadas que aún no terminan. Historial muestra finalizadas, canceladas o eliminadas; sus fechas filtran el momento de finalización o cancelación.
- La jornada es de 08:00 a 17:00 del mismo día en Ecuador continental. Las duraciones son 30, 60, 90, 120, 150, 180, 210 y 240 minutos.
- Se elige un horario mediante los botones disponibles. El fin es automático. Al editar, se excluye la reserva actual y se conserva su inicio original si sigue libre.
- La disponibilidad se comprueba al cambiar sala o fecha, recuperar foco, cada 30 segundos y antes de guardar. El refresco automático conserva los botones y el scroll si no cambian las opciones.
- Solo el creador puede editar, cancelar o eliminar antes del inicio. Eliminar conserva el registro histórico.
- PostgreSQL evita cruces por sala mediante rangos `[inicio, fin)`: una reunión puede comenzar justo cuando termina otra. La comprobación del navegador no sustituye esta restricción.

Las listas muestran 25 registros por página y admiten hasta un año por consulta. El calendario carga todas las páginas del mes. La API valida los datos y aplica permisos aunque se manipule el navegador.

## Flujo de guardado

1. El formulario captura sus datos antes de bloquear los controles y vuelve a consultar la disponibilidad.
2. Las respuestas antiguas se descartan mediante generaciones y cancelación de solicitudes para no mezclar salas o fechas.
3. La API comprueba sesión, propietario, duración y jornada; PostgreSQL confirma la transacción y resuelve los cruces concurrentes.
4. La notificación se solicita después de confirmar la reserva. Un fallo de correo no revierte los datos guardados.

## API

Las operaciones de escritura requieren JSON y un encabezado Origin igual a APP_ORIGIN. La sesión viaja en una cookie HttpOnly. Las fechas incluyen zona horaria explícita.

| Método y ruta | Uso |
| --- | --- |
| `POST /api/ingresar` | Iniciar sesión con `correo` y `contrasena`. |
| `GET /api/sesion` | Consultar la cuenta activa. |
| `POST /api/salir` | Invalidar sesión; cuerpo `{}`. |
| `GET /api/salas` | Consultar las dos salas. |
| `GET /api/reservas` | Filtros `desde`, `hasta`, `vista`, `sala`, `estado`, `q`, `pagina` y `limite`; devuelve `elementos`, `total` y `hayMas`. |
| `POST /api/reservas` | Crear con `sala_id`, `asunto`, `asistentes`, `notas`, `inicio` y `fin`. |
| `PATCH /api/reservas/:id` | Actualizar una reserva propia futura. |
| `POST /api/reservas/:id/cancelar` | Cancelar una reserva propia futura con `motivo`. |
| `DELETE /api/reservas/:id` | Eliminar una reserva propia futura conservando su histórico. |

## Correo

Al crear una reserva se notifica al responsable y a CORREO_ADMIN_RESERVAS, sin duplicar direcciones. Ese correo no concede permisos de administrador. Las ediciones notifican al responsable. No hay recordatorios ni avisos de cancelación o eliminación.

Completar SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM y CORREO_ADMIN_RESERVAS; reiniciar el servidor. Puerto 587 suele utilizar SMTP_SECURE=false con STARTTLS; puerto 465, SMTP_SECURE=true. El remitente debe estar autorizado por el proveedor. Sin SMTP_HOST y SMTP_USER solo se registra la notificación en consola. No hay reintentos automáticos.

Dirección visual en [DISEÑO.md](DISEÑO.md).
