import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../sesion/SesionProvider'
import { Aviso } from '../componentes/Aviso'
import { Insignia } from '../componentes/Insignias'
import { mensajeDeError } from '../lib/errores'
import { tituloRol } from '../lib/formato'

export function Cuenta() {
  const { perfil } = useSesion()
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  if (!perfil) return null

  async function cambiarPassword(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setError(null)
    setExito(null)

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmacion) {
      setError('Las dos contraseñas no coinciden.')
      return
    }

    setEnviando(true)
    const { error: fallo } = await supabase.auth.updateUser({ password })
    setEnviando(false)

    if (fallo) {
      setError(mensajeDeError(fallo))
      return
    }

    setPassword('')
    setConfirmacion('')
    setExito('Contraseña actualizada. Úsala en tu próximo inicio de sesión.')
  }

  async function cerrarOtrasSesiones() {
    setError(null)
    setExito(null)
    setEnviando(true)

    const { error: fallo } = await supabase.auth.signOut({ scope: 'others' })
    setEnviando(false)

    if (fallo) {
      setError(mensajeDeError(fallo))
      return
    }

    setExito('Se cerraron las sesiones abiertas en otros dispositivos.')
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Mi cuenta</h1>
          <p className="subtitulo">
            Datos de acceso y contraseña. El correo y el rol los administra la
            administración; aquí solo puedes cambiar tu contraseña.
          </p>
        </div>
      </div>

      <section className="tarjeta tarjeta--plana">
        <div className="datos-cuenta">
          <div className="dato">
            <span className="meta-etiqueta">Correo</span>
            <span className="dato__valor">{perfil.email}</span>
          </div>
          <div className="dato">
            <span className="meta-etiqueta">Rol</span>
            <span className="dato__valor">{tituloRol[perfil.rol]}</span>
          </div>
          <div className="dato">
            <span className="meta-etiqueta">Estado</span>
            <span className="dato__valor">
              {perfil.activo ? (
                <Insignia tono="en_ejecucion">Activa</Insignia>
              ) : (
                <Insignia tono="alerta">Inactiva</Insignia>
              )}
            </span>
          </div>
        </div>
      </section>

      <section className="tarjeta">
        <div className="seccion__cabecera">
          <h2 className="seccion__titulo">Cambiar contraseña</h2>
        </div>

        <form className="formulario" onSubmit={(evento) => void cambiarPassword(evento)}>
          <div className="campo">
            <label className="campo__etiqueta" htmlFor="cuenta-password">
              Contraseña nueva
            </label>
            <input
              id="cuenta-password"
              className="campo__control"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(evento) => setPassword(evento.target.value)}
            />
            <span className="campo__ayuda">Mínimo 8 caracteres.</span>
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor="cuenta-confirmacion">
              Repetir contraseña
            </label>
            <input
              id="cuenta-confirmacion"
              className="campo__control"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmacion}
              onChange={(evento) => setConfirmacion(evento.target.value)}
            />
          </div>

          {error ? (
            <div className="campo--ancho">
              <Aviso tipo="error">{error}</Aviso>
            </div>
          ) : null}

          {exito ? (
            <div className="campo--ancho">
              <Aviso tipo="exito">{exito}</Aviso>
            </div>
          ) : null}

          <div className="acciones campo--ancho">
            <button type="submit" className="boton boton--primario" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
            <button
              type="button"
              className="boton"
              disabled={enviando}
              onClick={() => void cerrarOtrasSesiones()}
            >
              Cerrar sesión en otros dispositivos
            </button>
          </div>
        </form>
      </section>

      <Aviso tipo="info">
        Para la cuenta de administración conviene activar la verificación en dos
        pasos (TOTP) en Supabase Auth. La interfaz para enrolarla todavía no
        forma parte de este sprint; está anotada como pendiente.
      </Aviso>
    </div>
  )
}
