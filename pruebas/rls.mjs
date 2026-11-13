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
  await ejecutar('0012_catalogo_ultimo_precio.sql')
  ok('0012 catálogo y último precio')
  await ejecutar('0012_catalogo_ultimo_precio.sql')
  ok('0012 catálogo y último precio repetible')
  await ejecutar('0013_materiales_solo_gestion.sql')
  ok('0013 materiales solo gestión')
  await ejecutar('0013_materiales_solo_gestion.sql')
  ok('0013 materiales solo gestión repetible')
  await ejecutar('0014_movimiento_descripcion.sql')
  ok('0014 descripción de movimiento')
  await ejecutar('0014_movimiento_descripcion.sql')
  ok('0014 descripción de movimiento repetible')
  await ejecutar('0015_bajas_material.sql')
  ok('0015 bajas de material')
  await ejecutar('0015_bajas_material.sql')
  ok('0015 bajas de material repetible')
  await ejecutar('0016_baja_cantidad.sql')
  ok('0016 baja con cantidad')
  await ejecutar('0016_baja_cantidad.sql')
  ok('0016 baja con cantidad repetible')
  await ejecutar('0017_avances_tramo.sql')
  ok('0017 avances por tramo')
  await ejecutar('0017_avances_tramo.sql')
  ok('0017 avances por tramo repetible')
  await ejecutar('0018_respuesta_avance.sql')
  ok('0018 respuesta de avance')
  await ejecutar('0018_respuesta_avance.sql')
  ok('0018 respuesta de avance repetible')
  await ejecutar('0019_corregir_rechazado.sql')
  ok('0019 corregir rechazado')
  await ejecutar('0019_corregir_rechazado.sql')
  ok('0019 corregir rechazado repetible')
  await ejecutar('0020_foto_avance.sql')
  ok('0020 foto de avance')
  await ejecutar('0020_foto_avance.sql')
  ok('0020 foto de avance repetible')
  await ejecutar('0022_estimacion_carrito.sql')
  ok('0022 estimación con selección')
  await ejecutar('0022_estimacion_carrito.sql')
  ok('0022 estimación con selección repetible')
  await ejecutar('0023_tres_fotos.sql')
  ok('0023 tres fotos')
  await ejecutar('0023_tres_fotos.sql')
  ok('0023 tres fotos repetible')
  await ejecutar('0024_pagos.sql')
  ok('0024 pagos')
  await ejecutar('0024_pagos.sql')
  ok('0024 pagos repetible')
  await ejecutar('0025_bitacora.sql')
  ok('0025 bitácora')
  await ejecutar('0025_bitacora.sql')
  ok('0025 bitácora repetible')
  await ejecutar('0026_bitacora_comentarios.sql')
  ok('0026 seguimiento de bitácora')
  await ejecutar('0026_bitacora_comentarios.sql')
  ok('0026 seguimiento de bitácora repetible')
  await ejecutar('0027_pago_estimacion.sql')
  ok('0027 pago de estimación')
  await ejecutar('0027_pago_estimacion.sql')
  ok('0027 pago de estimación repetible')

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

  await como(MED)
  const materialCreado = await db.query(`
    insert into public.materiales
      (proyecto_id, nombre, unidad, costo_unitario, stock_minimo)
    values
      ('${P1}', 'Cemento', 'bulto', 180, 10)
    returning id
  `)
  const MAT = materialCreado.rows[0].id
  ok('oficina crea material de su obra')

  await db.query(`
    insert into public.material_movimientos
      (material_id, tipo, cantidad, costo_unitario, proveedor, registrado_por)
    values
      ('${MAT}', 'entrada', 20, 180, 'Proveedor Demo', '${MED}')
  `)
  const movimiento = await db.query(
    'select proyecto_id, tipo, cantidad::text, registrado_por from public.material_movimientos where material_id = $1',
    [MAT],
  )
  if (
    movimiento.rows[0]?.proyecto_id === P1 &&
    movimiento.rows[0]?.tipo === 'entrada' &&
    movimiento.rows[0]?.registrado_por === MED
  ) {
    ok('movimiento de material con obra y autor forzados')
  } else {
    fallo('movimiento de material con obra y autor forzados', JSON.stringify(movimiento.rows[0]))
  }

  await como(RES)
  const materialesResidente = await db.query('select count(*)::int as n from public.materiales')
  if (materialesResidente.rows[0].n === 1) ok('residente consulta materiales')
  else fallo('residente consulta materiales', `vio ${materialesResidente.rows[0].n}`)

  await esperarError('residente no crea materiales', () =>
    db.exec(`insert into public.materiales (proyecto_id, nombre) values ('${P1}', 'Ajeno')`), '42501')

  await esperarError('residente no registra movimientos de material', () =>
    db.exec(`insert into public.material_movimientos (material_id, tipo, cantidad) values ('${MAT}', 'entrada', 1)`), '42501')

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
    insert into public.generador_avances (generador_id, fecha, cantidad, nota, estado)
    values ('${GEN}', (now() at time zone 'America/Mexico_City')::date, 40, 'Frente A', 'validado')
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
    db.exec(`insert into public.generador_avances (generador_id, cantidad, estado) values ('${GEN}', 70, 'enviado')`), '23514')

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

  const avanceResidente = await db.query(`
    insert into public.generador_avances (generador_id, cantidad, estado)
    values ('${GEN}', 5, 'borrador')
    returning id
  `)
  if (avanceResidente.rows.length === 1) ok('residente crea avance en borrador')
  else fallo('residente crea avance en borrador')

  await esperarError('residente no valida avances', () =>
    db.exec(`update public.generador_avances set estado = 'validado' where id = '${avanceResidente.rows[0].id}'`), '42501')

  await como(MED)
  await db.exec(`
    update public.generador_avances
    set estado = 'rechazado', observaciones = 'Falta medida'
    where id = '${avanceResidente.rows[0].id}'
  `)

  await como(RES)
  await db.exec(`
    update public.generador_avances
    set estado = 'enviado', respuesta_residente = 'Se corrigió la medida'
    where id = '${avanceResidente.rows[0].id}'
  `)
  const avanceCorregido = await db.query(
    'select estado, respuesta_residente from public.generador_avances where id = $1',
    [avanceResidente.rows[0].id],
  )
  if (
    avanceCorregido.rows[0]?.estado === 'enviado' &&
    avanceCorregido.rows[0]?.respuesta_residente === 'Se corrigió la medida'
  ) {
    ok('residente corrige y reenvía avance rechazado')
  } else {
    fallo('residente corrige y reenvía avance rechazado', JSON.stringify(avanceCorregido.rows[0]))
  }

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
  const vistaPrevia = await db.query(`
    select * from public.previsualizar_estimacion(
      '${P1}',
      (now() at time zone 'America/Mexico_City')::date,
      (now() at time zone 'America/Mexico_City')::date
    )
  `)
  if (
    vistaPrevia.rows.length === 1 &&
    Number(vistaPrevia.rows[0].cantidad) === 40 &&
    Number(vistaPrevia.rows[0].importe) === 10000
  ) {
    ok('previsualiza partidas de estimación')
  } else {
    fallo('previsualiza partidas de estimación', JSON.stringify(vistaPrevia.rows))
  }

  const seleccionEstimacion = await db.query(`
    select public.crear_estimacion_seleccion(
      '${P1}', 'EST-SEL',
      (now() at time zone 'America/Mexico_City')::date,
      (now() at time zone 'America/Mexico_City')::date,
      0, null,
      array['${GEN}']::uuid[]
    ) as id
  `)
  const partidasSeleccion = await db.query(
    'select cantidad::text, importe::text from public.estimacion_partidas where estimacion_id = $1',
    [seleccionEstimacion.rows[0].id],
  )
  if (
    partidasSeleccion.rows.length === 1 &&
    Number(partidasSeleccion.rows[0].cantidad) === 40
  ) {
    ok('crea estimación solo con partidas seleccionadas')
  } else {
    fallo('crea estimación solo con partidas seleccionadas', JSON.stringify(partidasSeleccion.rows))
  }

  await db.exec(`delete from public.estimaciones where id = '${seleccionEstimacion.rows[0].id}'`)

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
  const catalogo = await db.query(
    "select count(*)::int as n from public.catalogo_materiales where origen = 'base'",
  )
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
  if (catalogoResidente.rows[0].n === 0) ok('residente no ve el catálogo global')
  else fallo('residente no ve el catálogo global', `vio ${catalogoResidente.rows[0].n}`)

  const permisosMateriales = await db.query(
    "select count(*)::int as n from public.rol_permisos where rol = 'residente' and modulo = 'materiales' and permitido",
  )
  if (permisosMateriales.rows[0].n === 1) ok('residente solo consulta materiales')
  else fallo('residente solo consulta materiales', `permisos ${permisosMateriales.rows[0].n}`)

  await esperarError('residente no edita el catálogo global', () =>
    db.exec(`insert into public.catalogo_materiales (codigo, categoria, nombre, unidad) values ('X-1', 'otro', 'Ajeno', 'pieza')`), '42501')

  await como(MED)
  const materialPropio = await db.query(`
    insert into public.materiales (proyecto_id, nombre, unidad, costo_unitario)
    values ('${P1}', 'Material propio', 'pieza', 77)
    returning id, catalogo_id
  `)
  const PROP = materialPropio.rows[0]
  if (PROP.catalogo_id) ok('material nuevo aprende en el catálogo')
  else fallo('material nuevo aprende en el catálogo', 'sin catalogo_id')

  await db.query(`
    insert into public.material_movimientos (material_id, tipo, cantidad, costo_unitario)
    values ('${PROP.id}', 'entrada', 1, 88)
  `)
  const ultimoMaterial = await db.query(
    'select ultimo_precio::text from public.materiales where id = $1',
    [PROP.id],
  )

  await como(MED)
  const ultimoCatalogo = await db.query(
    'select ultimo_precio::text, origen from public.catalogo_materiales where codigo = $1',
    [PROP.catalogo_id],
  )
  if (
    Number(ultimoMaterial.rows[0]?.ultimo_precio) === 88 &&
    Number(ultimoCatalogo.rows[0]?.ultimo_precio) === 88 &&
    ultimoCatalogo.rows[0]?.origen === 'propio'
  ) {
    ok('último precio guardado en material y catálogo')
  } else {
    fallo(
      'último precio guardado en material y catálogo',
      JSON.stringify({ material: ultimoMaterial.rows[0], catalogo: ultimoCatalogo.rows[0] }),
    )
  }

  const catalogoOficina = await db.query(
    'select count(*)::int as n from public.catalogo_materiales',
  )
  if (catalogoOficina.rows[0].n === 44) ok('oficina ve el catálogo con el material propio')
  else fallo('oficina ve el catálogo con el material propio', `vio ${catalogoOficina.rows[0].n}`)

  await como(RES)
  const solicitudBaja = await db.query(
    `select public.solicitar_baja_material('${PROP.id}', 'Material dañado', 1) as id`,
  )
  const idBaja = solicitudBaja.rows[0].id
  const bajasResidente = await db.query(
    "select * from public.listar_bajas_material('" + P1 + "')",
  )
  if (
    bajasResidente.rows.length === 1 &&
    bajasResidente.rows[0].estado === 'pendiente'
  ) {
    ok('residente solicita baja de material')
  } else {
    fallo('residente solicita baja de material', JSON.stringify(bajasResidente.rows))
  }

  await esperarError('residente no responde bajas', () =>
    db.exec(`select public.responder_baja_material('${idBaja}', 'aprobada', 'No')`), '42501')

  await como(MED)
  const bajasOficina = await db.query(
    "select * from public.listar_bajas_material('" + P1 + "')",
  )
  if (bajasOficina.rows.length === 1) ok('oficina ve la solicitud de baja')
  else fallo('oficina ve la solicitud de baja', `vio ${bajasOficina.rows.length}`)

  await db.query(
    `select public.responder_baja_material('${idBaja}', 'aprobada', 'Aprobada')`,
  )
  const materialBaja = await db.query(
    'select activo from public.materiales where id = $1',
    [PROP.id],
  )
  const movimientoBaja = await db.query(
    'select es_baja, cantidad::text from public.material_movimientos where baja_id = $1',
    [idBaja],
  )
  if (
    materialBaja.rows[0]?.activo === true &&
    movimientoBaja.rows[0]?.es_baja === true &&
    Number(movimientoBaja.rows[0]?.cantidad) === 1
  ) {
    ok('oficina aprueba la baja y descuenta inventario')
  } else {
    fallo(
      'oficina aprueba la baja y descuenta inventario',
      JSON.stringify({ material: materialBaja.rows[0], movimiento: movimientoBaja.rows[0] }),
    )
  }

  const materialEditado = await db.query(
    `update public.materiales set unidad = 'kg' where id = '${PROP.id}' returning id`,
  )
  const movimientoEditado = await db.query(
    `update public.material_movimientos set nota = 'corregida' where material_id = '${PROP.id}' and es_baja = false returning id`,
  )
  if (materialEditado.rows.length === 1 && movimientoEditado.rows.length === 1) {
    ok('oficina corrige material y movimiento')
  } else {
    fallo('oficina corrige material y movimiento', 'no actualizó')
  }

  await como(RES)
  const intentoMaterial = await db.query(
    `update public.materiales set unidad = 'otra' where id = '${PROP.id}' returning id`,
  )
  const intentoMovimiento = await db.query(
    `update public.material_movimientos set nota = 'otra' where material_id = '${PROP.id}' returning id`,
  )
  if (intentoMaterial.rows.length === 0 && intentoMovimiento.rows.length === 0) {
    ok('residente no corrige inventario')
  } else {
    fallo('residente no corrige inventario', 'actualizó una fila')
  }

  await como(ADMIN)
  await db.exec(`update public.estimaciones set estado = 'autorizada' where id = '${EST}'`)
  await db.query(`
    insert into public.pagos
      (proyecto_id, estimacion_id, tipo, beneficiario, concepto, monto, fecha, metodo)
    values
      ('${P1}', '${EST}', 'proveedor', 'Proveedor Demo', 'Material', 1500,
       (now() at time zone 'America/Mexico_City')::date, 'transferencia')
  `)
  const estimacionPagada = await db.query(
    'select estado from public.estimaciones where id = $1',
    [EST],
  )
  if (estimacionPagada.rows[0]?.estado === 'pagada') ok('pago marca estimación pagada')
  else fallo('pago marca estimación pagada', JSON.stringify(estimacionPagada.rows[0]))
  ok('admin registra pago')

  await como(MED)
  const pagosOficina = await db.query('select count(*)::int as n from public.pagos')
  if (pagosOficina.rows[0].n === 1) ok('oficina consulta pagos')
  else fallo('oficina consulta pagos', `vio ${pagosOficina.rows[0].n}`)

  await esperarError('oficina no registra pagos', () =>
    db.exec(`insert into public.pagos (proyecto_id, beneficiario, concepto, monto) values ('${P1}', 'Ajeno', 'Ajeno', 1)`), '42501')

  await como(RES)
  const pagosResidente = await db.query('select count(*)::int as n from public.pagos')
  if (pagosResidente.rows[0].n === 0) ok('residente no ve pagos')
  else fallo('residente no ve pagos', `vio ${pagosResidente.rows[0].n}`)

  await db.exec(`
    insert into public.bitacora (proyecto_id, fecha, titulo, contenido)
    values ('${P1}', (now() at time zone 'America/Mexico_City')::date, 'Visita', 'Sin incidencias')
  `)
  const bitacoraResidente = await db.query('select count(*)::int as n from public.bitacora')
  if (bitacoraResidente.rows[0].n === 1) ok('residente escribe bitácora')
  else fallo('residente escribe bitácora', `vio ${bitacoraResidente.rows[0].n}`)

  await db.exec(`
    insert into public.bitacora_comentarios (entrada_id, comentario)
    select id, 'Seguimiento del residente' from public.bitacora limit 1
  `)
  const sinEditarEntrada = await db.query(
    "update public.bitacora set titulo = 'Cambio' returning id",
  )
  const sinEditarComentario = await db.query(
    "update public.bitacora_comentarios set comentario = 'Cambio' returning id",
  )
  if (sinEditarEntrada.rows.length === 0 && sinEditarComentario.rows.length === 0) {
    ok('bitácora y seguimiento inmutables')
  } else {
    fallo('bitácora y seguimiento inmutables', 'actualizó una fila')
  }

  await como(MED)
  const bitacoraOficina = await db.query('select count(*)::int as n from public.bitacora')
  if (bitacoraOficina.rows[0].n === 1) ok('oficina consulta bitácora')
  else fallo('oficina consulta bitácora', `vio ${bitacoraOficina.rows[0].n}`)

  const comentariosOficina = await db.query(
    "select * from public.listar_comentarios_bitacora('" + P1 + "')",
  )
  if (comentariosOficina.rows.length === 1) ok('oficina consulta seguimiento')
  else fallo('oficina consulta seguimiento', `vio ${comentariosOficina.rows.length}`)

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
