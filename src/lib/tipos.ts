// Tipos del dominio y del esquema de Supabase.
// Mantener sincronizado con supabase/migrations/0001_esquema_sprint1.sql.
// Si más adelante usas `supabase gen types typescript`, reemplaza este archivo.

export type Rol = 'admin' | 'permiso_medio' | 'residente'

export type EstadoProyecto = 'planeado' | 'en_ejecucion' | 'pausado' | 'terminado'

export type PeriodoPago = 'mensual' | 'quincenal' | 'semanal' | 'diario' | 'por_hora'

export type Modulo =
  | 'proyectos'
  | 'personal'
  | 'asistencia'
  | 'materiales'
  | 'generadores'
  | 'estimaciones'
  | 'solicitudes'
  | 'pagos'
  | 'bitacora'
  | 'reportes'

export type Accion = 'ver' | 'crear' | 'editar' | 'aprobar' | 'eliminar'

export type Permisos = Partial<Record<Modulo, Partial<Record<Accion, boolean>>>>

export type Perfil = {
  id: string
  email: string
  nombre: string | null
  rol: Rol
  activo: boolean
  creado_en: string
  actualizado_en: string
}

export type Proyecto = {
  id: string
  nombre: string
  ubicacion: string | null
  fecha_inicio: string
  fecha_fin: string | null
  estado: EstadoProyecto
  creado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type ProyectoMiembro = {
  proyecto_id: string
  usuario_id: string
  creado_en: string
}

export type Empleado = {
  id: string
  proyecto_id: string
  nombre: string
  puesto: string | null
  sueldo: number
  periodo_pago: PeriodoPago
  fecha_ingreso: string
  fecha_baja: string | null
  activo: boolean
  creado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type AsistenciaResidente = {
  id: string
  usuario_id: string
  proyecto_id: string
  fecha: string
  hora_entrada: string | null
  hora_salida: string | null
  registrado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type ResidenteEnObra = {
  usuario_id: string
  nombre: string | null
  email: string
  proyecto_id: string
  proyecto_nombre: string
  hora_entrada: string | null
  hora_salida: string | null
}

export type TipoMovimientoMaterial = 'entrada' | 'salida'

export type Material = {
  id: string
  proyecto_id: string
  catalogo_id: string | null
  nombre: string
  especificacion: string | null
  presentacion: string | null
  unidad: string
  costo_unitario: number
  stock_minimo: number
  ultimo_precio: number | null
  ultimo_precio_en: string | null
  activo: boolean
  creado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type MaterialCatalogo = {
  codigo: string
  categoria: string
  nombre: string
  especificacion: string | null
  unidad: string
  presentacion: string | null
  precio_referencia: number | null
  ultimo_precio: number | null
  ultimo_precio_en: string | null
  url: string | null
  activo: boolean
  origen: string
}

export type MaterialMovimiento = {
  id: string
  material_id: string
  proyecto_id: string
  tipo: TipoMovimientoMaterial
  fecha: string
  cantidad: number
  costo_unitario: number
  proveedor: string | null
  descripcion: string | null
  nota: string | null
  es_baja: boolean
  baja_id: string | null
  registrado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type Generador = {
  id: string
  proyecto_id: string
  clave: string | null
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  activo: boolean
  creado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type GeneradorAvance = {
  id: string
  generador_id: string
  proyecto_id: string
  fecha: string
  cantidad: number
  nivel: string | null
  eje: string | null
  tramo: string | null
  frente: string | null
  largo: number | null
  ancho: number | null
  alto: number | null
  piezas: number | null
  estado: EstadoAvanceGenerador
  validado_por: string | null
  validado_en: string | null
  observaciones: string | null
  respuesta_residente: string | null
  foto_path: string | null
  foto_paths: string[]
  nota: string | null
  registrado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type EstadoAvanceGenerador = 'borrador' | 'enviado' | 'validado' | 'rechazado'

export type EstadoEstimacion = 'borrador' | 'enviada' | 'autorizada' | 'pagada'

export type Estimacion = {
  id: string
  proyecto_id: string
  numero: string
  fecha_inicio: string
  fecha_fin: string
  retencion_porcentaje: number
  estado: EstadoEstimacion
  notas: string | null
  solicitado_por: string | null
  creado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type EstimacionPartida = {
  id: string
  estimacion_id: string
  generador_id: string
  clave: string | null
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  importe: number
  creado_en: string
}

export type PartidaDisponible = {
  generador_id: string
  clave: string | null
  descripcion: string
  unidad: string
  cantidad: number
  precio_unitario: number
  importe: number
  fecha_min?: string | null
  fecha_max?: string | null
}

export type TipoSolicitud = 'material' | 'personal' | 'equipo' | 'otro'
export type PrioridadSolicitud = 'baja' | 'media' | 'alta'
export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada' | 'atendida'

export type EstadoBajaMaterial = 'pendiente' | 'aprobada' | 'rechazada'

export type TipoPago = 'personal' | 'proveedor' | 'contratista' | 'otro'
export type MetodoPago = 'efectivo' | 'transferencia' | 'cheque' | 'otro'

export type TipoCobro = 'anticipo' | 'estimacion' | 'liquidacion' | 'otro'

export type Presupuesto = {
  proyecto_id: string
  monto_contrato: number
  anticipo_porcentaje: number
  notas: string | null
  actualizado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type CobroCliente = {
  id: string
  proyecto_id: string
  estimacion_id: string | null
  tipo: TipoCobro
  monto: number
  fecha: string
  referencia: string | null
  nota: string | null
  registrado_por: string | null
  creado_en: string
}

export type Pago = {
  id: string
  proyecto_id: string
  estimacion_id: string | null
  tipo: TipoPago
  beneficiario: string
  concepto: string
  monto: number
  fecha: string
  metodo: MetodoPago
  referencia: string | null
  nota: string | null
  registrado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type BitacoraEntrada = {
  id: string
  proyecto_id: string
  fecha: string
  titulo: string
  contenido: string
  foto_paths: string[]
  registrado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type ComentarioBitacora = {
  id: string
  entrada_id: string
  comentario: string
  autor_id: string
  autor_nombre: string | null
  autor_email: string
  creado_en: string
}

export type BajaMaterial = {
  id: string
  material_id: string
  material_nombre: string
  proyecto_id: string
  solicitado_por: string
  solicitante_nombre: string | null
  solicitante_email: string
  motivo: string | null
  cantidad: number | null
  estado: EstadoBajaMaterial
  respuesta: string | null
  creado_en: string
  respondido_en: string | null
}

export type SolicitudRecurso = {
  id: string
  proyecto_id: string
  solicitado_por: string
  solicitante_nombre: string | null
  solicitante_email: string
  tipo: TipoSolicitud
  descripcion: string
  cantidad: number | null
  unidad: string | null
  prioridad: PrioridadSolicitud
  fecha_requerida: string | null
  notas: string | null
  estado: EstadoSolicitud
  respuesta: string | null
  creado_en: string
  respondido_en: string | null
}

export type Asistencia = {
  id: string
  empleado_id: string
  proyecto_id: string
  fecha: string
  hora_entrada: string | null
  hora_salida: string | null
  registrado_por: string | null
  creado_en: string
  actualizado_en: string
}

export type RolPermiso = {
  rol: Rol
  modulo: Modulo
  accion: Accion
  permitido: boolean
}

/** Personal visible para pasar lista: sin sueldo ni datos laborales. */
export type DirectorioEmpleado = {
  id: string
  nombre: string
  puesto: string | null
  activo: boolean
}

/** Conteo de personal activo por obra. */
export type ConteoPersonal = {
  proyecto_id: string
  activos: number
}

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '13'
  }
  public: {
    Tables: {
      perfiles: {
        Row: Perfil
        Insert: {
          id: string
          email: string
          nombre?: string | null
          rol?: Rol
          activo?: boolean
        }
        Update: {
          email?: string
          nombre?: string | null
          rol?: Rol
          activo?: boolean
        }
        Relationships: []
      }
      proyectos: {
        Row: Proyecto
        Insert: {
          id?: string
          nombre: string
          ubicacion?: string | null
          fecha_inicio?: string
          fecha_fin?: string | null
          estado?: EstadoProyecto
          creado_por?: string | null
        }
        Update: {
          nombre?: string
          ubicacion?: string | null
          fecha_inicio?: string
          fecha_fin?: string | null
          estado?: EstadoProyecto
        }
        Relationships: []
      }
      proyecto_miembros: {
        Row: ProyectoMiembro
        Insert: {
          proyecto_id: string
          usuario_id: string
        }
        Update: {
          proyecto_id?: string
          usuario_id?: string
        }
        Relationships: []
      }
      empleados: {
        Row: Empleado
        Insert: {
          id?: string
          proyecto_id: string
          nombre: string
          puesto?: string | null
          sueldo?: number
          periodo_pago?: PeriodoPago
          fecha_ingreso?: string
          fecha_baja?: string | null
          activo?: boolean
          creado_por?: string | null
        }
        Update: {
          proyecto_id?: string
          nombre?: string
          puesto?: string | null
          sueldo?: number
          periodo_pago?: PeriodoPago
          fecha_ingreso?: string
          fecha_baja?: string | null
          activo?: boolean
          creado_por?: string | null
        }
        Relationships: []
      }
      asistencia: {
        Row: Asistencia
        Insert: {
          id?: string
          empleado_id: string
          proyecto_id: string
          fecha?: string
          hora_entrada?: string | null
          hora_salida?: string | null
          registrado_por?: string | null
        }
        Update: {
          hora_entrada?: string | null
          hora_salida?: string | null
          fecha?: string
          registrado_por?: string | null
        }
        Relationships: []
      }
      asistencia_residentes: {
        Row: AsistenciaResidente
        Insert: {
          id?: string
          usuario_id: string
          proyecto_id: string
          fecha?: string
          hora_entrada?: string | null
          hora_salida?: string | null
          registrado_por?: string | null
        }
        Update: {
          hora_entrada?: string | null
          hora_salida?: string | null
          fecha?: string
          registrado_por?: string | null
        }
        Relationships: []
      }
      materiales: {
        Row: Material
        Insert: {
          id?: string
          proyecto_id: string
          catalogo_id?: string | null
          nombre: string
          especificacion?: string | null
          presentacion?: string | null
          unidad?: string
          costo_unitario?: number
          stock_minimo?: number
          ultimo_precio?: number | null
          ultimo_precio_en?: string | null
          activo?: boolean
          creado_por?: string | null
        }
        Update: {
          catalogo_id?: string | null
          nombre?: string
          especificacion?: string | null
          presentacion?: string | null
          unidad?: string
          costo_unitario?: number
          stock_minimo?: number
          ultimo_precio?: number | null
          ultimo_precio_en?: string | null
          activo?: boolean
        }
        Relationships: []
      }
      material_movimientos: {
        Row: MaterialMovimiento
        Insert: {
          id?: string
          material_id: string
          proyecto_id?: string
          tipo: TipoMovimientoMaterial
          fecha?: string
          cantidad: number
          costo_unitario?: number
          proveedor?: string | null
          descripcion?: string | null
          nota?: string | null
          es_baja?: boolean
          baja_id?: string | null
          registrado_por?: string | null
        }
        Update: {
          tipo?: TipoMovimientoMaterial
          fecha?: string
          cantidad?: number
          costo_unitario?: number
          proveedor?: string | null
          descripcion?: string | null
          nota?: string | null
          es_baja?: boolean
          baja_id?: string | null
        }
        Relationships: []
      }
      catalogo_materiales: {
        Row: MaterialCatalogo
        Insert: {
          codigo: string
          categoria: string
          nombre: string
          especificacion?: string | null
          unidad: string
          presentacion?: string | null
          precio_referencia?: number | null
          ultimo_precio?: number | null
          ultimo_precio_en?: string | null
          url?: string | null
          activo?: boolean
          origen?: string
        }
        Update: {
          categoria?: string
          nombre?: string
          especificacion?: string | null
          unidad?: string
          presentacion?: string | null
          precio_referencia?: number | null
          ultimo_precio?: number | null
          ultimo_precio_en?: string | null
          url?: string | null
          activo?: boolean
          origen?: string
        }
        Relationships: []
      }
      generadores: {
        Row: Generador
        Insert: {
          id?: string
          proyecto_id: string
          clave?: string | null
          descripcion: string
          unidad?: string
          cantidad: number
          precio_unitario?: number
          activo?: boolean
          creado_por?: string | null
        }
        Update: {
          clave?: string | null
          descripcion?: string
          unidad?: string
          cantidad?: number
          precio_unitario?: number
          activo?: boolean
        }
        Relationships: []
      }
      generador_avances: {
        Row: GeneradorAvance
        Insert: {
          id?: string
          generador_id: string
          proyecto_id?: string
          fecha?: string
          cantidad: number
          nivel?: string | null
          eje?: string | null
          tramo?: string | null
          frente?: string | null
          largo?: number | null
          ancho?: number | null
          alto?: number | null
          piezas?: number | null
          estado?: EstadoAvanceGenerador
          observaciones?: string | null
          respuesta_residente?: string | null
          foto_path?: string | null
          foto_paths?: string[]
          nota?: string | null
          registrado_por?: string | null
        }
        Update: {
          fecha?: string
          cantidad?: number
          nivel?: string | null
          eje?: string | null
          tramo?: string | null
          frente?: string | null
          largo?: number | null
          ancho?: number | null
          alto?: number | null
          piezas?: number | null
          estado?: EstadoAvanceGenerador
          observaciones?: string | null
          respuesta_residente?: string | null
          foto_path?: string | null
          foto_paths?: string[]
          nota?: string | null
        }
        Relationships: []
      }
      estimaciones: {
        Row: Estimacion
        Insert: {
          id?: string
          proyecto_id: string
          numero: string
          fecha_inicio: string
          fecha_fin: string
          retencion_porcentaje?: number
          estado?: EstadoEstimacion
          notas?: string | null
          solicitado_por?: string | null
          creado_por?: string | null
        }
        Update: {
          numero?: string
          fecha_inicio?: string
          fecha_fin?: string
          retencion_porcentaje?: number
          estado?: EstadoEstimacion
          notas?: string | null
        }
        Relationships: []
      }
      estimacion_partidas: {
        Row: EstimacionPartida
        Insert: {
          id?: string
          estimacion_id: string
          generador_id: string
          clave?: string | null
          descripcion: string
          unidad: string
          cantidad: number
          precio_unitario: number
        }
        Update: {
          cantidad?: number
          precio_unitario?: number
        }
        Relationships: []
      }
      solicitudes_recursos: {
        Row: Omit<SolicitudRecurso, 'solicitante_nombre' | 'solicitante_email'>
        Insert: {
          id?: string
          proyecto_id: string
          solicitado_por?: string
          tipo?: TipoSolicitud
          descripcion: string
          cantidad?: number | null
          unidad?: string | null
          prioridad?: PrioridadSolicitud
          fecha_requerida?: string | null
          notas?: string | null
          estado?: EstadoSolicitud
          respuesta?: string | null
        }
        Update: {
          tipo?: TipoSolicitud
          descripcion?: string
          cantidad?: number | null
          unidad?: string | null
          prioridad?: PrioridadSolicitud
          fecha_requerida?: string | null
          notas?: string | null
          estado?: EstadoSolicitud
          respuesta?: string | null
        }
        Relationships: []
      }
      bajas_material: {
        Row: Omit<BajaMaterial, 'material_nombre' | 'solicitante_nombre' | 'solicitante_email'>
        Insert: {
          id?: string
          material_id: string
          proyecto_id: string
          solicitado_por?: string
          motivo?: string | null
          cantidad?: number | null
          estado?: EstadoBajaMaterial
          respuesta?: string | null
        }
        Update: {
          estado?: EstadoBajaMaterial
          respuesta?: string | null
        }
        Relationships: []
      }
      presupuestos: {
        Row: Presupuesto
        Insert: {
          proyecto_id: string
          monto_contrato?: number
          anticipo_porcentaje?: number
          notas?: string | null
          actualizado_por?: string | null
        }
        Update: {
          monto_contrato?: number
          anticipo_porcentaje?: number
          notas?: string | null
          actualizado_por?: string | null
        }
        Relationships: []
      }
      cobros_cliente: {
        Row: CobroCliente
        Insert: {
          id?: string
          proyecto_id: string
          estimacion_id?: string | null
          tipo: TipoCobro
          monto: number
          fecha?: string
          referencia?: string | null
          nota?: string | null
          registrado_por?: string | null
        }
        Update: Record<string, never>
        Relationships: []
      }
      pagos: {
        Row: Pago
        Insert: {
          id?: string
          proyecto_id: string
          estimacion_id?: string | null
          tipo?: TipoPago
          beneficiario: string
          concepto: string
          monto: number
          fecha?: string
          metodo?: MetodoPago
          referencia?: string | null
          nota?: string | null
          registrado_por?: string | null
        }
        Update: {
          estimacion_id?: string | null
          tipo?: TipoPago
          beneficiario?: string
          concepto?: string
          monto?: number
          fecha?: string
          metodo?: MetodoPago
          referencia?: string | null
          nota?: string | null
        }
        Relationships: []
      }
      bitacora: {
        Row: BitacoraEntrada
        Insert: {
          id?: string
          proyecto_id: string
          fecha?: string
          titulo: string
          contenido: string
          foto_paths?: string[]
          registrado_por?: string | null
        }
        Update: {
          fecha?: string
          titulo?: string
          contenido?: string
          foto_paths?: string[]
        }
        Relationships: []
      }
      bitacora_comentarios: {
        Row: Omit<ComentarioBitacora, 'autor_nombre' | 'autor_email'>
        Insert: {
          id?: string
          entrada_id: string
          comentario: string
          autor_id?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      rol_permisos: {
        Row: RolPermiso
        Insert: {
          rol: Rol
          modulo: Modulo
          accion: Accion
          permitido?: boolean
        }
        Update: {
          permitido?: boolean
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      mis_permisos: {
        Args: Record<PropertyKey, never>
        Returns: Permisos
      }
      mi_perfil: {
        Args: Record<PropertyKey, never>
        Returns: Perfil[]
      }
      empleados_de_proyecto: {
        Args: { p_proyecto_id: string }
        Returns: DirectorioEmpleado[]
      }
      conteo_personal_por_proyecto: {
        Args: Record<PropertyKey, never>
        Returns: ConteoPersonal[]
      }
      residentes_en_obra: {
        Args: { p_fecha: string }
        Returns: ResidenteEnObra[]
      }
      crear_estimacion: {
        Args: {
          p_proyecto_id: string
          p_numero: string
          p_fecha_inicio: string
          p_fecha_fin: string
          p_retencion: number
          p_notas: string | null
        }
        Returns: string
      }
      previsualizar_estimacion: {
        Args: {
          p_proyecto_id: string
          p_fecha_inicio: string
          p_fecha_fin: string
        }
        Returns: PartidaDisponible[]
      }
      crear_estimacion_seleccion: {
        Args: {
          p_proyecto_id: string
          p_numero: string
          p_fecha_inicio: string
          p_fecha_fin: string
          p_retencion: number
          p_notas: string | null
          p_generador_ids: string[]
        }
        Returns: string
      }
      previsualizar_solicitud_estimacion: {
        Args: {
          p_proyecto_id: string
          p_fecha_inicio: string
          p_fecha_fin: string
        }
        Returns: PartidaDisponible[]
      }
      solicitar_estimacion: {
        Args: {
          p_proyecto_id: string
          p_numero: string
          p_fecha_inicio: string
          p_fecha_fin: string
          p_retencion: number
          p_notas: string | null
          p_generador_ids: string[]
        }
        Returns: string
      }
      listar_solicitudes: {
        Args: { p_proyecto_id: string }
        Returns: SolicitudRecurso[]
      }
      responder_solicitud: {
        Args: {
          p_solicitud_id: string
          p_estado: EstadoSolicitud
          p_respuesta: string
        }
        Returns: undefined
      }
      solicitar_baja_material: {
        Args: { p_material_id: string; p_motivo: string; p_cantidad: number }
        Returns: string
      }
      listar_bajas_material: {
        Args: { p_proyecto_id: string }
        Returns: BajaMaterial[]
      }
      responder_baja_material: {
        Args: {
          p_baja_id: string
          p_estado: EstadoBajaMaterial
          p_respuesta: string
        }
        Returns: undefined
      }
      listar_comentarios_bitacora: {
        Args: { p_proyecto_id: string }
        Returns: ComentarioBitacora[]
      }
      rol_actual: {
        Args: Record<PropertyKey, never>
        Returns: Rol | null
      }
      es_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      puede: {
        Args: { p_modulo: Modulo; p_accion: Accion }
        Returns: boolean
      }
      tiene_acceso_proyecto: {
        Args: { p_proyecto_id: string }
        Returns: boolean
      }
    }
    Enums: {
      rol_usuario: Rol
      estado_proyecto: EstadoProyecto
      periodo_pago: PeriodoPago
      tipo_movimiento_material: TipoMovimientoMaterial
      estado_estimacion: EstadoEstimacion
      tipo_solicitud: TipoSolicitud
      prioridad_solicitud: PrioridadSolicitud
      estado_solicitud: EstadoSolicitud
      estado_baja_material: EstadoBajaMaterial
      estado_avance_generador: EstadoAvanceGenerador
      tipo_pago: TipoPago
      metodo_pago: MetodoPago
      modulo_sistema: Modulo
      accion_sistema: Accion
    }
    CompositeTypes: Record<string, never>
  }
}
