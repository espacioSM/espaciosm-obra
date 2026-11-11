import { useState } from 'react'
import { actualizarPerfil, listarPerfiles } from '../datos/consultas'
import { Aviso } from '../componentes/Aviso'
import { Cargando } from '../componentes/Estados'
import { Insignia } from '../componentes/Insignias'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import { mensajeDeError } from '../lib/errores'
import { formatearFecha, tituloRol } from '../lib/formato'
import type { Perfil, Rol } from '../lib/tipos'

const ROLES: Rol[] = ['admin', 'permiso_medio', 'residente']

export function Usuarios() {
  const { perfil: propio } = useSesion()
  const esAdmin = propio?.rol === 'admin'

  const { datos, cargando, error, recargar } = useDatos(async () => {
    if (!esAdmin) return []
    return listarPerfiles()
  }, [esAdmin])

  const [procesando, setProcesando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null)

  const personas = datos ?? []

  async function cambiarRol(persona: Perfil, rol: Rol) {
    if (persona.id === propio?.id) {
      setAviso({ tipo: 'error', texto: 'No puedes cambiar tu propio rol. Pide a otro administrador que lo haga.' })
      return
    }

    setProcesando(persona.id)
    setAviso(null)
    try {
      await actualizarPerfil(persona.id, { rol })
      setAviso({ tipo: 'exito', texto: `Rol de ${persona.nombre ?? persona.email} actualizado a ${tituloRol[rol]}.` })
      recargar()
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setProcesando(null)
    }
  }

  async function alternarAcceso(persona: Perfil) {
    if (persona.id === propio?.id) {
      setAviso({ tipo: 'error', texto: 'No puedes deshabilitar tu propia cuenta.' })
      return
    }

    if (
      persona.activo &&
      !window.confirm(
        `¿Deshabilitar el acceso de ${persona.nombre ?? persona.email}? Conserva su historial y puede reactivarse después.`,
      )
    ) {
      return
    }

    setProcesando(persona.id)
    setAviso(null)
    try {
      await actualizarPerfil(persona.id, { activo: !persona.activo })
      setAviso({
        tipo: 'exito',
        texto: `${persona.nombre ?? persona.email} quedó ${persona.activo ? 'deshabilitado' : 'habilitado'}.`,
      })
      recargar()
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setProcesando(null)
    }
  }

  if (!esAdmin) {
    return (
      <div className="pagina">
        <h1 className="titulo">Usuarios y roles</h1>
        <Aviso tipo="error">
          Esta sección es exclusiva del rol Administración. Si necesitas un cambio de rol o de
          acceso, pídelo a un administrador.
        </Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Usuarios y roles</h1>
          <p className="subtitulo">
            Aquí se asigna el rol y se habilita o deshabilita el acceso. Las cuentas y las
            contraseñas se crean en Supabase Auth, no en esta pantalla.
          </p>
        </div>
      </div>

      {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}
      {error ? (
        <Aviso tipo="error">
          {error}{' '}
          <button type="button" className="boton boton--tenue" onClick={recargar}>
            Reintentar
          </button>
        </Aviso>
      ) : null}

      <section className="tarjeta tarjeta--plana">
        <div className="seccion__cabecera">
          <h2 className="seccion__titulo">Cómo se crea una cuenta</h2>
        </div>
        <ol className="lista-numerada">
          <li>En Supabase, abre Authentication &gt; Users y crea el usuario con correo y contraseña.</li>
          <li>Espera unos segundos: el trigger crea su perfil con rol Residente.</li>
          <li>Aquí ajusta el rol y, en Proyectos, asígnalo al equipo de su obra.</li>
          <li>Comparte el correo y la contraseña por un canal privado; pide que la cambie en Mi cuenta al entrar.</li>
        </ol>
      </section>

      {cargando && !datos ? (
        <Cargando />
      ) : (
        <div className="tabla-marco">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Persona</th>
                <th scope="col">Rol</th>
                <th scope="col">Acceso</th>
                <th scope="col">Alta</th>
                <th scope="col" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {personas.map((persona) => {
                const esPropio = persona.id === propio?.id
                return (
                  <tr key={persona.id}>
                    <td>
                      <span className="celda-principal">
                        {persona.nombre ?? 'Sin nombre'}
                        {esPropio ? ' · tu cuenta' : ''}
                      </span>
                      <span className="celda-nota">{persona.email}</span>
                    </td>
                    <td>
                      <select
                        className="campo__control"
                        aria-label={`Rol de ${persona.nombre ?? persona.email}`}
                        value={persona.rol}
                        disabled={esPropio || procesando === persona.id}
                        onChange={(evento) => void cambiarRol(persona, evento.target.value as Rol)}
                      >
                        {ROLES.map((rol) => (
                          <option key={rol} value={rol}>
                            {tituloRol[rol]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {persona.activo ? (
                        <Insignia tono="en_ejecucion">Habilitado</Insignia>
                      ) : (
                        <Insignia tono="alerta">Deshabilitado</Insignia>
                      )}
                    </td>
                    <td>{formatearFecha(persona.creado_en.slice(0, 10))}</td>
                    <td>
                      <div className="tabla__acciones">
                        <button
                          type="button"
                          className={persona.activo ? 'boton boton--peligro' : 'boton'}
                          disabled={esPropio || procesando === persona.id}
                          onClick={() => void alternarAcceso(persona)}
                        >
                          {persona.activo ? 'Deshabilitar' : 'Habilitar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Aviso tipo="info">
        Los permisos finos de cada rol se definen en la tabla <code>rol_permisos</code> (rol,
        módulo y acción). Cambiarla por SQL modifica el comportamiento de toda la aplicación sin
        recompilar. El rol Administración siempre tiene todo permitido.
      </Aviso>
    </div>
  )
}
