import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  actualizarProyecto,
  agregarMiembro,
  crearProyecto,
  listarEmpleados,
  listarMiembros,
  listarPerfiles,
  listarProyectos,
  quitarMiembro,
} from '../datos/consultas'
import type { DatosProyecto } from '../datos/consultas'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'
import { InsigniaEstado } from '../componentes/Insignias'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import { mensajeDeError } from '../lib/errores'
import { formatearFechaCorta, hoyISO, tituloEstado } from '../lib/formato'
import { puede } from '../lib/permisos'
import type {
  EstadoProyecto,
  Perfil,
  Proyecto,
  ProyectoMiembro,
} from '../lib/tipos'

const ESTADOS: EstadoProyecto[] = ['planeado', 'en_ejecucion', 'pausado', 'terminado']

export function Proyectos() {
  const { perfil, permisos } = useSesion()
  const esAdmin = perfil?.rol === 'admin'
  const puedeCrear = puede(permisos, 'proyectos', 'crear')
  const puedeEditar = puede(permisos, 'proyectos', 'editar')

  const { datos, cargando, error, recargar } = useDatos(async () => {
    const [proyectos, empleados, miembros] = await Promise.all([
      listarProyectos(),
      listarEmpleados(),
      listarMiembros(),
    ])
    const perfiles = esAdmin ? await listarPerfiles() : []
    return { proyectos, empleados, miembros, perfiles }
  }, [esAdmin])

  const [formulario, setFormulario] = useState<{ proyecto: Proyecto | null } | null>(null)
  const [equipoId, setEquipoId] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const proyectos = datos?.proyectos ?? []
  const empleados = datos?.empleados ?? []
  const miembros = datos?.miembros ?? []
  const perfiles = datos?.perfiles ?? []
  const proyectoDeEquipo = proyectos.find((proyecto) => proyecto.id === equipoId)

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Proyectos</h1>
          <p className="subtitulo">
            Obras dadas de alta. El equipo asignado a cada obra es lo que determina qué
            información puede ver cada residente.
          </p>
        </div>
        {puedeCrear ? (
          <div className="acciones">
            <button
              type="button"
              className="boton boton--primario"
              onClick={() => {
                setAviso(null)
                setFormulario({ proyecto: null })
              }}
            >
              Nueva obra
            </button>
          </div>
        ) : null}
      </div>

      {aviso ? <Aviso tipo="exito">{aviso}</Aviso> : null}
      {error ? (
        <Aviso tipo="error">
          {error}{' '}
          <button type="button" className="boton boton--tenue" onClick={recargar}>
            Reintentar
          </button>
        </Aviso>
      ) : null}

      {formulario ? (
        <FormularioProyecto
          key={formulario.proyecto?.id ?? 'nueva'}
          proyecto={formulario.proyecto}
          onCancelar={() => setFormulario(null)}
          onGuardado={() => {
            setFormulario(null)
            setAviso('Obra guardada.')
            recargar()
          }}
        />
      ) : null}

      {cargando && !datos ? (
        <Cargando />
      ) : proyectos.length === 0 ? (
        <div className="tarjeta tarjeta--plana">
          <Vacio titulo="Todavía no hay obras">
            {puedeCrear
              ? 'Da de alta la primera obra con el botón Nueva obra. Después asigna a su equipo.'
              : 'Pide al administrador que te asigne a una obra.'}
          </Vacio>
        </div>
      ) : (
        <div className="tabla-marco">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Obra</th>
                <th scope="col">Periodo</th>
                <th scope="col">Estado</th>
                <th scope="col" className="tabla__num">
                  Personal
                </th>
                <th scope="col" className="tabla__num">
                  Equipo
                </th>
                <th scope="col" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {proyectos.map((proyecto) => {
                const personal = empleados.filter(
                  (empleado) => empleado.proyecto_id === proyecto.id && empleado.activo,
                ).length
                const equipo = miembros.filter(
                  (miembro) => miembro.proyecto_id === proyecto.id,
                ).length

                return (
                  <tr key={proyecto.id}>
                    <td>
                      <span className="celda-principal">{proyecto.nombre}</span>
                      <span className="celda-nota">
                        {proyecto.ubicacion ?? 'Sin ubicación registrada'}
                      </span>
                    </td>
                    <td>
                      {formatearFechaCorta(proyecto.fecha_inicio)} –{' '}
                      {proyecto.fecha_fin ? formatearFechaCorta(proyecto.fecha_fin) : 'abierta'}
                    </td>
                    <td>
                      <InsigniaEstado estado={proyecto.estado} />
                    </td>
                    <td className="tabla__num">{personal}</td>
                    <td className="tabla__num">{equipo}</td>
                    <td>
                      <div className="tabla__acciones">
                        {puedeEditar ? (
                          <button
                            type="button"
                            className="boton"
                            onClick={() => {
                              setAviso(null)
                              setFormulario({ proyecto })
                            }}
                          >
                            Editar
                          </button>
                        ) : null}
                        {esAdmin ? (
                          <button
                            type="button"
                            className="boton"
                            onClick={() => {
                              setAviso(null)
                              setEquipoId(equipoId === proyecto.id ? null : proyecto.id)
                            }}
                          >
                            {equipoId === proyecto.id ? 'Cerrar equipo' : 'Equipo'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {esAdmin && proyectoDeEquipo ? (
        <PanelEquipo
          proyecto={proyectoDeEquipo}
          miembros={miembros.filter((miembro) => miembro.proyecto_id === proyectoDeEquipo.id)}
          perfiles={perfiles}
          onCerrar={() => setEquipoId(null)}
          onCambio={() => {
            setAviso('Equipo actualizado.')
            recargar()
          }}
        />
      ) : null}
    </div>
  )
}

function FormularioProyecto({
  proyecto,
  onCancelar,
  onGuardado,
}: {
  proyecto: Proyecto | null
  onCancelar: () => void
  onGuardado: () => void
}) {
  const [nombre, setNombre] = useState(proyecto?.nombre ?? '')
  const [ubicacion, setUbicacion] = useState(proyecto?.ubicacion ?? '')
  const [fechaInicio, setFechaInicio] = useState(proyecto?.fecha_inicio ?? hoyISO())
  const [fechaFin, setFechaFin] = useState(proyecto?.fecha_fin ?? '')
  const [estado, setEstado] = useState<EstadoProyecto>(proyecto?.estado ?? 'planeado')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (nombre.trim() === '') {
      setError('El nombre de la obra es obligatorio.')
      return
    }
    if (fechaFin !== '' && fechaFin < fechaInicio) {
      setError('La fecha de fin no puede ser anterior a la fecha de inicio.')
      return
    }

    setEnviando(true)
    setError(null)

    const datos: DatosProyecto = {
      nombre: nombre.trim(),
      ubicacion: ubicacion.trim() === '' ? null : ubicacion.trim(),
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin === '' ? null : fechaFin,
      estado,
    }

    try {
      if (proyecto) {
        await actualizarProyecto(proyecto.id, datos)
      } else {
        await crearProyecto(datos)
      }
      onGuardado()
    } catch (fallo) {
      setError(mensajeDeError(fallo))
      setEnviando(false)
    }
  }

  return (
    <section className="tarjeta">
      <div className="seccion__cabecera">
        <h2 className="seccion__titulo">
          {proyecto ? 'Editar obra' : 'Nueva obra'}
        </h2>
      </div>

      <form className="formulario" onSubmit={(evento) => void guardar(evento)}>
        <div className="campo campo--ancho">
          <label className="campo__etiqueta" htmlFor="proyecto-nombre">
            Nombre de la obra
          </label>
          <input
            id="proyecto-nombre"
            className="campo__control"
            type="text"
            required
            maxLength={160}
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
            placeholder="Casa habitación Lomas"
          />
        </div>

        <div className="campo campo--ancho">
          <label className="campo__etiqueta" htmlFor="proyecto-ubicacion">
            Ubicación
          </label>
          <input
            id="proyecto-ubicacion"
            className="campo__control"
            type="text"
            maxLength={200}
            value={ubicacion}
            onChange={(evento) => setUbicacion(evento.target.value)}
            placeholder="Calle, colonia, ciudad"
          />
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="proyecto-inicio">
            Fecha de inicio
          </label>
          <input
            id="proyecto-inicio"
            className="campo__control"
            type="date"
            required
            value={fechaInicio}
            onChange={(evento) => setFechaInicio(evento.target.value)}
          />
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="proyecto-fin">
            Fecha de fin
          </label>
          <input
            id="proyecto-fin"
            className="campo__control"
            type="date"
            value={fechaFin}
            min={fechaInicio}
            onChange={(evento) => setFechaFin(evento.target.value)}
          />
          <span className="campo__ayuda">Déjala vacía si la obra sigue abierta.</span>
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="proyecto-estado">
            Estado
          </label>
          <select
            id="proyecto-estado"
            className="campo__control"
            value={estado}
            onChange={(evento) => setEstado(evento.target.value as EstadoProyecto)}
          >
            {ESTADOS.map((valor) => (
              <option key={valor} value={valor}>
                {tituloEstado[valor]}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <div className="campo--ancho">
            <Aviso tipo="error">{error}</Aviso>
          </div>
        ) : null}

        <div className="acciones campo--ancho">
          <button type="submit" className="boton boton--primario" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar obra'}
          </button>
          <button type="button" className="boton" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  )
}

function PanelEquipo({
  proyecto,
  miembros,
  perfiles,
  onCerrar,
  onCambio,
}: {
  proyecto: Proyecto
  miembros: ProyectoMiembro[]
  perfiles: Perfil[]
  onCerrar: () => void
  onCambio: () => void
}) {
  const [seleccion, setSeleccion] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const disponibles = perfiles.filter(
    (persona) =>
      persona.activo &&
      persona.rol !== 'admin' &&
      !miembros.some((miembro) => miembro.usuario_id === persona.id),
  )

  function perfilDe(usuarioId: string): Perfil | undefined {
    return perfiles.find((persona) => persona.id === usuarioId)
  }

  async function agregar() {
    if (seleccion === '') return
    setProcesando(true)
    setError(null)
    try {
      await agregarMiembro(proyecto.id, seleccion)
      setSeleccion('')
      onCambio()
    } catch (fallo) {
      setError(mensajeDeError(fallo))
    } finally {
      setProcesando(false)
    }
  }

  async function quitar(usuarioId: string) {
    const persona = perfilDe(usuarioId)
    const nombre = persona?.nombre ?? persona?.email ?? 'esta persona'
    if (!window.confirm(`¿Quitar a ${nombre} del equipo de ${proyecto.nombre}?`)) return

    setProcesando(true)
    setError(null)
    try {
      await quitarMiembro(proyecto.id, usuarioId)
      onCambio()
    } catch (fallo) {
      setError(mensajeDeError(fallo))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <section className="tarjeta" aria-labelledby="titulo-equipo">
      <div className="seccion__cabecera">
        <div>
          <h2 className="seccion__titulo" id="titulo-equipo">
            Equipo de {proyecto.nombre}
          </h2>
          <p className="seccion__nota">
            Solo las personas de esta lista pueden ver la obra, su personal y su asistencia.
          </p>
        </div>
        <button type="button" className="boton" onClick={onCerrar}>
          Cerrar
        </button>
      </div>

      {error ? <Aviso tipo="error">{error}</Aviso> : null}

      {miembros.length === 0 ? (
        <Vacio titulo="Sin equipo asignado">Agrega al menos a un residente.</Vacio>
      ) : (
        <ul className="lista-simple">
          {miembros.map((miembro) => {
            const persona = perfilDe(miembro.usuario_id)
            return (
              <li key={miembro.usuario_id}>
                <span>
                  <span className="celda-principal">
                    {persona?.nombre ?? 'Perfil no disponible'}
                  </span>
                  <span className="celda-nota">{persona?.email ?? miembro.usuario_id}</span>
                </span>
                <button
                  type="button"
                  className="boton boton--peligro"
                  disabled={procesando}
                  onClick={() => void quitar(miembro.usuario_id)}
                >
                  Quitar
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="filtros" style={{ marginTop: 20 }}>
        <div className="campo">
          <label className="campo__etiqueta" htmlFor="equipo-persona">
            Agregar al equipo
          </label>
          <select
            id="equipo-persona"
            className="campo__control"
            value={seleccion}
            onChange={(evento) => setSeleccion(evento.target.value)}
            disabled={procesando || disponibles.length === 0}
          >
            <option value="">
              {disponibles.length === 0 ? 'No hay personas disponibles' : 'Selecciona una persona'}
            </option>
            {disponibles.map((persona) => (
              <option key={persona.id} value={persona.id}>
                {persona.nombre ?? persona.email} · {persona.rol}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="boton boton--primario"
          disabled={seleccion === '' || procesando}
          onClick={() => void agregar()}
        >
          {procesando ? 'Guardando…' : 'Agregar'}
        </button>
      </div>

      <p className="campo__ayuda" style={{ marginTop: 12 }}>
        Las cuentas se crean en Supabase Auth, en Usuarios y roles se les da rol, y aquí se les
        asigna la obra. El administrador ve todas las obras sin necesidad de estar en la lista.
      </p>
    </section>
  )
}
