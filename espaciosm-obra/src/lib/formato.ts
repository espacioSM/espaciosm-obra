import type { EstadoProyecto, PeriodoPago, Rol } from './tipos'

export const ZONA_HORARIA = 'America/Mexico_City'

const formatoFecha = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const formatoFechaCorta = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Fecha de hoy en la zona de la obra, formato YYYY-MM-DD. */
export function hoyISO(): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? ''
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}

/** Hora actual en la zona de la obra, formato HH:MM:SS para Postgres `time`. */
export function horaActual(): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '00'
  return `${valor('hour')}:${valor('minute')}:${valor('second')}`
}

/** Convierte YYYY-MM-DD en Date local, sin el corrimiento de zona de UTC. */
function fechaLocal(iso: string): Date {
  const [anio, mes, dia] = iso.split('-').map(Number)
  return new Date(anio, (mes ?? 1) - 1, dia ?? 1)
}

export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  return formatoFecha.format(fechaLocal(iso))
}

export function formatearFechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  return formatoFechaCorta.format(fechaLocal(iso))
}

/** 'HH:MM:SS' o 'HH:MM' -> 'HH:MM'. */
export function formatearHora(hora: string | null | undefined): string {
  if (!hora) return '—'
  return hora.slice(0, 5)
}

export function formatearMoneda(importe: number | null | undefined): string {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
  }).format(importe ?? 0)
}

/** Horas trabajadas entre dos horas `time`; null si falta alguna. */
export function horasTrabajadas(
  entrada: string | null,
  salida: string | null,
): number | null {
  if (!entrada || !salida) return null
  const [h1, m1] = entrada.split(':').map(Number)
  const [h2, m2] = salida.split(':').map(Number)
  const minutos = h2 * 60 + m2 - (h1 * 60 + m1)
  if (!Number.isFinite(minutos) || minutos <= 0) return null
  return Math.round((minutos / 60) * 100) / 100
}

export function formatearHoras(horas: number | null): string {
  if (horas === null) return '—'
  return `${horas.toFixed(2)} h`
}

export const tituloEstado: Record<EstadoProyecto, string> = {
  planeado: 'Planeado',
  en_ejecucion: 'En ejecución',
  pausado: 'Pausado',
  terminado: 'Terminado',
}

export const tituloPeriodo: Record<PeriodoPago, string> = {
  mensual: 'Mensual',
  quincenal: 'Quincenal',
  semanal: 'Semanal',
  diario: 'Diario',
  por_hora: 'Por hora',
}

export const tituloRol: Record<Rol, string> = {
  admin: 'Administración',
  permiso_medio: 'Permiso medio',
  residente: 'Residente',
}
