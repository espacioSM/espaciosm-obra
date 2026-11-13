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
  await ejecutar('0007_materiales.sql')
  ok('0007 materiales')
  await ejecutar('0007_materiales.sql')
  ok('0007 materiales repetible')
  await ejecutar('0008_generadores.sql')
  ok('0008 generadores')
  await ejecutar('0008_generadores.sql')
  ok('0008 generadores repetible')
  await ejecutar('0009_estimaciones.sql')
  ok('0009 estimaciones')
  await ejecutar('0009_estimaciones.sql')
  ok('0009 estimaciones repetible')
  await ejecutar('0010_solicitudes.sql')
  ok('0010 solicitudes')
  await ejecutar('0010_solicitudes.sql')
  ok('0010 solicitudes repetible')
  await ejecutar('0011_catalogo_materiales.sql')
  ok('0011 catálogo')
  await ejecutar('0011_catalogo_materiales.sql')
  ok('0011 catálogo repetible')

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

  const materialCreado = await db.query(`
    insert into public.materiales
      (proyecto_id, nombre, unidad, costo_unitario, stock_minimo)
    values
      ('${P1}', 'Cemento', 'bulto', 180, 10)
    returning id
  `)
  const MAT = materialCreado.rows[0].id
  ok('residente crea material de su obra')

  await db.query(`
    insert into public.material_movimientos
      (material_id, tipo, cantidad, costo_unitario, proveedor, registrado_por)
    values
      ('${MAT}', 'entrada', 20, 180, 'Proveedor Demo', '${RES}')
  `)
  const movimiento = await db.query(
    'select proyecto_id, tipo, cantidad::text, registrado_por from public.material_movimientos where material_id = $1',
    [MAT],
  )
  if (
    movimiento.rows[0]?.proyecto_id === P1 &&
    movimiento.rows[0]?.tipo === 'entrada' &&
    movimiento.rows[0]?.registrado_por === RES
  ) {
    ok('movimiento de material con obra y autor forzados')
  } else {
    fallo('movimiento de material con obra y autor forzados', JSON.stringify(movimiento.rows[0]))
  }

  const sinEditarMaterial = await db.query(
    `update public.materiales set costo_unitario = 200 where id = '${MAT}' returning id`,
  )
  if (sinEditarMaterial.rows.length === 0) ok('residente no edita el catálogo')
  else fallo('residente no edita el catálogo', 'actualizó una fila')

  await esperarError('residente no crea material en obra ajena', () =>
    db.exec(`insert into public.materiales (proyecto_id, nombre) values ('${P2}', 'Ajeno')`), '42501')

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

  const materialesOficina = await db.query('select count(*)::int as n from public.materiales')
  const movimientosOficina = await db.query(
    'select count(*)::int as n from public.material_movimientos',
  )
  if (materialesOficina.rows[0].n === 1 && movimientosOficina.rows[0].n === 1) {
    ok('permiso medio consulta materiales de su obra')
  } else {
    fallo(
      'permiso medio consulta materiales de su obra',
      `materiales ${materialesOficina.rows[0].n}, movimientos ${movimientosOficina.rows[0].n}`,
    )
  }

  const generadorCreado = await db.query(`
    insert into public.generadores
      (proyecto_id, clave, descripcion, unidad, cantidad, precio_unitario)
    values
      ('${P1}', 'M-01', 'Muro de block', 'm2', 100, 250)
    returning id
  `)
  const GEN = generadorCreado.rows[0].id
  await db.query(`
    insert into public.generador_avances (generador_id, fecha, cantidad, nota)
    values ('${GEN}', (now() at time zone 'America/Mexico_City')::date, 40, 'Frente A')
  `)
  const avanceGenerador = await db.query(
    'select proyecto_id, cantidad::text, registrado_por from public.generador_avances where generador_id = $1',
    [GEN],
  )
  if (
    avanceGenerador.rows[0]?.proyecto_id === P1 &&
    avanceGenerador.rows[0]?.registrado_por === MED
  ) {
    ok('oficina registra avance de generador')
  } else {
    fallo('oficina registra avance de generador', JSON.stringify(avanceGenerador.rows[0]))
  }

  await esperarError('avance no supera lo contratado', () =>
    db.exec(`insert into public.generador_avances (generador_id, cantidad) values ('${GEN}', 70)`), '23514')

  await como(RES)
  const generadoresResidente = await db.query('select count(*)::int as n from public.generadores')
  const avancesResidente = await db.query(
    'select count(*)::int as n from public.generador_avances',
  )
  if (generadoresResidente.rows[0].n === 1 && avancesResidente.rows[0].n === 1) {
    ok('residente consulta generadores de su obra')
  } else {
    fallo(
      'residente consulta generadores de su obra',
      `generadores ${generadoresResidente.rows[0].n}, avances ${avancesResidente.rows[0].n}`,
    )
  }

  await esperarError('residente no crea generadores', () =>
    db.exec(`insert into public.generadores (proyecto_id, descripcion, cantidad) values ('${P1}', 'Ajeno', 1)`), '42501')

  await esperarError('residente no crea avances', () =>
    db.exec(`insert into public.generador_avances (generador_id, cantidad) values ('${GEN}', 1)`), '42501')

  await como(MED)
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
  const estimacionCreada = await db.query(`
    select public.crear_estimacion(
      '${P1}',
      'EST-01',
      (now() at time zone 'America/Mexico_City')::date,
      (now() at time zone 'America/Mexico_City')::date,
      5,
      'Corte demo'
    ) as id
  `)
  const EST = estimacionCreada.rows[0].id
  const partidasEstimacion = await db.query(
    'select cantidad::text, precio_unitario::text, importe::text from public.estimacion_partidas where estimacion_id = $1',
    [EST],
  )
  if (
    partidasEstimacion.rows.length === 1 &&
    Number(partidasEstimacion.rows[0].cantidad) === 40 &&
    Number(partidasEstimacion.rows[0].importe) === 10000
  ) {
    ok('estimación calculada desde avances')
  } else {
    fallo('estimación calculada desde avances', JSON.stringify(partidasEstimacion.rows))
  }

  const segundaEstimacion = await db.query(`
    select public.crear_estimacion(
      '${P1}',
      'EST-02',
      (now() at time zone 'America/Mexico_City')::date,
      (now() at time zone 'America/Mexico_City')::date,
      0,
      null
    ) as id
  `)
  const partidasSegunda = await db.query(
    'select count(*)::int as n from public.estimacion_partidas where estimacion_id = $1',
    [segundaEstimacion.rows[0].id],
  )
  if (partidasSegunda.rows[0].n === 0) ok('no duplica cantidades ya estimadas')
  else fallo('no duplica cantidades ya estimadas', `vio ${partidasSegunda.rows[0].n}`)

  await como(MED)
  const partidasOficina = await db.query(
    'select count(*)::int as n from public.estimacion_partidas where estimacion_id = $1',
    [EST],
  )
  if (partidasOficina.rows[0].n === 1) ok('permiso medio consulta partidas')
  else fallo('permiso medio consulta partidas', `vio ${partidasOficina.rows[0].n}`)

  await esperarError('permiso medio no crea estimaciones', () =>
    db.exec(`
      select public.crear_estimacion(
        '${P1}', 'EST-03',
        (now() at time zone 'America/Mexico_City')::date,
        (now() at time zone 'America/Mexico_City')::date,
        0, null
      )
    `), '42501')

  const cambioEstadoOficina = await db.query(
    `update public.estimaciones set estado = 'enviada' where id = '${EST}' returning id`,
  )
  if (cambioEstadoOficina.rows.length === 0) ok('permiso medio no cambia el estado')
  else fallo('permiso medio no cambia el estado', 'actualizó una fila')

  await como(RES)
  const estimacionesResidente = await db.query('select count(*)::int as n from public.estimaciones')
  if (estimacionesResidente.rows[0].n === 0) ok('residente no ve estimaciones')
  else fallo('residente no ve estimaciones', `vio ${estimacionesResidente.rows[0].n}`)

  await como(ADMIN)
  await db.exec(`update public.estimaciones set estado = 'enviada' where id = '${EST}'`)
  const estadoAdmin = await db.query('select estado from public.estimaciones where id = $1', [EST])
  if (estadoAdmin.rows[0]?.estado === 'enviada') ok('admin cambia estado de estimación')
  else fallo('admin cambia estado de estimación', JSON.stringify(estadoAdmin.rows[0]))

  await como(RES)
  const solicitudCreada = await db.query(`
    insert into public.solicitudes_recursos
      (proyecto_id, tipo, descripcion, cantidad, unidad, prioridad)
    values
      ('${P1}', 'material', 'Cemento para colado', 10, 'bulto', 'alta')
    returning id
  `)
  const SOL = solicitudCreada.rows[0].id
  const solicitudesResidente = await db.query(
    "select * from public.listar_solicitudes('" + P1 + "')",
  )
  if (
    solicitudesResidente.rows.length === 1 &&
    solicitudesResidente.rows[0].estado === 'pendiente'
  ) {
    ok('residente crea y ve su solicitud')
  } else {
    fallo('residente crea y ve su solicitud', JSON.stringify(solicitudesResidente.rows))
  }

  await esperarError('residente no responde solicitudes', () =>
    db.exec(`select public.responder_solicitud('${SOL}', 'aprobada', 'No')`), '42501')

  await como(MED)
  const solicitudesOficina = await db.query(
    "select * from public.listar_solicitudes('" + P1 + "')",
  )
  if (solicitudesOficina.rows.length === 1) ok('oficina ve solicitudes de la obra')
  else fallo('oficina ve solicitudes de la obra', `vio ${solicitudesOficina.rows.length}`)

  await db.query(
    `select public.responder_solicitud('${SOL}', 'aprobada', 'Autorizado')`,
  )
  const respuestaOficina = await db.query(
    'select estado, respuesta from public.solicitudes_recursos where id = $1',
    [SOL],
  )
  if (respuestaOficina.rows[0]?.estado === 'aprobada') ok('oficina aprueba solicitud')
  else fallo('oficina aprueba solicitud', JSON.stringify(respuestaOficina.rows[0]))

  await como(RES)
  const solicitudAprobada = await db.query(
    "select * from public.listar_solicitudes('" + P1 + "')",
  )
  if (solicitudAprobada.rows[0]?.estado === 'aprobada') {
    ok('residente ve la respuesta')
  } else {
    fallo('residente ve la respuesta', JSON.stringify(solicitudAprobada.rows[0]))
  }

  await como(ADMIN)
  const catalogo = await db.query('select count(*)::int as n from public.catalogo_materiales')
  if (catalogo.rows[0].n === 42) ok('catálogo de materiales precargado')
  else fallo('catálogo de materiales precargado', `vio ${catalogo.rows[0].n}`)

  await db.query(`
    insert into public.materiales
      (proyecto_id, catalogo_id, nombre, especificacion, unidad, costo_unitario)
    values
      ('${P1}', 'ALB-001', 'Block de concreto', '15 x 20 x 40 cm', 'pieza', 21.4),
      ('${P1}', 'ALB-002', 'Block de concreto', '12 x 20 x 40 cm', 'pieza', 15)
  `)
  const blocks = await db.query(
    "select count(*)::int as n from public.materiales where proyecto_id = $1 and catalogo_id in ('ALB-001','ALB-002')",
    [P1],
  )
  if (blocks.rows[0].n === 2) ok('dos presentaciones del mismo material')
  else fallo('dos presentaciones del mismo material', `vio ${blocks.rows[0].n}`)

  await como(RES)
  const catalogoResidente = await db.query(
    'select count(*)::int as n from public.catalogo_materiales',
  )
  if (catalogoResidente.rows[0].n === 42) ok('residente consulta el catálogo')
  else fallo('residente consulta el catálogo', `vio ${catalogoResidente.rows[0].n}`)

  await esperarError('residente no edita el catálogo global', () =>
    db.exec(`insert into public.catalogo_materiales (codigo, categoria, nombre, unidad) values ('X-1', 'otro', 'Ajeno', 'pieza')`), '42501')

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
