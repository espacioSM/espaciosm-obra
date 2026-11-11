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
  creado_en: string
  actualizado_en: string
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
      modulo_sistema: Modulo
      accion_sistema: Accion
    }
    CompositeTypes: Record<string, never>
  }
}
