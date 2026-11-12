import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  guardarJornada,
  listarAsistencia,
  listarDirectorio,
  listarMiJornada,
  listarProyectos,
  listarResidentesEnObra,
  registrarEntrada,
  registrarMiEntrada,
  registrarMiSalida,
  registrarSalida,
} from '../datos/consultas'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'
import { Insignia } from '../componentes/Insignias'
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
    if (proyectoId === '') {
      return { empleados: [], asistencia: [], miJornada: null, residentes: [] }
    }

    const [empleados, asistencia, miJornada, residentes] = await Promise.all([
      listarDirectorio(proyectoId),
      listarAsistencia(proyectoId, fecha),
      perfil?.rol === 'residente'
        ? listarMiJornada(usuarioId, fecha)
        : Promise.resolve(null),
      esGestor ? listarResidentesEnObra(fecha) : Promise.resolve([]),
    ])

    return { empleados, asistencia, miJornada, residentes }
  }, [proyectoId, fecha, usuarioId, perfil?.rol, esGestor])

  const empleadosActivos = (consulta.datos?.empleados ?? []).filter(
    (empleado) => empleado.activo,
  )
  const registros = consulta.datos?.asistencia ?? []
  const porEmpleado = new Map(registros.map((registro) => [registro.empleado_id, registro]))
  const sinSalida = registros.filter((registro) => !registro.hora_salida).length
  const miJornada = consulta.datos?.miJornada ?? null
  const residentes = consulta.datos?.residentes ?? []
  const residentesEnObra = residentes.filter((residente) => !residente.hora_salida).length

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

  async function miEntrada() {
    if (proyectoId === '') return

    setProcesando('mi-entrada')
    setAviso(null)

    try {
      await registrarMiEntrada(proyectoId, usuarioId)
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Entrada a obra registrada.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setProcesando(null)
    }
  }

  async function miSalida() {
    if (!miJornada) return

    setProcesando('mi-salida')
    setAviso(null)

    try {
      await registrarMiSalida(miJornada.id, usuarioId)
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Salida de obra registrada.' })
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

      {perfil?.rol === 'residente' && proyectoId !== '' ? (
        <section className="tarjeta tarjeta--plana">
          <div className="seccion__cabecera">
            <div>
              <h2 className="seccion__titulo">Mi jornada en obra</h2>
              <p className="seccion__nota">
                Tu entrada y salida de hoy. Es independiente de la asistencia de tu
                cuadrilla.
              </p>
            </div>
            {miJornada ? (
              <Insignia tono={miJornada.hora_salida ? 'tenue' : 'en_ejecucion'}>
                {miJornada.hora_salida ? 'Jornada cerrada' : 'En obra'}
              </Insignia>
            ) : null}
          </div>

          <div className="filtros">
            <div className="dato">
              <span className="meta-etiqueta">Entrada</span>
              <span className="dato__valor">
                {miJornada ? formatearHora(miJornada.hora_entrada) : 'Sin registro'}
              </span>
            </div>
            <div className="dato">
              <span className="meta-etiqueta">Salida</span>
              <span className="dato__valor">
                {miJornada?.hora_salida ? formatearHora(miJornada.hora_salida) : '—'}
              </span>
            </div>

            <div className="acciones">
              {!miJornada ? (
                <button
                  type="button"
                  className="boton boton--primario"
                  disabled={procesando === 'mi-entrada'}
                  onClick={() => void miEntrada()}
                >
                  {procesando === 'mi-entrada'
                    ? 'Guardando…'
                    : 'Registrar mi entrada'}
                </button>
              ) : null}

              {miJornada && !miJornada.hora_salida ? (
                <button
                  type="button"
                  className="boton boton--primario"
                  disabled={procesando === 'mi-salida'}
                  onClick={() => void miSalida()}
                >
                  {procesando === 'mi-salida' ? 'Guardando…' : 'Registrar mi salida'}
                </button>
              ) : null}

              {miJornada?.hora_salida ? (
                <span className="seccion__nota">Ya registraste tu salida de hoy.</span>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {esGestor ? (
        <section className="tarjeta tarjeta--plana">
          <div className="seccion__cabecera">
            <div>
              <h2 className="seccion__titulo">Residentes en obra hoy</h2>
              <p className="seccion__nota">
                Entradas y salidas que registran los residentes en sus obras.
              </p>
            </div>
            <button type="button" className="boton boton--tenue" onClick={consulta.recargar}>
              Actualizar
            </button>
          </div>

          {residentesEnObra > 0 ? (
            <Aviso tipo="info">
              {residentesEnObra} residente{residentesEnObra === 1 ? '' : 's'} en obra
              ahora mismo.
            </Aviso>
          ) : null}

          {residentes.length === 0 ? (
            <Vacio titulo="Sin registros de residentes">
              Cuando un residente registre su entrada aparecerá aquí.
            </Vacio>
          ) : (
            <ul className="lista-simple">
              {residentes.map((residente) => (
                <li key={`${residente.usuario_id}-${residente.proyecto_id}`}>
                  <span>
                    <span className="celda-principal">
                      {residente.nombre ?? residente.email}
                    </span>
                    <span className="celda-nota">{residente.proyecto_nombre}</span>
                  </span>
                  <span className="filtros">
                    <span className="meta-dato">
                      <span className="meta-etiqueta">Entrada</span>
                      {formatearHora(residente.hora_entrada)}
                    </span>
                    <span className="meta-dato">
                      <span className="meta-etiqueta">Salida</span>
                      {residente.hora_salida
                        ? formatearHora(residente.hora_salida)
                        : 'En obra'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

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
