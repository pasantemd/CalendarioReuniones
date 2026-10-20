# Calendario Apracom

Reservas de Sala comedor y Sala bodega para el personal de Apracom. Interfaz HTML, CSS y JavaScript; servidor Node.js y PostgreSQL. No existe administración de salas en la interfaz.

## Iniciar la instalación existente

Con PostgreSQL activo, desde la carpeta del proyecto:

```powershell
npm run iniciar
```

Abrir http://localhost:3000 con la cuenta del usuario. El servidor utiliza `.env`; no sobrescribir ese archivo para volver a iniciar.

## Instalación nueva

Requisitos: Node.js 22.9 o posterior y PostgreSQL 15 o posterior. El proveedor debe admitir la extensión btree_gist.

```powershell
npm install
Copy-Item .env.example .env
```

Completar DATABASE_URL en `.env`. La base se llama `CalendarioApracom`; codificar caracteres reservados de la contraseña para una URL. APP_ORIGIN debe coincidir con la dirección que abren los usuarios.

```powershell
npm run bd:crear
npm run bd:iniciar
```

El primer comando requiere CREATEDB y solo es necesario si la base no existe. En un hosting que proporciona una base ya creada, se omite. El segundo ejecuta `bd/esquema.sql`: crea tablas, índices, las dos salas y btree_gist, pero no incluye usuarios ni reservas. También elimina la columna de roles de instalaciones con tablas en español; no convierte versiones antiguas con tablas en inglés.

## Llevar los datos actuales al hosting

Hay dos alternativas:

- **Instalación vacía:** crear la base y ejecutar `bd/esquema.sql` desde el editor SQL de PostgreSQL/pgAdmin o con `npm run bd:iniciar`. Después crear las cuentas necesarias.
- **Conservar usuarios y reuniones:** restaurar un respaldo completo y actual de esta base en una base vacía. El respaldo incluye estructura, usuarios, hashes, salas, reservas, índices y secuencias. No hace falta ejecutar antes el esquema ni crear de nuevo los usuarios.

Para generar un respaldo compatible desde la instalación local:

```powershell
npm run bd:respaldar
```

Se guarda un archivo `.dump` en `datos-locales/`, excluido de Git. La herramienta necesita pg_dump en PATH, PostgreSQL 18 en la ruta local habitual de Windows, o PG_DUMP_RUTA con su ubicación. No modifica registros.

Restaurar ese archivo en pgAdmin usando **Restore**, con **No owner** y **No privileges**, o ejecutar contra la base vacía del hosting:

```sh
pg_restore --no-owner --no-privileges --exit-on-error --dbname="postgresql://USUARIO:CLAVE@HOST:PUERTO/BASE" respaldo.dump
```

Un respaldo SQL de texto se ejecuta con el editor de consultas o `psql --set=ON_ERROR_STOP=1 --dbname="CONEXION" --file=respaldo.sql`. No se importa con pg_restore. Un archivo `.dump` no se ejecuta como SQL.

El respaldo debe contener `usuarios`, `salas`, `reservas` y `sesiones`. Los respaldos antiguos con tablas en inglés no funcionan directamente con esta versión; tampoco se deben mezclar con el esquema nuevo. Los respaldos creados antes de la traducción deben reemplazarse por uno actual. Usar PostgreSQL 18 o posterior para restaurar los respaldos generados por esta instalación de PostgreSQL 18; una restauración a una versión anterior requiere revisar compatibilidad.

## Despliegue en hosting

Este proyecto necesita un proceso Node.js y PostgreSQL. Un hosting que solo sirve HTML/PHP no ejecuta el servidor.

1. Subir el repositorio y ejecutar `npm ci --omit=dev` en su carpeta raíz.
2. Crear o restaurar la base según las alternativas anteriores.
3. Definir en el panel del hosting DATABASE_URL, NODE_ENV=production, APP_ORIGIN=https://calendario.tu-dominio.com y HOST=0.0.0.0. Usar el PORT asignado por el proveedor y sus parámetros de conexión/TLS de PostgreSQL.
4. Configurar el comando de inicio `npm start` o `npm run iniciar`, desde la carpeta que contiene package.json.
5. Configurar el dominio/HTTPS del proveedor para dirigir el tráfico al puerto del proceso Node.js.

`.env` es opcional: el servidor puede leer las variables inyectadas por el hosting. APP_ORIGIN debe ser el origen público HTTPS, sin subcarpetas, consulta ni fragmento; una barra final es válida. Por ejemplo, https://calendario.tu-dominio.com/. No usar localhost en producción.

La aplicación se publica en la raíz del dominio o de un subdominio dedicado. Las rutas `/api`, `/css`, `/js` y `/recursos` pertenecen a ese mismo origen. No mover solo `public/` al hosting ni publicar la aplicación bajo `/calendario/`: requeriría configurar un prefijo que esta versión no utiliza.

Los archivos estáticos y SQL se localizan desde el archivo del servidor o de la herramienta, sin depender del directorio actual del proceso. Los nombres y mayúsculas de las importaciones deben mantenerse tal como están en Git, también en Linux.

No subir `.env`, `node_modules/`, `datos-locales/`, respaldos, `test-result/`, `test-results/`, `resultados-pruebas/` ni `playwright-report/`. Están excluidos en .gitignore. Los respaldos se transfieren de forma privada para restaurarlos en la base, no como contenido público.

Para crear una cuenta, proporcionar una contraseña de al menos 12 caracteres:

```powershell
$secret = Read-Host 'Contraseña de la nueva cuenta' -AsSecureString
$env:NEW_USER_PASSWORD = [System.Net.NetworkCredential]::new('', $secret).Password
npm run usuario:crear
Remove-Item Env:NEW_USER_PASSWORD
```

La herramienta solicita nombre y correo y guarda una contraseña cifrada con hash; no insertar una contraseña en texto plano en contrasena_hash. Todas las cuentas son usuarios sin distinción de roles. Repetir el comando para cada persona. Para cambiar una contraseña, definir NEW_USER_PASSWORD del mismo modo y ejecutar `npm run usuario:clave`; invalida sus sesiones. No hay registro público.

Para actualizar una instalación existente o un respaldo anterior, ejecutar `npm run bd:iniciar`: elimina la columna de roles sin borrar usuarios ni reservas.

Si restauraste el respaldo completo actual, los usuarios y sus hashes ya están incluidos: no vuelvas a registrarlos y podrán utilizar sus contraseñas anteriores. Para esta instalación se recomienda el respaldo completo; el esquema vacío es útil cuando se quiere empezar sin cuentas ni reuniones.

En una terminal Bash del hosting se puede proporcionar la contraseña sin mostrarla ni escribirla en el historial:

```bash
read -r -s -p 'Contraseña de la nueva cuenta: ' CLAVE_NUEVA
printf '\n'
NEW_USER_PASSWORD="$CLAVE_NUEVA" npm run usuario:crear
unset CLAVE_NUEVA
```

## Funcionamiento

El código propio se organiza en `servidor.js`, `bibliotecas/`, `herramientas/`, `pruebas/`, `public/` y `bd/`. El esquema utiliza las tablas `usuarios`, `salas`, `reservas` y `sesiones`, con columnas como `correo`, `contrasena_hash`, `sala_id`, `usuario_id`, `asunto`, `inicio`, `fin` y `motivo_cancelacion`. Los nombres reservados de JavaScript, HTML, CSS, SQL y las interfaces de dependencias conservan su sintaxis original.

- **Calendario:** compartido; muestra reuniones confirmadas de todos, pasadas y futuras, con filtro por sala y agenda del día.
- **Reservas:** solo las del usuario conectado que todavía no terminan. Búsquedas, filtros, totales y páginas se calculan en el servidor para ese usuario.
- **Historial:** solo sus reuniones finalizadas, canceladas o eliminadas. Las fechas filtran cuándo finalizaron o se cancelaron; los filtros se conservan por vista.
- **Crear:** asunto, sala, fecha, asistentes, horario y notas. Solo de 08:00 a 17:00 del mismo día en Ecuador continental (America/Guayaquil).
- **Editar y cancelar:** disponibles para todos desde el calendario mientras la reunión no comience. Cancelar conserva motivo y autor.
- **Eliminar:** solo el creador y antes del inicio. Requiere confirmación y conserva el registro en su historial.

Las listas tienen páginas de 25 registros y admiten hasta un año por consulta. El calendario carga todas las páginas del mes. Una exclusión GiST evita cruces incluso entre solicitudes simultáneas y permite reuniones consecutivas.

## Correo y red

Creación y edición notifican al correo del responsable original; el número de asistentes no es una lista de destinatarios. No hay recordatorios ni avisos de cancelación/eliminación. Sin SMTP_HOST y SMTP_USER, solo se registra en consola. Completar SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS y SMTP_FROM con los datos del proveedor y un remitente autorizado; reiniciar después. Habitualmente se usa puerto 587 con SMTP_SECURE=false (STARTTLS), o 465 con SMTP_SECURE=true. Un fallo de correo no revierte la reserva y no hay reintentos automáticos.

Para otros equipos, configurar HOST=0.0.0.0 y APP_ORIGIN con la dirección accesible del servidor. En producción usar HTTPS, NODE_ENV=production y permisos limitados de base. No exponer PostgreSQL al navegador. Programar respaldos según las necesidades de Apracom.

El calendario comparte los detalles de las reuniones. Contraseñas scrypt con sal; sesiones almacenadas como hash con vencimiento de 12 horas. El servidor comprueba Origin, usa consultas parametrizadas y CSP, y muestra entradas de usuarios como texto.

## Pruebas

```powershell
npm test
```

La integración requiere TEST_DATABASE_URL y una base desechable cuyo nombre termine en `_test`: elimina y recrea su esquema public. Nunca usar la base de trabajo. Para Playwright, instalar Chromium y definir RUN_BROWSER_TESTS=1.

El auxiliar Windows con PostgreSQL 18 ejecuta la suite completa y apaga la base temporal al terminar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File herramientas/probar-base-datos.ps1
```

Usa PostgreSQL temporal en 127.0.0.1:55432 y servidor de prueba en 3107. Verifica autenticación, aforo, cruces, permisos, listas personales, calendario compartido, historial, formularios y concurrencia. El navegador revisa contraste, navegación y desbordamientos entre 320 y 1440 px; guarda capturas en test-results.

Las herramientas históricas de importación ya no forman parte de esta versión. Para trasladar los usuarios actuales se restaura el respaldo completo; para cuentas nuevas se usa `npm run usuario:crear`.

Dirección visual en [DISEÑO.md](DISEÑO.md). Las pruebas cubren los casos descritos; no garantizan ausencia de cualquier error futuro. El despliegue debe comprobarse finalmente en el proveedor concreto con su dominio y conexión de base.
