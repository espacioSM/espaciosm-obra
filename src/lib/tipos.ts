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
  nombre: string
  unidad: string
  costo_unitario: number
  stock_minimo: number
  activo: boolean
  creado_por: string | null
  creado_en: string
  actualizado_en: string
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
  nota: string | null
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
  nota: string | null
  registrado_por: string | null
  creado_en: string
  actualizado_en: string
}

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

export type TipoSolicitud = 'material' | 'personal' | 'equipo' | 'otro'
export type PrioridadSolicitud = 'baja' | 'media' | 'alta'
export type EstadoSolicitud = 'pendiente' | 'aprobada' | 'rechazada' | 'atendida'

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
          nombre: string
          unidad?: string
          costo_unitario?: number
          stock_minimo?: number
          activo?: boolean
          creado_por?: string | null
        }
        Update: {
          nombre?: string
          unidad?: string
          costo_unitario?: number
          stock_minimo?: number
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
          nota?: string | null
          registrado_por?: string | null
        }
        Update: {
          tipo?: TipoMovimientoMaterial
          fecha?: string
          cantidad?: number
          costo_unitario?: number
          proveedor?: string | null
          nota?: string | null
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
          nota?: string | null
          registrado_por?: string | null
        }
        Update: {
          fecha?: string
          cantidad?: number
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
      modulo_sistema: Modulo
      accion_sistema: Accion
    }
    CompositeTypes: Record<string, never>
  }
}
