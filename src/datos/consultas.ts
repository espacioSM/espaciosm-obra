import { supabase } from '../lib/supabase'
import { hoyISO, horaActual } from '../lib/formato'
import type {
  Asistencia,
  AsistenciaResidente,
  DirectorioEmpleado,
  Empleado,
  EstadoEstimacion,
  EstadoProyecto,
  Estimacion,
  EstimacionPartida,
  Generador,
  GeneradorAvance,
  Material,
  MaterialCatalogo,
  MaterialMovimiento,
  Perfil,
  PeriodoPago,
  Proyecto,
  ProyectoMiembro,
  ResidenteEnObra,
  Rol,
  SolicitudRecurso,
  TipoMovimientoMaterial,
  TipoSolicitud,
  PrioridadSolicitud,
  EstadoSolicitud,
} from '../lib/tipos'

// -----------------------------------------------------------------------------
// Entradas de formulario
// -----------------------------------------------------------------------------

export type DatosProyecto = {
  nombre: string
  ubicacion: string | null
  fecha_inicio: string
  fecha_fin: string | null
  estado: EstadoProyecto
}

export type DatosEmpleado = {
  proyecto_id: string
  nombre: string
  puesto: string | null
  sueldo: number
  periodo_pago: PeriodoPago
  fecha_ingreso: string
}

export type ResumenObra = {
  proyectos: Proyecto[]
  empleadosActivos: number
  asistenciasHoy: number
  sinSalida: number
  personalPorProyecto: Record<string, number>
}

// -----------------------------------------------------------------------------
// Proyectos
// -----------------------------------------------------------------------------

export async function listarProyectos(): Promise<Proyecto[]> {
  const { data, error } = await supabase
    .from('proyectos')
    .select('*')
    .order('fecha_inicio', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function crearProyecto(datos: DatosProyecto): Promise<void> {
  const { error } = await supabase.from('proyectos').insert(datos)
  if (error) throw error
}

export async function actualizarProyecto(
  id: string,
  datos: Partial<DatosProyecto>,
): Promise<void> {
  const { error } = await supabase.from('proyectos').update(datos).eq('id', id)
  if (error) throw error
}

// -----------------------------------------------------------------------------
// Equipo de cada proyecto
// -----------------------------------------------------------------------------

export async function listarMiembros(): Promise<ProyectoMiembro[]> {
  const { data, error } = await supabase.from('proyecto_miembros').select('*')
  if (error) throw error
  return data ?? []
}

export async function agregarMiembro(proyectoId: string, usuarioId: string): Promise<void> {
  const { error } = await supabase
    .from('proyecto_miembros')
    .insert({ proyecto_id: proyectoId, usuario_id: usuarioId })
  if (error) throw error
}

export async function quitarMiembro(proyectoId: string, usuarioId: string): Promise<void> {
  const { error } = await supabase
    .from('proyecto_miembros')
    .delete()
    .eq('proyecto_id', proyectoId)
    .eq('usuario_id', usuarioId)
  if (error) throw error
}

export async function listarPerfiles(): Promise<Perfil[]> {
  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .order('nombre', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function actualizarPerfil(
  id: string,
  cambios: { rol?: Rol; activo?: boolean },
): Promise<void> {
  const { error } = await supabase.from('perfiles').update(cambios).eq('id', id)
  if (error) throw error
}

// -----------------------------------------------------------------------------
// Empleados
// -----------------------------------------------------------------------------

export async function listarEmpleados(): Promise<Empleado[]> {
  const { data, error } = await supabase
    .from('empleados')
    .select('*')
    .order('nombre', { ascending: true })
  if (error) throw error
  return data ?? []
}

/**
 * Directorio de una obra sin sueldos. Es la vía que usa el residente para
 * pasar lista; la tabla empleados queda reservada a administración y permiso
 * medio.
 */
export async function listarDirectorio(proyectoId: string): Promise<DirectorioEmpleado[]> {
  const { data, error } = await supabase.rpc('empleados_de_proyecto', {
    p_proyecto_id: proyectoId,
  })
  if (error) throw error
  return data ?? []
}

export async function contarPersonalPorProyecto(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('conteo_personal_por_proyecto')
  if (error) throw error

  const conteo: Record<string, number> = {}
  for (const fila of data ?? []) {
    conteo[fila.proyecto_id] = fila.activos
  }
  return conteo
}

export async function crearEmpleado(datos: DatosEmpleado): Promise<void> {
  const { error } = await supabase.from('empleados').insert(datos)
  if (error) throw error
}

export async function actualizarEmpleado(
  id: string,
  datos: Partial<DatosEmpleado> & { activo?: boolean; fecha_baja?: string | null },
): Promise<void> {
  const { error } = await supabase.from('empleados').update(datos).eq('id', id)
  if (error) throw error
}

export async function darDeBajaEmpleado(id: string): Promise<void> {
  const { error } = await supabase
    .from('empleados')
    .update({ activo: false, fecha_baja: hoyISO() })
    .eq('id', id)
  if (error) throw error
}

export async function reactivarEmpleado(id: string): Promise<void> {
  const { error } = await supabase
    .from('empleados')
    .update({ activo: true, fecha_baja: null })
    .eq('id', id)
  if (error) throw error
}

// -----------------------------------------------------------------------------
// Asistencia
// -----------------------------------------------------------------------------

export async function listarAsistencia(
  proyectoId: string,
  fecha: string,
): Promise<Asistencia[]> {
  const { data, error } = await supabase
    .from('asistencia')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .eq('fecha', fecha)
  if (error) throw error
  return data ?? []
}

export async function registrarEntrada(
  empleadoId: string,
  proyectoId: string,
  fecha: string,
  usuarioId: string,
): Promise<void> {
  const { error } = await supabase.from('asistencia').insert({
    empleado_id: empleadoId,
    proyecto_id: proyectoId,
    fecha,
    hora_entrada: horaActual(),
    registrado_por: usuarioId,
  })
  if (error) throw error
}

export async function registrarSalida(
  asistenciaId: string,
  usuarioId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('asistencia')
    .update({ hora_salida: horaActual(), registrado_por: usuarioId })
    .eq('id', asistenciaId)
    // Solo cierra una jornada abierta: evita que un segundo toque o otro
    // dispositivo sobrescriba la salida ya registrada.
    .is('hora_salida', null)
    .select('id')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('SALIDA_YA_REGISTRADA')
  }
}

export type JornadaManual = {
  empleadoId: string
  proyectoId: string
  fecha: string
  horaEntrada: string
  horaSalida: string | null
  usuarioId: string
}

/**
 * Captura o corrige una jornada completa. Es la vía de la oficina para los
 * días anteriores: permite fijar entrada y salida, no solo la hora actual.
 */
export async function guardarJornada(datos: JornadaManual): Promise<void> {
  const { error } = await supabase.from('asistencia').upsert(
    {
      empleado_id: datos.empleadoId,
      proyecto_id: datos.proyectoId,
      fecha: datos.fecha,
      hora_entrada: datos.horaEntrada,
      hora_salida: datos.horaSalida,
      registrado_por: datos.usuarioId,
    },
    { onConflict: 'empleado_id,fecha' },
  )

  if (error) throw error
}

// -----------------------------------------------------------------------------
// Jornada del propio residente
// -----------------------------------------------------------------------------

export async function listarMiJornada(
  usuarioId: string,
  fecha: string,
): Promise<AsistenciaResidente | null> {
  const { data, error } = await supabase
    .from('asistencia_residentes')
    .select('*')
    .eq('usuario_id', usuarioId)
    .eq('fecha', fecha)
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

export async function registrarMiEntrada(
  proyectoId: string,
  usuarioId: string,
): Promise<void> {
  const { error } = await supabase.from('asistencia_residentes').insert({
    usuario_id: usuarioId,
    proyecto_id: proyectoId,
    fecha: hoyISO(),
    registrado_por: usuarioId,
  })

  if (error) throw error
}

export async function registrarMiSalida(
  asistenciaId: string,
  usuarioId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('asistencia_residentes')
    .update({ hora_salida: horaActual(), registrado_por: usuarioId })
    .eq('id', asistenciaId)
    .is('hora_salida', null)
    .select('id')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('SALIDA_YA_REGISTRADA')
  }
}

export async function listarResidentesEnObra(fecha: string): Promise<ResidenteEnObra[]> {
  const { data, error } = await supabase.rpc('residentes_en_obra', { p_fecha: fecha })
  if (error) throw error
  return data ?? []
}

// -----------------------------------------------------------------------------
// Materiales
// -----------------------------------------------------------------------------

export type DatosMaterial = {
  proyectoId: string
  nombre: string
  unidad: string
  costoUnitario: number
  stockMinimo: number
  catalogoId?: string | null
  especificacion?: string | null
  presentacion?: string | null
}

export type DatosMovimientoMaterial = {
  materialId: string
  tipo: TipoMovimientoMaterial
  fecha: string
  cantidad: number
  costoUnitario: number
  proveedor: string | null
  nota: string | null
  usuarioId: string | null
}

export async function listarMateriales(proyectoId: string): Promise<Material[]> {
  const { data, error } = await supabase
    .from('materiales')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .eq('activo', true)
    .order('nombre')

  if (error) throw error
  return data ?? []
}

export async function crearMaterial(datos: DatosMaterial): Promise<Material> {
  const { data, error } = await supabase
    .from('materiales')
    .insert({
      proyecto_id: datos.proyectoId,
      nombre: datos.nombre,
      unidad: datos.unidad,
      costo_unitario: datos.costoUnitario,
      stock_minimo: datos.stockMinimo,
      catalogo_id: datos.catalogoId ?? null,
      especificacion: datos.especificacion ?? null,
      presentacion: datos.presentacion ?? null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function listarCatalogoMateriales(): Promise<MaterialCatalogo[]> {
  const { data, error } = await supabase
    .from('catalogo_materiales')
    .select('*')
    .eq('activo', true)
    .order('categoria')
    .order('nombre')

  if (error) throw error
  return data ?? []
}

export async function listarMovimientosMaterial(
  proyectoId: string,
): Promise<MaterialMovimiento[]> {
  const { data, error } = await supabase
    .from('material_movimientos')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function crearMovimientoMaterial(
  datos: DatosMovimientoMaterial,
): Promise<void> {
  const { error } = await supabase.from('material_movimientos').insert({
    material_id: datos.materialId,
    tipo: datos.tipo,
    fecha: datos.fecha,
    cantidad: datos.cantidad,
    costo_unitario: datos.costoUnitario,
    proveedor: datos.proveedor,
    nota: datos.nota,
    registrado_por: datos.usuarioId ?? undefined,
  })

  if (error) throw error
}

// -----------------------------------------------------------------------------
// Generadores de obra
// -----------------------------------------------------------------------------

export type DatosGenerador = {
  proyectoId: string
  clave: string | null
  descripcion: string
  unidad: string
  cantidad: number
  precioUnitario: number
}

export type DatosAvanceGenerador = {
  generadorId: string
  fecha: string
  cantidad: number
  nota: string | null
  usuarioId: string | null
}

export async function listarGeneradores(proyectoId: string): Promise<Generador[]> {
  const { data, error } = await supabase
    .from('generadores')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .eq('activo', true)
    .order('clave', { ascending: true, nullsFirst: false })
    .order('descripcion')

  if (error) throw error
  return data ?? []
}

export async function crearGenerador(datos: DatosGenerador): Promise<Generador> {
  const { data, error } = await supabase
    .from('generadores')
    .insert({
      proyecto_id: datos.proyectoId,
      clave: datos.clave,
      descripcion: datos.descripcion,
      unidad: datos.unidad,
      cantidad: datos.cantidad,
      precio_unitario: datos.precioUnitario,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}

export async function listarAvancesGenerador(
  proyectoId: string,
): Promise<GeneradorAvance[]> {
  const { data, error } = await supabase
    .from('generador_avances')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function crearAvanceGenerador(
  datos: DatosAvanceGenerador,
): Promise<void> {
  const { error } = await supabase.from('generador_avances').insert({
    generador_id: datos.generadorId,
    fecha: datos.fecha,
    cantidad: datos.cantidad,
    nota: datos.nota,
    registrado_por: datos.usuarioId ?? undefined,
  })

  if (error) throw error
}

// -----------------------------------------------------------------------------
// Estimaciones
// -----------------------------------------------------------------------------

export type DatosEstimacion = {
  proyectoId: string
  numero: string
  fechaInicio: string
  fechaFin: string
  retencion: number
  notas: string | null
}

export async function listarEstimaciones(proyectoId: string): Promise<Estimacion[]> {
  const { data, error } = await supabase
    .from('estimaciones')
    .select('*')
    .eq('proyecto_id', proyectoId)
    .order('fecha_fin', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function listarPartidasEstimacion(
  estimacionId: string,
): Promise<EstimacionPartida[]> {
  const { data, error } = await supabase
    .from('estimacion_partidas')
    .select('*')
    .eq('estimacion_id', estimacionId)
    .order('descripcion')

  if (error) throw error
  return data ?? []
}

export async function crearEstimacion(datos: DatosEstimacion): Promise<string> {
  const { data, error } = await supabase.rpc('crear_estimacion', {
    p_proyecto_id: datos.proyectoId,
    p_numero: datos.numero,
    p_fecha_inicio: datos.fechaInicio,
    p_fecha_fin: datos.fechaFin,
    p_retencion: datos.retencion,
    p_notas: datos.notas,
  })

  if (error) throw error
  return data
}

export async function actualizarEstadoEstimacion(
  estimacionId: string,
  estado: EstadoEstimacion,
): Promise<void> {
  const { error } = await supabase
    .from('estimaciones')
    .update({ estado })
    .eq('id', estimacionId)

  if (error) throw error
}

// -----------------------------------------------------------------------------
// Solicitudes de recursos
// -----------------------------------------------------------------------------

export type DatosSolicitud = {
  proyectoId: string
  tipo: TipoSolicitud
  descripcion: string
  cantidad: number | null
  unidad: string | null
  prioridad: PrioridadSolicitud
  fechaRequerida: string | null
  notas: string | null
}

export async function listarSolicitudes(proyectoId: string): Promise<SolicitudRecurso[]> {
  const { data, error } = await supabase.rpc('listar_solicitudes', {
    p_proyecto_id: proyectoId,
  })

  if (error) throw error
  return data ?? []
}

export async function crearSolicitud(datos: DatosSolicitud): Promise<void> {
  const { error } = await supabase.from('solicitudes_recursos').insert({
    proyecto_id: datos.proyectoId,
    tipo: datos.tipo,
    descripcion: datos.descripcion,
    cantidad: datos.cantidad,
    unidad: datos.unidad,
    prioridad: datos.prioridad,
    fecha_requerida: datos.fechaRequerida,
    notas: datos.notas,
  })

  if (error) throw error
}

export async function responderSolicitud(
  solicitudId: string,
  estado: EstadoSolicitud,
  respuesta: string,
): Promise<void> {
  const { error } = await supabase.rpc('responder_solicitud', {
    p_solicitud_id: solicitudId,
    p_estado: estado,
    p_respuesta: respuesta,
  })

  if (error) throw error
}

// -----------------------------------------------------------------------------
// Resumen
// -----------------------------------------------------------------------------

export async function cargarResumen(): Promise<ResumenObra> {
  const [proyectos, asistencia, conteo] = await Promise.all([
    supabase.from('proyectos').select('*').order('fecha_inicio', { ascending: false }),
    supabase.from('asistencia').select('*').eq('fecha', hoyISO()),
    supabase.rpc('conteo_personal_por_proyecto'),
  ])

  if (proyectos.error) throw proyectos.error
  if (asistencia.error) throw asistencia.error
  if (conteo.error) throw conteo.error

  const listaProyectos = proyectos.data ?? []
  const listaAsistencia = asistencia.data ?? []

  const personalPorProyecto: Record<string, number> = {}
  for (const fila of conteo.data ?? []) {
    personalPorProyecto[fila.proyecto_id] = fila.activos
  }

  const empleadosActivos = Object.values(personalPorProyecto).reduce(
    (total, cantidad) => total + cantidad,
    0,
  )

  return {
    proyectos: listaProyectos,
    empleadosActivos,
    asistenciasHoy: listaAsistencia.length,
    sinSalida: listaAsistencia.filter((registro) => !registro.hora_salida).length,
    personalPorProyecto,
  }
}
