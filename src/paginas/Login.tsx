import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useSesion } from '../sesion/SesionProvider'
import { Aviso } from '../componentes/Aviso'

type EstadoRuta = { desde?: string } | null

export function Login() {
  const { sesion, estado, iniciarSesion } = useSesion()
  const ubicacion = useLocation()
  const destino = (ubicacion.state as EstadoRuta)?.desde ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (sesion && estado !== 'cargando' && estado !== 'sin_sesion') {
    return <Navigate to={destino} replace />
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setEnviando(true)
    setError(null)

    const mensaje = await iniciarSesion(email, password)
    setEnviando(false)

    if (mensaje) setError(mensaje)
  }

  return (
    <div className="acceso">
      <section className="acceso__marca">
        <img
          className="acceso__logo-img"
          src={`${import.meta.env.BASE_URL}logo-espaciosm.png`}
          alt="espacioSM"
        />
        <div>
          <p className="acceso__titular">Control de avance de obra.</p>
        </div>
        <p className="acceso__pie">
          Personal, asistencia, materiales, generadores, estimaciones y pagos en un solo
          registro. Uso interno del equipo de obra.
        </p>
      </section>

      <section className="acceso__panel">
        <div className="acceso__caja">
          <div className="acceso__encabezado">
            <h1>Entrar</h1>
            <p>Acceso restringido. Usa la cuenta que te asignó la administración.</p>
          </div>

          <form className="acceso__formulario" onSubmit={(evento) => void enviar(evento)}>
            <div className="campo">
              <label className="campo__etiqueta" htmlFor="email">
                Correo
              </label>
              <input
                id="email"
                className="campo__control"
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                required
                autoFocus
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
              />
            </div>

            <div className="campo">
              <label className="campo__etiqueta" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                className="campo__control"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(evento) => setPassword(evento.target.value)}
              />
            </div>

            {error ? <Aviso tipo="error">{error}</Aviso> : null}

            <button
              type="submit"
              className="boton boton--primario"
              disabled={enviando || email.trim() === '' || password === ''}
            >
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <p className="acceso__nota">
            No hay registro público. Las cuentas las crea la administración en Supabase y se
            habilitan en Usuarios y roles. Si olvidaste tu contraseña, pide que la restablezcan.
          </p>
        </div>
      </section>
    </div>
  )
}
