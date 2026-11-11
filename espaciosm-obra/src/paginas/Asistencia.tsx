import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  guardarJornada,
  listarAsistencia,
  listarDirectorio,
  listarProyectos,
  registrarEntrada,
  registrarSalida,
} from '../datos/consultas'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import { mensajeDeError } from '../lib/errores'
import {
  formatearFecha,
  formatearHora,
  formatearHoras,
  horasTrabajadas,
  hoyISO,
} from '../lib/formato'
import { puede } from '../lib/permisos'

export function Asistencia() {
  const { sesion, perfil, permisos } = useSesion()
  const usuarioId = sesion?.user.id ?? ''
  const esGestor = perfil?.rol === 'admin' || perfil?.rol === 'permiso_medio'
  const puedeVer = puede(permisos, 'asistencia', 'ver')
  const puedeCrear = puede(permisos, 'asistencia', 'crear')
  const puedeEditar = puede(permisos, 'asistencia', 'editar')

  const proyectosConsulta = useDatos(listarProyectos, [])
  const proyectos = proyectosConsulta.datos ?? []

  const [proyectoId, setProyectoId] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [procesando, setProcesando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'error' | 'exito'; texto: string } | null>(null)
  const [manualEmpleado, setManualEmpleado] = useState('')
  const [manualEntrada, setManualEntrada] = useState('07:00')
  const [manualSalida, setManualSalida] = useState('17:00')
  const [guardandoManual, setGuardandoManual] = useState(false)

  useEffect(() => {
    if (proyectoId === '' && proyectos.length > 0) {
      setProyectoId(proyectos[0].id)
    }
  }, [proyectos, proyectoId])

  useEffect(() => {
    // El residente solo captura el día de hoy; la base lo vuelve a imponer.
    if (!esGestor) setFecha(hoyISO())
  }, [esGestor])

  const consulta = useDatos(async () => {
    if (proyectoId === '') return { empleados: [], asistencia: [] }
    const [empleados, asistencia] = await Promise.all([
      listarDirectorio(proyectoId),
      listarAsistencia(proyectoId, fecha),
    ])
    return { empleados, asistencia }
  }, [proyectoId, fecha])

  const empleadosActivos = (consulta.datos?.empleados ?? []).filter(
    (empleado) => empleado.activo,
  )
  const registros = consulta.datos?.asistencia ?? []
  const porEmpleado = new Map(registros.map((registro) => [registro.empleado_id, registro]))
  const sinSalida = registros.filter((registro) => !registro.hora_salida).length

  useEffect(() => {
    if (empleadosActivos.length === 0) {
      if (manualEmpleado !== '') setManualEmpleado('')
      return
    }

    if (!empleadosActivos.some((empleado) => empleado.id === manualEmpleado)) {
      setManualEmpleado(empleadosActivos[0].id)
    }
  }, [empleadosActivos, manualEmpleado])

  async function entrada(empleadoId: string) {
    setProcesando(empleadoId)
    setAviso(null)
    try {
      await registrarEntrada(empleadoId, proyectoId, fecha, usuarioId)
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Entrada registrada.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setProcesando(null)
    }
  }

  async function salida(asistenciaId: string) {
    setProcesando(asistenciaId)
    setAviso(null)
    try {
      await registrarSalida(asistenciaId, usuarioId)
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Salida registrada.' })
    } catch (fallo) {
      if (fallo instanceof Error && fallo.message === 'SALIDA_YA_REGISTRADA') {
        consulta.recargar()
        setAviso({
          tipo: 'error',
          texto: 'La salida ya estaba registrada. Se actualizó la pantalla.',
        })
      } else {
        setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
      }
    } finally {
      setProcesando(null)
    }
  }

  async function guardarManual(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (manualEmpleado === '') return
    if (manualSalida !== '' && manualSalida <= manualEntrada) {
      setAviso({
        tipo: 'error',
        texto: 'La hora de salida debe ser posterior a la de entrada.',
      })
      return
    }

    setGuardandoManual(true)
    setAviso(null)

    try {
      await guardarJornada({
        empleadoId: manualEmpleado,
        proyectoId,
        fecha,
        horaEntrada: manualEntrada,
        horaSalida: manualSalida === '' ? null : manualSalida,
        usuarioId,
      })
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Jornada guardada.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardandoManual(false)
    }
  }

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Asistencia</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar la asistencia.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Asistencia</h1>
          <p className="subtitulo">
            Un registro por empleado y día. El residente captura solo el día de hoy y la hora
            la sella el servidor. La oficina puede corregir días anteriores con la captura
            manual.
          </p>
        </div>
      </div>

      {proyectosConsulta.error ? (
        <Aviso tipo="error">{proyectosConsulta.error}</Aviso>
      ) : null}

      {proyectos.length === 0 && !proyectosConsulta.cargando ? (
        <div className="tarjeta tarjeta--plana">
          <Vacio titulo="No tienes obras asignadas">
            Pide al administrador que te agregue al equipo de una obra para poder registrar
            asistencia.
          </Vacio>
        </div>
      ) : (
        <>
          <section className="tarjeta tarjeta--plana">
            <div className="filtros">
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="asistencia-proyecto">
                  Obra
                </label>
                <select
                  id="asistencia-proyecto"
                  className="campo__control"
                  value={proyectoId}
                  onChange={(evento) => setProyectoId(evento.target.value)}
                >
                  {proyectos.map((proyecto) => (
                    <option key={proyecto.id} value={proyecto.id}>
                      {proyecto.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {esGestor ? (
                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="asistencia-fecha">
                    Fecha
                  </label>
                  <input
                    id="asistencia-fecha"
                    className="campo__control"
                    type="date"
                    value={fecha}
                    max={hoyISO()}
                    onChange={(evento) => {
                      if (evento.target.value !== '') setFecha(evento.target.value)
                    }}
                  />
                </div>
              ) : (
                <div className="campo">
                  <span className="campo__etiqueta">Fecha</span>
                  <div className="campo__control campo__control--fijo">
                    {formatearFecha(hoyISO())}
                  </div>
                  <span className="campo__ayuda">Solo hoy. La oficina corrige fechas anteriores.</span>
                </div>
              )}

              <span className="seccion__nota">
                {formatearFecha(fecha)} · {registros.length} registros · {sinSalida} sin salida
              </span>
            </div>
          </section>

          {esGestor && empleadosActivos.length > 0 ? (
            <section className="tarjeta tarjeta--plana">
              <div className="seccion__cabecera">
                <div>
                  <h2 className="seccion__titulo">Captura manual de jornada</h2>
                  <p className="seccion__nota">
                    Para días anteriores o correcciones: fija entrada y salida. Fecha:{' '}
                    {formatearFecha(fecha)}.
                  </p>
                </div>
              </div>

              <form className="formulario" onSubmit={(evento) => void guardarManual(evento)}>
                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="manual-empleado">
                    Empleado
                  </label>
                  <select
                    id="manual-empleado"
                    className="campo__control"
                    value={manualEmpleado}
                    onChange={(evento) => setManualEmpleado(evento.target.value)}
                  >
                    {empleadosActivos.map((empleado) => (
                      <option key={empleado.id} value={empleado.id}>
                        {empleado.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="manual-entrada">
                    Hora de entrada
                  </label>
                  <input
                    id="manual-entrada"
                    className="campo__control"
                    type="time"
                    required
                    value={manualEntrada}
                    onChange={(evento) => setManualEntrada(evento.target.value)}
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="manual-salida">
                    Hora de salida
                  </label>
                  <input
                    id="manual-salida"
                    className="campo__control"
                    type="time"
                    value={manualSalida}
                    onChange={(evento) => setManualSalida(evento.target.value)}
                  />
                  <span className="campo__ayuda">
                    Déjala vacía si la jornada sigue abierta.
                  </span>
                </div>

                <div className="acciones campo--ancho">
                  <button
                    type="submit"
                    className="boton boton--primario"
                    disabled={guardandoManual || manualEmpleado === ''}
                  >
                    {guardandoManual ? 'Guardando…' : 'Guardar jornada'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}
          {consulta.error ? (
            <Aviso tipo="error">
              {consulta.error}{' '}
              <button type="button" className="boton boton--tenue" onClick={consulta.recargar}>
                Reintentar
              </button>
            </Aviso>
          ) : null}

          {consulta.cargando && !consulta.datos ? (
            <Cargando />
          ) : empleadosActivos.length === 0 ? (
            <div className="tarjeta tarjeta--plana">
              <Vacio titulo="Esta obra no tiene personal activo">
                Da de alta al personal en la sección Personal para poder registrar asistencia.
              </Vacio>
            </div>
          ) : (
            <div className="lista-marco">
              <ul className="lista-asistencia">
                {empleadosActivos.map((empleado) => {
                  const registro = porEmpleado.get(empleado.id)
                  const horas = registro
                    ? horasTrabajadas(registro.hora_entrada, registro.hora_salida)
                    : null

                  return (
                    <li className="asistencia-fila" key={empleado.id}>
                      <div className="asistencia-fila__persona">
                        <span className="celda-principal">{empleado.nombre}</span>
                        <span className="celda-nota">{empleado.puesto ?? 'Sin puesto'}</span>
                      </div>

                      <div className="asistencia-fila__marcas">
                        <div className="marca-tiempo">
                          <span className="meta-etiqueta">Entrada</span>
                          <span>
                            {registro ? formatearHora(registro.hora_entrada) : 'Sin registro'}
                          </span>
                        </div>
                        <div className="marca-tiempo">
                          <span className="meta-etiqueta">Salida</span>
                          <span>{registro ? formatearHora(registro.hora_salida) : '—'}</span>
                        </div>
                        <div className="marca-tiempo">
                          <span className="meta-etiqueta">Horas</span>
                          <span>{formatearHoras(horas)}</span>
                        </div>
                      </div>

                      <div className="asistencia-fila__accion">
                        {esGestor && fecha !== hoyISO() ? (
                          <span className="seccion__nota">Corrige en la captura manual</span>
                        ) : (
                          <>
                            {!registro && puedeCrear ? (
                              <button
                                type="button"
                                className="boton boton--primario"
                                disabled={procesando === empleado.id}
                                onClick={() => void entrada(empleado.id)}
                              >
                                {procesando === empleado.id ? 'Guardando…' : 'Registrar entrada'}
                              </button>
                            ) : null}

                            {registro && !registro.hora_salida && puedeEditar ? (
                              <button
                                type="button"
                                className="boton boton--primario"
                                disabled={procesando === registro.id}
                                onClick={() => void salida(registro.id)}
                              >
                                {procesando === registro.id ? 'Guardando…' : 'Registrar salida'}
                              </button>
                            ) : null}

                            {registro && registro.hora_salida ? (
                              <span className="seccion__nota">Jornada completa</span>
                            ) : null}

                            {!registro && !puedeCrear ? (
                              <span className="seccion__nota">Sin registro</span>
                            ) : null}

                            {registro && !registro.hora_salida && !puedeEditar ? (
                              <span className="seccion__nota">Jornada abierta</span>
                            ) : null}
                          </>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
