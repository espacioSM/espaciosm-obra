import type { Modulo } from './lib/tipos'

export type ItemNavegacion = {
  ruta: string
  etiqueta: string
  modulo: Modulo
  /** Sprint en el que se implementa; ausente = ya disponible. */
  sprint?: number
  soloAdmin?: boolean
}

export type GrupoNavegacion = {
  titulo: string
  items: ItemNavegacion[]
}

export const NAVEGACION: GrupoNavegacion[] = [
  {
    titulo: 'Obra',
    items: [
      { ruta: '/', etiqueta: 'Resumen', modulo: 'proyectos' },
      { ruta: '/proyectos', etiqueta: 'Proyectos', modulo: 'proyectos' },
      { ruta: '/personal', etiqueta: 'Personal', modulo: 'personal' },
      { ruta: '/asistencia', etiqueta: 'Asistencia', modulo: 'asistencia' },
    ],
  },
  {
    titulo: 'Operación',
    items: [
      { ruta: '/materiales', etiqueta: 'Materiales', modulo: 'materiales' },
      { ruta: '/generadores', etiqueta: 'Generadores', modulo: 'generadores' },
      { ruta: '/estimaciones', etiqueta: 'Estimaciones', modulo: 'estimaciones' },
      {
        ruta: '/solicitudes',
        etiqueta: 'Solicitudes de recursos',
        modulo: 'solicitudes',
      },
      { ruta: '/presupuesto', etiqueta: 'Presupuesto', modulo: 'pagos' },
      { ruta: '/pagos', etiqueta: 'Pagos', modulo: 'pagos' },
    ],
  },
  {
    titulo: 'Registro',
    items: [
      { ruta: '/bitacora', etiqueta: 'Bitácora', modulo: 'bitacora' },
      { ruta: '/reportes', etiqueta: 'Reportes', modulo: 'reportes' },
    ],
  },
  {
    titulo: 'Administración',
    items: [
      {
        ruta: '/usuarios',
        etiqueta: 'Usuarios y roles',
        modulo: 'personal',
        soloAdmin: true,
      },
    ],
  },
]

export type ModuloPendiente = {
  titulo: string
  sprint: number
  detalle: string
  incluye: string[]
}

export const PENDIENTES: Record<string, ModuloPendiente> = {
  materiales: {
    titulo: 'Materiales',
    sprint: 2,
    detalle:
      'Control de entradas, salidas e inventario por obra, con proveedor, factura y foto del comprobante.',
    incluye: [
      'Catálogo de materiales por proyecto',
      'Entradas con foto de ticket o factura',
      'Salidas por frente de trabajo',
      'Inventario calculado y alertas de mínimo',
    ],
  },
  generadores: {
    titulo: 'Generadores de obra',
    sprint: 3,
    detalle:
      'Tabla de conceptos con cantidades y precios unitarios para medir el avance físico y su valor.',
    incluye: [
      'Conceptos por proyecto y frente',
      'Cantidades contratadas, ejecutadas y pendientes',
      'Importes y totales por generador',
      'Base para las estimaciones',
    ],
  },
  estimaciones: {
    titulo: 'Estimaciones',
    sprint: 3,
    detalle:
      'Corte de avance por periodo, con importes, retenciones y seguimiento de autorización.',
    incluye: [
      'Estimaciones por periodo y proyecto',
      'Cálculo a partir de los generadores',
      'Estados: borrador, enviada, autorizada, pagada',
      'Reporte de estimación en PDF',
    ],
  },
  solicitudes: {
    titulo: 'Solicitudes de recursos',
    sprint: 4,
    detalle:
      'El residente pide material, personal o equipo; el administrador autoriza y da seguimiento.',
    incluye: [
      'Solicitud desde el teléfono con foto',
      'Prioridad y fecha requerida',
      'Autorización con comentarios',
      'Historial por obra',
    ],
  },
  pagos: {
    titulo: 'Pagos',
    sprint: 4,
    detalle:
      'Registro de pagos a contratistas, proveedores y personal, ligado a estimaciones y comprobantes.',
    incluye: [
      'Pagos por beneficiario y concepto',
      'Ligados a estimaciones o compras',
      'Comprobantes en imagen o PDF',
      'Resumen financiero por obra',
    ],
  },
  bitacora: {
    titulo: 'Bitácora de obra',
    sprint: 5,
    detalle:
      'Registro diario de lo ocurrido en la obra: notas, visitas, incidencias y fotografías.',
    incluye: [
      'Entradas diarias por residente',
      'Fotos con fecha y ubicación',
      'Comentarios de dirección',
      'Exportación a PDF',
    ],
  },
  reportes: {
    titulo: 'Reportes',
    sprint: 5,
    detalle:
      'Reporte de status en PDF para dirección y cliente, generado desde el navegador.',
    incluye: [
      'Avance físico y financiero',
      'Fotos y bitácora del periodo',
      'Pendientes y acuerdos',
      'Descarga e impresión desde el teléfono',
    ],
  },
}
