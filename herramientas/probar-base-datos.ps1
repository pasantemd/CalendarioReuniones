$ErrorActionPreference = 'Stop'
$testCluster = Join-Path $env:TEMP 'apracom-postgres-test-20261019'
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
if (-not (Test-Path -LiteralPath $testCluster)) {
  & "$pgBin\initdb.exe" -D $testCluster -U postgres -A trust --encoding=UTF8 --locale=C
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el cluster temporal.' }
}
& "$pgBin\pg_ctl.exe" -D $testCluster -l (Join-Path $testCluster 'servidor.log') -o '-p 55432 -h 127.0.0.1 -c shared_buffers=16MB -c max_connections=20' -w start
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL temporal.' }
try {
  $dbExists = & "$pgBin\psql.exe" -h 127.0.0.1 -p 55432 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='CalendarioApracom_test'"
  if ($dbExists -ne '1') { & "$pgBin\createdb.exe" -h 127.0.0.1 -p 55432 -U postgres CalendarioApracom_test }
  $env:TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/CalendarioApracom_test'
  $env:RUN_BROWSER_TESTS = '1'
  node --test --test-concurrency=1 --test-isolation=none
  if ($LASTEXITCODE -ne 0) { throw 'Fallaron las pruebas.' }
} finally {
  & "$pgBin\pg_ctl.exe" -D $testCluster -m fast -w stop
}
