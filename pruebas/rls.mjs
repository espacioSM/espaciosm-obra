import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
await db.query('select 1')

const migraciones = new URL('../supabase/migrations/', import.meta.url)
const sql = async (archivo) => {
  const texto = await readFile(new URL(archivo, migraciones), 'utf8')
  return texto.replace(/create extension if not exists "pgcrypto";/i, '-- pgcrypto omitido en la prueba')
}

const ADMIN = '11111111-1111-4111-8111-111111111111'
const RES = '22222222-2222-4222-8222-222222222222'
const MED = '33333333-3333-4333-8333-333333333333'
const P1 = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const P2 = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
const E1 = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee'
const E2 = 'eeeeeeee-2222-4222-8222-eeeeeeeeeeee'

const fallos = []
const ok = (texto) => console.log('OK   ' + texto)
const fallo = (texto, detalle) => {
  fallos.push(texto)
  console.log('FALLO ' + texto + (detalle ? ' :: ' + detalle : ''))
}

async function ejecutar(archivo) {
  await db.exec(await sql(archivo))
}

async function como(usuario, rol = 'authenticated') {
  await db.exec('reset role')
  await db.exec(`set role ${rol}`)
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [usuario ?? ''])
}

async function comoPostgres() {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}

async function esperarError(descripcion, fn, codigo, fragmento) {
  try {
    await fn()
    fallo(descripcion, 'no lanzó error')
  } catch (error) {
    if (codigo && error.code !== codigo) {
      fallo(descripcion, `código ${error.code}: ${error.message}`)
    } else if (fragmento && !String(error.message).includes(fragmento)) {
      fallo(descripcion, `mensaje inesperado: ${error.message}`)
    } else {
      ok(`${descripcion} (${error.code ?? 'sin código'})`)
    }
  }
}

try {
  // Entorno mínimo que Supabase ya trae.
  await db.exec(`
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create role anon nologin;
    create role authenticated nologin;

    -- Supabase permite a estos roles usar auth.uid() en políticas y triggers.
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;

    -- Privilegios por defecto equivalentes a Supabase: así las revocaciones
    -- de 0002 y 0005 sí se ponen a prueba.
    alter default privileges in schema public
      grant select, insert, update, delete on tables to anon, authenticated;
    alter default privileges in schema public
      grant execute on functions to anon, authenticated;
    alter default privileges in schema public
      grant usage, select on sequences to anon, authenticated;
  `)
  ok('entorno auth y roles')

  await ejecutar('0001_esquema_sprint1.sql')
  ok('0001 esquema')
  await ejecutar('0002_rls_sprint1.sql')
  ok('0002 RLS')
  await ejecutar('0004_endurecimiento_sprint1.sql')
  ok('0004 endurecimiento')
  await ejecutar('0005_revision_sprint1.sql')
  ok('0005 revisión')
  await ejecutar('0006_cuadrillas_jornada_residentes.sql')
  ok('0006 cuadrillas y jornada')

  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${ADMIN}', 'admin@ejemplo.mx', '{"nombre":"Admin"}'),
      ('${RES}', 'residente@ejemplo.mx', '{}'),
      ('${MED}', 'oficina@ejemplo.mx', '{"nombre":"Oficina"}');

    update public.perfiles set rol = 'admin' where id = '${ADMIN}';
    update public.perfiles set rol = 'permiso_medio' where id = '${MED}';

    insert into public.proyectos (id, nombre, fecha_inicio, estado) values
      ('${P1}', 'Obra A', current_date - 10, 'en_ejecucion'),
      ('${P2}', 'Obra B', current_date - 5, 'planeado');

    insert into public.proyecto_miembros (proyecto_id, usuario_id) values
      ('${P1}', '${RES}'),
      ('${P1}', '${MED}');

    insert into public.empleados (id, proyecto_id, nombre, puesto, sueldo, creado_por) values
      ('${E1}', '${P1}', 'Empleado A', 'Oficial', 600, '${RES}'),
      ('${E2}', '${P2}', 'Empleado B', 'Ayudante', 400, '${MED}');
  `)
  ok('datos de prueba')

  await como(RES)
  const visibles = await db.query('select count(*)::int as n from public.proyectos')
  if (visibles.rows[0].n === 1) ok('residente ve solo su obra')
  else fallo('residente ve solo su obra', `vio ${visibles.rows[0].n}`)

  const sueldos = await db.query('select count(*)::int as n from public.empleados')
  if (sueldos.rows[0].n === 1) ok('residente lee solo su cuadrilla')
  else fallo('residente lee solo su cuadrilla', `vio ${sueldos.rows[0].n}`)

  const directorio = await db.query("select * from public.empleados_de_proyecto('" + P1 + "')")
  if (directorio.rows.length === 1 && directorio.rows[0].nombre === 'Empleado A') {
    ok('directorio de asistencia sin sueldos')
  } else {
    fallo('directorio de asistencia sin sueldos')
  }

  await db.exec(`
    insert into public.empleados (proyecto_id, nombre, puesto, sueldo)
    values ('${P1}', 'Empleado Nuevo', 'Ayudante', 450);
  `)
  const propios = await db.query('select count(*)::int as n from public.empleados')
  if (propios.rows[0].n === 2) ok('residente da de alta en su cuadrilla')
  else fallo('residente da de alta en su cuadrilla', `vio ${propios.rows[0].n}`)

  const directorioPropio = await db.query(
    "select * from public.empleados_de_proyecto('" + P1 + "')",
  )
  if (directorioPropio.rows.length === 2) ok('directorio solo de su cuadrilla')
  else fallo('directorio solo de su cuadrilla', `vio ${directorioPropio.rows.length}`)

  await esperarError('residente no cambia su rol', () =>
    db.exec(`update public.perfiles set rol = 'admin' where id = '${RES}'`), '42501')

  await esperarError('residente no se deshabilita', () =>
    db.exec(`update public.perfiles set activo = false where id = '${RES}'`), '42501')

  await db.exec(`update public.perfiles set nombre = 'Residente A' where id = '${RES}'`)
  const nombrePropio = await db.query('select nombre from public.perfiles where id = $1', [RES])
  if (nombrePropio.rows[0]?.nombre === 'Residente A') ok('residente corrige su nombre')
  else fallo('residente corrige su nombre')

  await db.exec(`
    insert into public.asistencia (empleado_id, proyecto_id, fecha, hora_entrada, registrado_por)
    values ('${E1}', '${P1}', '2020-01-01', '23:59', '${RES}');
  `)
  const registro = await db.query(
    "select id, fecha::text, hora_entrada::text, registrado_por from public.asistencia where empleado_id = $1",
    [E1],
  )
  const hoy = (await db.query("select (now() at time zone 'America/Mexico_City')::date::text as hoy")).rows[0].hoy
  if (registro.rows[0]?.fecha === hoy) ok('fecha de asistencia sellada por el servidor')
  else fallo('fecha de asistencia sellada por el servidor', JSON.stringify(registro.rows[0]))
  if (registro.rows[0]?.registrado_por === RES) ok('autor de asistencia forzado')
  else fallo('autor de asistencia forzado')

  await esperarError('residente no cambia la fecha', () =>
    db.exec(`update public.asistencia set fecha = '2020-01-01' where empleado_id = '${E1}'`), '42501')

  await db.exec(`update public.asistencia set registrado_por = '${ADMIN}' where empleado_id = '${E1}'`)
  const autor = await db.query('select registrado_por from public.asistencia where empleado_id = $1', [E1])
  if (autor.rows[0].registrado_por === RES) ok('registrado_por no se puede falsificar')
  else fallo('registrado_por no se puede falsificar', JSON.stringify(autor.rows[0]))

  await db.exec(`update public.asistencia set hora_salida = '12:00' where empleado_id = '${E1}'`)
  const salida = await db.query('select hora_salida::text as h from public.asistencia where empleado_id = $1', [E1])
  if (salida.rows[0].h) ok('salida sellada por el servidor')
  else fallo('salida sellada por el servidor')

  await esperarError('no se reescribe una jornada cerrada', () =>
    db.exec(`update public.asistencia set hora_salida = '13:00' where empleado_id = '${E1}'`), '42501')

  await comoPostgres()
  const historial = await db.query('select count(*)::int as n from public.asistencia_historial')
  if (historial.rows[0].n >= 2) ok('historial de asistencia escrito')
  else fallo('historial de asistencia escrito', `filas ${historial.rows[0].n}`)

  await comoPostgres()
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [RES])
  await db.exec(`update auth.users set email = 'residente.nuevo@ejemplo.mx' where id = '${RES}'`)
  const correoSincronizado = await db.query('select email from public.perfiles where id = $1', [RES])
  if (correoSincronizado.rows[0]?.email === 'residente.nuevo@ejemplo.mx') {
    ok('correo sincronizado desde auth.users')
  } else {
    fallo('correo sincronizado desde auth.users', JSON.stringify(correoSincronizado.rows[0]))
  }

  await como(RES)
  await db.exec(`
    insert into public.asistencia_residentes (usuario_id, proyecto_id)
    values ('${RES}', '${P1}');
  `)
  const jornada = await db.query(
    "select fecha::text, hora_entrada::text, hora_salida::text from public.asistencia_residentes where usuario_id = $1",
    [RES],
  )
  if (jornada.rows[0]?.hora_entrada) ok('residente registra su entrada')
  else fallo('residente registra su entrada', JSON.stringify(jornada.rows[0]))

  await db.exec(`update public.asistencia_residentes set hora_salida = '12:00' where usuario_id = '${RES}'`)
  const salidaResidente = await db.query(
    'select hora_salida::text as h from public.asistencia_residentes where usuario_id = $1',
    [RES],
  )
  if (salidaResidente.rows[0]?.h) ok('residente registra su salida')
  else fallo('residente registra su salida')

  await esperarError('no se reabre la jornada del residente', () =>
    db.exec(`update public.asistencia_residentes set hora_salida = '13:00' where usuario_id = '${RES}'`), '42501')

  await como(MED)
  const empleadosOficina = await db.query('select count(*)::int as n from public.empleados')
  if (empleadosOficina.rows[0].n === 2) ok('permiso medio consulta al personal de su obra')
  else fallo('permiso medio consulta al personal de su obra', `vio ${empleadosOficina.rows[0].n}`)

  await esperarError('permiso medio no crea personal', () =>
    db.exec(`insert into public.empleados (proyecto_id, nombre, sueldo) values ('${P1}', 'Ajeno', 100)`), '42501')

  const intentoEdicion = await db.query(
    `update public.empleados set sueldo = 999 where id = '${E1}' returning id`,
  )
  if (intentoEdicion.rows.length === 0) ok('permiso medio no edita personal')
  else fallo('permiso medio no edita personal', 'actualizó una fila')

  const residentesOficina = await db.query(
    "select * from public.residentes_en_obra((now() at time zone 'America/Mexico_City')::date)",
  )
  if (residentesOficina.rows.length === 1) ok('oficina ve al residente en obra')
  else fallo('oficina ve al residente en obra', `vio ${residentesOficina.rows.length}`)

  await como(ADMIN)
  await esperarError(
    'admin no se degrada a sí mismo',
    () => db.exec(`update public.perfiles set rol = 'residente' where id = '${ADMIN}'`),
    '42501',
    'No puedes cambiar tu propio rol',
  )

  await como(MED)
  const historialOficina = await db.query('select count(*)::int as n from public.asistencia_historial')
  if (historialOficina.rows[0].n === 0) ok('permiso medio no ve la auditoría')
  else fallo('permiso medio no ve la auditoría', `vio ${historialOficina.rows[0].n}`)

  await esperarError('permiso medio no escribe la auditoría', () =>
    db.exec(`
      insert into public.asistencia_historial
        (asistencia_id, empleado_id, proyecto_id, operacion)
      values
        ('${E1}', '${E1}', '${P1}', 'alta')
    `), '42501')

  await db.exec(`
    insert into public.asistencia (empleado_id, proyecto_id, fecha, hora_entrada, hora_salida, registrado_por)
    values (
      '${E1}',
      '${P1}',
      (now() at time zone 'America/Mexico_City')::date - 1,
      '07:00',
      '17:00',
      '${MED}'
    );
  `)
  const ayer = await db.query(
    "select fecha::text, registrado_por from public.asistencia where empleado_id = $1 and fecha = (now() at time zone 'America/Mexico_City')::date - 1",
    [E1],
  )
  if (ayer.rows[0]?.fecha && ayer.rows[0]?.registrado_por === MED) {
    ok('oficina captura una jornada anterior')
  } else {
    fallo('oficina captura una jornada anterior', JSON.stringify(ayer.rows[0]))
  }

  await como(RES)
  await db.exec(`delete from public.asistencia where empleado_id = '${E1}'`)
  await db.exec(`delete from public.proyectos where id = '${P2}'`)

  await comoPostgres()
  const restantes = await db.query('select count(*)::int as n from public.asistencia')
  if (restantes.rows[0].n === 2) ok('residente no borra asistencia')
  else fallo('residente no borra asistencia', `quedan ${restantes.rows[0].n}`)

  const proyectosRestantes = await db.query('select count(*)::int as n from public.proyectos')
  if (proyectosRestantes.rows[0].n === 2) ok('residente no borra obras')
  else fallo('residente no borra obras', `quedan ${proyectosRestantes.rows[0].n}`)

  await db.exec(`update public.perfiles set activo = false where id = '${RES}'`)
  await como(RES)
  const bloqueado = await db.query('select count(*)::int as n from public.proyectos')
  if (bloqueado.rows[0].n === 0) ok('cuenta deshabilitada no ve obras')
  else fallo('cuenta deshabilitada no ve obras', `vio ${bloqueado.rows[0].n}`)

  const membresias = await db.query('select count(*)::int as n from public.proyecto_miembros')
  if (membresias.rows[0].n === 0) ok('cuenta deshabilitada no ve sus membresías')
  else fallo('cuenta deshabilitada no ve sus membresías', `vio ${membresias.rows[0].n}`)

  const privilegiosHistorial = await db.query(`
    select privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'asistencia_historial'
      and grantee = 'authenticated'
  `)
  if (
    privilegiosHistorial.rows.length === 1 &&
    privilegiosHistorial.rows[0].privilege_type === 'SELECT'
  ) {
    ok('historial solo con privilegio de lectura')
  } else {
    fallo('historial solo con privilegio de lectura', JSON.stringify(privilegiosHistorial.rows))
  }

  const privilegiosFunciones = await db.query(`
    select count(*)::int as n
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and grantee in ('anon', 'PUBLIC')
  `)
  if (privilegiosFunciones.rows[0].n === 0) ok('anon y PUBLIC sin ejecución de funciones')
  else fallo('anon y PUBLIC sin ejecución de funciones', `filas ${privilegiosFunciones.rows[0].n}`)

  await como(null, 'anon')
  await esperarError('anon no ejecuta mis_permisos', () =>
    db.query('select public.mis_permisos()'), '42501')
} catch (error) {
  fallo('ejecución de migraciones', `${error.code ?? ''} ${error.message}`)
} finally {
  console.log('\nRESUMEN: ' + (fallos.length === 0 ? 'todo correcto' : `${fallos.length} fallo(s)`))
  if (fallos.length) console.log(fallos.join('\n'))
  await db.close()
  process.exit(fallos.length === 0 ? 0 : 1)
}
