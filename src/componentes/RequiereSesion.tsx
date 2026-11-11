import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSesion } from '../sesion/SesionProvider'
import { PantallaBloqueo, PantallaCargando } from './Pantallas'

/**
 * Deja pasar solo a usuarios con sesión, perfil y cuenta activa.
 * Mientras se verifica la sesión no redirige, para no expulsar a quien
 * recarga la página en una ruta interna.
 */
export function RequiereSesion() {
  const { estado, sesion, perfil, error } = useSesion()
  const ubicacion = useLocation()

  if (estado === 'cargando') return <PantallaCargando />

  if (!sesion) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ desde: `${ubicacion.pathname}${ubicacion.search}` }}
      />
    )
  }

  if (estado === 'sin_perfil') {
    return (
      <PantallaBloqueo
        titulo="Tu cuenta no tiene perfil"
        mensaje="La cuenta existe en Supabase, pero no tiene registro de perfil en la base de la obra."
        detalle="Pide al administrador que revise la tabla perfiles; normalmente se resuelve ejecutando la reparación de 0003_ajustes_post_instalacion.sql."
      />
    )
  }

  if (estado === 'inactivo') {
    return (
      <PantallaBloqueo
        titulo="Cuenta deshabilitada"
        mensaje="Tu cuenta está creada, pero el administrador la marcó como inactiva."
        detalle="Si crees que es un error, pide que la reactiven en Usuarios y roles."
      />
    )
  }

  if (estado === 'error') {
    return (
      <PantallaBloqueo
        titulo="No se pudo cargar tu perfil"
        mensaje={error ?? 'Ocurrió un error al consultar tus permisos.'}
        detalle="Revisa la conexión e intenta de nuevo. Si persiste, el administrador debe revisar las políticas RLS."
      />
    )
  }

  if (estado !== 'listo' || !perfil) return <PantallaCargando />

  return <Outlet />
}
