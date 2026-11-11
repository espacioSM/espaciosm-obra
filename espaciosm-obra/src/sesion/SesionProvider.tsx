import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { mensajeDeError } from '../lib/errores'
import type { Perfil, Permisos } from '../lib/tipos'

export type EstadoSesion =
  | 'cargando'
  | 'sin_sesion'
  | 'sin_perfil'
  | 'inactivo'
  | 'listo'
  | 'error'

type ValorSesion = {
  estado: EstadoSesion
  sesion: Session | null
  perfil: Perfil | null
  permisos: Permisos
  error: string | null
  iniciarSesion: (email: string, password: string) => Promise<string | null>
  cerrarSesion: () => Promise<void>
  recargar: () => Promise<void>
}

const ContextoSesion = createContext<ValorSesion | null>(null)

export function SesionProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<Session | null>(null)
  const [inicializado, setInicializado] = useState(false)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [permisos, setPermisos] = useState<Permisos>({})
  const [estado, setEstado] = useState<EstadoSesion>('cargando')
  const [error, setError] = useState<string | null>(null)

  const usuarioId = sesion?.user.id ?? null

  // 1. Mantener la sesión sincronizada con Supabase Auth.
  useEffect(() => {
    let vigente = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!vigente) return
        setSesion(data.session)
        setInicializado(true)
      })
      .catch(() => {
        if (vigente) setInicializado(true)
      })

    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      if (!vigente) return
      setSesion(nuevaSesion)
      setInicializado(true)
    })

    return () => {
      vigente = false
      suscripcion.subscription.unsubscribe()
    }
  }, [])

  // 2. Cargar perfil y matriz de permisos cuando cambia el usuario.
  const cargarPerfil = useCallback(async () => {
    setEstado('cargando')
    setError(null)

    const [perfilRespuesta, permisosRespuesta] = await Promise.all([
      supabase.rpc('mi_perfil'),
      supabase.rpc('mis_permisos'),
    ])

    if (perfilRespuesta.error) {
      setError(mensajeDeError(perfilRespuesta.error))
      setEstado('error')
      return
    }

    const propio = perfilRespuesta.data?.[0] ?? null

    if (!propio) {
      setPerfil(null)
      setPermisos({})
      setEstado('sin_perfil')
      return
    }

    setPerfil(propio)

    if (!propio.activo) {
      setPermisos({})
      setEstado('inactivo')
      return
    }

    if (permisosRespuesta.error) {
      setError(mensajeDeError(permisosRespuesta.error))
      setEstado('error')
      return
    }

    setPermisos(permisosRespuesta.data ?? {})
    setEstado('listo')
  }, [])

  useEffect(() => {
    if (!inicializado) return

    if (!usuarioId) {
      setPerfil(null)
      setPermisos({})
      setError(null)
      setEstado('sin_sesion')
      return
    }

    void cargarPerfil()
  }, [inicializado, usuarioId, cargarPerfil])

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    const { error: fallo } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (fallo) return mensajeDeError(fallo)
    return null
  }, [])

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut()
    setPerfil(null)
    setPermisos({})
    setError(null)
    setEstado('sin_sesion')
  }, [])

  const recargar = useCallback(async () => {
    if (!usuarioId) return
    await cargarPerfil()
  }, [cargarPerfil, usuarioId])

  const valor = useMemo<ValorSesion>(
    () => ({
      estado,
      sesion,
      perfil,
      permisos,
      error,
      iniciarSesion,
      cerrarSesion,
      recargar,
    }),
    [estado, sesion, perfil, permisos, error, iniciarSesion, cerrarSesion, recargar],
  )

  return <ContextoSesion.Provider value={valor}>{children}</ContextoSesion.Provider>
}

export function useSesion(): ValorSesion {
  const contexto = useContext(ContextoSesion)
  if (!contexto) {
    throw new Error('useSesion debe usarse dentro de <SesionProvider>.')
  }
  return contexto
}
