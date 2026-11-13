import { useEffect, useState, type FormEvent } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import {
  actualizarEstadoEstimacion,
  crearEstimacionSeleccion,
  listarEstimaciones,
  listarPartidasEstimacion,
  listarProyectos,
  previsualizarEstimacion,
  previsualizarSolicitudEstimacion,
  solicitarEstimacion,
} from '../datos/consultas'
import type {
  EstadoEstimacion,
  Estimacion,
  EstimacionPartida,
  PartidaDisponible,
} from '../lib/tipos'
import { formatearFecha, formatearMoneda, hoyISO } from '../lib/formato'
import { mensajeDeError } from '../lib/errores'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'
import { Insignia } from '../componentes/Insignias'

const TITULO_ESTADO: Record<EstadoEstimacion, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  autorizada: 'Autorizada',
  pagada: 'Pagada',
}

const TONO_ESTADO: Record<EstadoEstimacion, 'tenue' | 'alerta' | 'en_ejecucion'> = {
  borrador: 'tenue',
  enviada: 'alerta',
  autorizada: 'en_ejecucion',
  pagada: 'en_ejecucion',
}

function calcularTotales(estimacion: Estimacion | null, partidas: EstimacionPartida[]) {
  const subtotal = partidas.reduce((total, partida) => total + Number(partida.importe), 0)
  const retencion = subtotal * (Number(estimacion?.retencion_porcentaje ?? 0) / 100)
  return { subtotal, retencion, total: subtotal - retencion }
}

export function Estimaciones() {
  const { perfil, permisos } = useSesion()
  const proyectosConsulta = useDatos(listarProyectos, [])
  const proyectos = proyectosConsulta.datos ?? []
  const [proyectoId, setProyectoId] = useState('')

  useEffect(() => {
    if (proyectoId === '' && proyectos.length > 0) {
      setProyectoId(proyectos[0].id)
    }
  }, [proyectoId, proyectos])

  const estimacionesConsulta = useDatos(
    () => (proyectoId === '' ? Promise.resolve([]) : listarEstimaciones(proyectoId)),
    [proyectoId],
  )
  const estimaciones = estimacionesConsulta.datos ?? []
  const [estimacionId, setEstimacionId] = useState('')

  useEffect(() => {
    if (estimaciones.length === 0) {
      setEstimacionId('')
      return
    }
    if (!estimaciones.some((estimacion) => estimacion.id === estimacionId)) {
      setEstimacionId(estimaciones[0].id)
    }
  }, [estimaciones, estimacionId])

  const partidasConsulta = useDatos(
    () =>
      estimacionId === ''
        ? Promise.resolve([])
        : listarPartidasEstimacion(estimacionId),
    [estimacionId],
  )
  const partidas = partidasConsulta.datos ?? []
  const estimacionSeleccionada =
    estimaciones.find((estimacion) => estimacion.id === estimacionId) ?? null
  const totales = calcularTotales(estimacionSeleccionada, partidas)

  const puedeVer = permisos.estimaciones?.ver === true
  const puedeCrear = permisos.estimaciones?.crear === true
  const puedeEditar = permisos.estimaciones?.editar === true
  const esResidente = perfil?.rol === 'residente'

  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(
    null,
  )
  const [previsualizando, setPrevisualizando] = useState(false)
  const [creando, setCreando] = useState(false)
  const [disponibles, setDisponibles] = useState<PartidaDisponible[]>([])
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())
  const [numero, setNumero] = useState('')
  const [fechaInicio, setFechaInicio] = useState(`${hoyISO().slice(0, 7)}-01`)
  const [fechaFin, setFechaFin] = useState(hoyISO())
  const [retencion, setRetencion] = useState('0')
  const [notas, setNotas] = useState('')

  useEffect(() => {
    if (!esResidente || proyectoId === '') return

    let vigente = true
    setPrevisualizando(true)

    void previsualizarSolicitudEstimacion(proyectoId, '2000-01-01', hoyISO())
      .then((partidasDisponibles) => {
        if (!vigente) return
        setDisponibles(partidasDisponibles)
        setSeleccionadas(
          new Set(partidasDisponibles.map((partida) => partida.generador_id)),
        )
      })
      .catch((fallo) => {
        if (vigente) setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
      })
      .finally(() => {
        if (vigente) setPrevisualizando(false)
      })

    return () => {
      vigente = false
    }
  }, [esResidente, proyectoId])

  function validarFormulario(): number | null {
    if (!esResidente && numero.trim() === '') {
      setAviso({ tipo: 'error', texto: 'Escribe el número de estimación.' })
      return null
    }
    if (fechaFin < fechaInicio) {
      setAviso({ tipo: 'error', texto: 'La fecha final debe ser posterior a la inicial.' })
      return null
    }

    const retencionNumero = Number(retencion)
    if (!Number.isFinite(retencionNumero) || retencionNumero < 0 || retencionNumero > 100) {
      setAviso({ tipo: 'error', texto: 'La retención debe estar entre 0 y 100.' })
      return null
    }

    return retencionNumero
  }

  async function previsualizar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    const retencionNumero = validarFormulario()
    if (retencionNumero === null) return

    setPrevisualizando(true)
    setAviso(null)

    try {
      const partidasDisponibles = esResidente
        ? await previsualizarSolicitudEstimacion(proyectoId, '2000-01-01', hoyISO())
        : await previsualizarEstimacion(proyectoId, fechaInicio, fechaFin)
      setDisponibles(partidasDisponibles)
      setSeleccionadas(new Set(partidasDisponibles.map((partida) => partida.generador_id)))
      if (partidasDisponibles.length === 0) {
        setAviso({
          tipo: 'error',
          texto: 'No hay avances validados pendientes de estimar en ese periodo.',
        })
      }
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setPrevisualizando(false)
    }
  }

  async function crearSeleccion() {
    const retencionNumero = validarFormulario()
    if (retencionNumero === null) return

    if (seleccionadas.size === 0) {
      setAviso({ tipo: 'error', texto: 'Selecciona al menos una partida.' })
      return
    }

    setCreando(true)
    setAviso(null)

    const seleccionadasData = disponibles.filter((partida) =>
      seleccionadas.has(partida.generador_id),
    )
    const fechas = seleccionadasData
      .flatMap((partida) => [partida.fecha_min, partida.fecha_max])
      .filter((fecha): fecha is string => Boolean(fecha))
      .sort()
    const inicioSolicitud = esResidente && fechas.length > 0 ? fechas[0] : fechaInicio
    const finSolicitud =
      esResidente && fechas.length > 0 ? fechas[fechas.length - 1] : fechaFin

    try {
      const id = esResidente
        ? await solicitarEstimacion(
            {
              proyectoId,
              numero: numero.trim(),
              fechaInicio: inicioSolicitud,
              fechaFin: finSolicitud,
              retencion: retencionNumero,
              notas: notas.trim() === '' ? null : notas.trim(),
            },
            Array.from(seleccionadas),
          )
        : await crearEstimacionSeleccion(
            {
              proyectoId,
              numero: numero.trim(),
              fechaInicio,
              fechaFin,
              retencion: retencionNumero,
              notas: notas.trim() === '' ? null : notas.trim(),
            },
            Array.from(seleccionadas),
          )
      setNumero('')
      setNotas('')
      setDisponibles([])
      setSeleccionadas(new Set())
      estimacionesConsulta.recargar()
      setEstimacionId(id)
      setAviso({
        tipo: 'exito',
        texto: esResidente
          ? 'Solicitud de estimación enviada a administración.'
          : 'Estimación creada con las partidas seleccionadas.',
      })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setCreando(false)
    }
  }

  async function cambiarEstado(estado: EstadoEstimacion) {
    if (!estimacionSeleccionada) return
    setAviso(null)
    try {
      await actualizarEstadoEstimacion(estimacionSeleccionada.id, estado)
      estimacionesConsulta.recargar()
      setAviso({ tipo: 'exito', texto: `Estimación marcada como ${TITULO_ESTADO[estado].toLowerCase()}.` })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    }
  }

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Estimaciones</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar estimaciones.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Estimaciones</h1>
          <p className="subtitulo">
            Cortes de avance por periodo, calculados con los generadores. Incluye
            retención y estado de autorización.
          </p>
        </div>
      </div>

      {proyectosConsulta.error ? (
        <Aviso tipo="error">{proyectosConsulta.error}</Aviso>
      ) : null}

      {proyectos.length === 0 && !proyectosConsulta.cargando ? (
        <div className="tarjeta tarjeta--plana">
          <Vacio titulo="No tienes obras asignadas">
            Pide al administrador que te agregue al equipo de una obra para consultar
            sus estimaciones.
          </Vacio>
        </div>
      ) : (
        <>
          <section className="tarjeta tarjeta--plana">
            <div className="filtros">
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="estimaciones-proyecto">
                  Obra
                </label>
                <select
                  id="estimaciones-proyecto"
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

              <span className="seccion__nota">{estimaciones.length} estimaciones</span>
            </div>
          </section>

          {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}

          {puedeCrear ? (
            <section className="tarjeta">
              <div className="seccion__cabecera">
                <div>
                  <h2 className="seccion__titulo">
                    {esResidente ? 'Solicitar estimación' : 'Nueva estimación'}
                  </h2>
                  <p className="seccion__nota">
                    {esResidente
                      ? 'Toma tus avances validados del periodo y envía la solicitud a administración.'
                      : 'Toma los avances del periodo que aún no se han estimado.'}
                  </p>
                </div>
              </div>

              <form className="formulario" onSubmit={(evento) => void previsualizar(evento)}>
                {esResidente ? (
                  <div className="campo campo--ancho">
                    <span className="campo__etiqueta">Folio de solicitud</span>
                    <div className="campo__control campo__control--fijo">
                      Se generará automáticamente con el formato SOL-AAAAMMDD
                    </div>
                    <span className="campo__ayuda">
                      Si ya existe un folio de ese día en la obra, se agrega -02, -03,
                      etc.
                    </span>
                  </div>
                ) : (
                  <div className="campo">
                    <label className="campo__etiqueta" htmlFor="est-numero">
                      Número
                    </label>
                    <input
                      id="est-numero"
                      className="campo__control"
                      value={numero}
                      onChange={(evento) => setNumero(evento.target.value)}
                      placeholder="EST-01"
                    />
                  </div>
                )}

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="est-retencion">
                    Retención %
                  </label>
                  <input
                    id="est-retencion"
                    className="campo__control"
                    inputMode="decimal"
                    value={retencion}
                    onChange={(evento) => setRetencion(evento.target.value)}
                    placeholder="0"
                  />
                </div>

                {!esResidente ? (
                  <>
                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="est-inicio">
                        Fecha inicial
                      </label>
                      <input
                        id="est-inicio"
                        className="campo__control"
                        type="date"
                        max={hoyISO()}
                        value={fechaInicio}
                        onChange={(evento) => {
                          if (evento.target.value !== '')
                            setFechaInicio(evento.target.value)
                        }}
                      />
                    </div>

                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="est-fin">
                        Fecha final
                      </label>
                      <input
                        id="est-fin"
                        className="campo__control"
                        type="date"
                        max={hoyISO()}
                        value={fechaFin}
                        onChange={(evento) => {
                          if (evento.target.value !== '')
                            setFechaFin(evento.target.value)
                        }}
                      />
                    </div>
                  </>
                ) : null}

                <div className="campo campo--ancho">
                  <label className="campo__etiqueta" htmlFor="est-notas">
                    Notas
                  </label>
                  <input
                    id="est-notas"
                    className="campo__control"
                    value={notas}
                    onChange={(evento) => setNotas(evento.target.value)}
                    placeholder="Opcional"
                  />
                </div>

                <div className="acciones campo--ancho">
                  <button
                    type="submit"
                    className="boton boton--primario"
                    disabled={previsualizando}
                  >
                    {previsualizando
                      ? 'Buscando…'
                      : esResidente
                        ? 'Actualizar avances aprobados'
                        : 'Ver partidas disponibles'}
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <Aviso tipo="info">Solo consulta. La creación y autorización es de administración.</Aviso>
          )}

          {disponibles.length > 0 ? (
            <section className="tarjeta">
              <div className="seccion__cabecera">
                <div>
                  <h2 className="seccion__titulo">Partidas para esta estimación</h2>
                  <p className="seccion__nota">
                    Desactiva las partidas que quieras dejar en reserva.
                  </p>
                </div>
                <span className="seccion__nota">
                  {seleccionadas.size} de {disponibles.length} incluidas
                </span>
              </div>

              <div className="tabla-marco">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">
                        <input
                          type="checkbox"
                          checked={seleccionadas.size === disponibles.length}
                          onChange={(evento) =>
                            setSeleccionadas(
                              evento.target.checked
                                ? new Set(
                                    disponibles.map((partida) => partida.generador_id),
                                  )
                                : new Set(),
                            )
                          }
                          aria-label="Incluir todas"
                        />
                      </th>
                      <th scope="col">Concepto</th>
                      <th scope="col">Unidad</th>
                      <th scope="col">Cantidad</th>
                      <th scope="col">P. unitario</th>
                      <th scope="col">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disponibles.map((partida) => (
                      <tr key={partida.generador_id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={seleccionadas.has(partida.generador_id)}
                            onChange={(evento) => {
                              setSeleccionadas((previas) => {
                                const siguientes = new Set(previas)
                                if (evento.target.checked) {
                                  siguientes.add(partida.generador_id)
                                } else {
                                  siguientes.delete(partida.generador_id)
                                }
                                return siguientes
                              })
                            }}
                            aria-label={`Incluir ${partida.descripcion}`}
                          />
                        </td>
                        <td>
                          <span className="celda-principal">{partida.descripcion}</span>
                          <span className="celda-nota">{partida.clave ?? ''}</span>
                        </td>
                        <td>{partida.unidad}</td>
                        <td>{Number(partida.cantidad).toFixed(2)}</td>
                        <td>{formatearMoneda(Number(partida.precio_unitario))}</td>
                        <td>{formatearMoneda(Number(partida.importe))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="filtros">
                <div className="dato">
                  <span className="meta-etiqueta">Seleccionado</span>
                  <span className="dato__valor">
                    {formatearMoneda(
                      disponibles
                        .filter((partida) =>
                          seleccionadas.has(partida.generador_id),
                        )
                        .reduce((total, partida) => total + Number(partida.importe), 0),
                    )}
                  </span>
                </div>
                <div className="dato">
                  <span className="meta-etiqueta">Retención</span>
                  <span className="dato__valor">
                    {formatearMoneda(
                      (disponibles
                        .filter((partida) =>
                          seleccionadas.has(partida.generador_id),
                        )
                        .reduce((total, partida) => total + Number(partida.importe), 0) *
                        Number(retencion || 0)) /
                        100,
                    )}
                  </span>
                </div>
                <div className="acciones">
                  <button
                    type="button"
                    className="boton boton--primario"
                    disabled={creando || seleccionadas.size === 0}
                    onClick={() => void crearSeleccion()}
                  >
                    {creando
                      ? 'Creando…'
                      : esResidente
                        ? 'Enviar solicitud'
                        : 'Crear estimación seleccionada'}
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {estimacionesConsulta.cargando && !estimacionesConsulta.datos ? (
            <Cargando />
          ) : estimaciones.length === 0 ? (
            <div className="tarjeta tarjeta--plana">
              <Vacio titulo="Sin estimaciones">
                Crea el primer corte cuando existan avances en los generadores.
              </Vacio>
            </div>
          ) : (
            <>
              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Cortes</h2>
                    <p className="seccion__nota">Selecciona una estimación para ver su detalle.</p>
                  </div>
                </div>

                <div className="tabla-marco">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th scope="col">Número</th>
                        <th scope="col">Periodo</th>
                        <th scope="col">Estado</th>
                        <th scope="col" aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody>
                      {estimaciones.map((estimacion) => (
                        <tr key={estimacion.id}>
                          <td>
                            <span className="celda-principal">{estimacion.numero}</span>
                            <span className="celda-nota">{estimacion.notas ?? ''}</span>
                          </td>
                          <td>
                            {formatearFecha(estimacion.fecha_inicio)} —{' '}
                            {formatearFecha(estimacion.fecha_fin)}
                          </td>
                          <td>
                            <Insignia tono={TONO_ESTADO[estimacion.estado]}>
                              {TITULO_ESTADO[estimacion.estado]}
                            </Insignia>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="boton"
                              onClick={() => setEstimacionId(estimacion.id)}
                            >
                              Ver
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {estimacionSeleccionada ? (
                <section className="tarjeta">
                  <div className="seccion__cabecera">
                    <div>
                      <h2 className="seccion__titulo">
                        {estimacionSeleccionada.numero}
                      </h2>
                      <p className="seccion__nota">
                        {formatearFecha(estimacionSeleccionada.fecha_inicio)} —{' '}
                        {formatearFecha(estimacionSeleccionada.fecha_fin)} · Retención{' '}
                        {Number(estimacionSeleccionada.retencion_porcentaje).toFixed(2)}%
                      </p>
                    </div>
                    <Insignia tono={TONO_ESTADO[estimacionSeleccionada.estado]}>
                      {TITULO_ESTADO[estimacionSeleccionada.estado]}
                    </Insignia>
                  </div>

                  {partidasConsulta.cargando && !partidasConsulta.datos ? (
                    <Cargando />
                  ) : partidas.length === 0 ? (
                    <Vacio titulo="Sin partidas">
                      No hay avances nuevos en el periodo seleccionado.
                    </Vacio>
                  ) : (
                    <div className="tabla-marco">
                      <table className="tabla">
                        <thead>
                          <tr>
                            <th scope="col">Clave</th>
                            <th scope="col">Concepto</th>
                            <th scope="col">Unidad</th>
                            <th scope="col">Cantidad</th>
                            <th scope="col">P. unitario</th>
                            <th scope="col">Importe</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partidas.map((partida) => (
                            <tr key={partida.id}>
                              <td>{partida.clave ?? '—'}</td>
                              <td>{partida.descripcion}</td>
                              <td>{partida.unidad}</td>
                              <td>{Number(partida.cantidad).toFixed(2)}</td>
                              <td>{formatearMoneda(Number(partida.precio_unitario))}</td>
                              <td>{formatearMoneda(Number(partida.importe))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="filtros">
                    <div className="dato">
                      <span className="meta-etiqueta">Subtotal</span>
                      <span className="dato__valor">{formatearMoneda(totales.subtotal)}</span>
                    </div>
                    <div className="dato">
                      <span className="meta-etiqueta">Retención</span>
                      <span className="dato__valor">{formatearMoneda(totales.retencion)}</span>
                    </div>
                    <div className="dato">
                      <span className="meta-etiqueta">Total</span>
                      <span className="dato__valor">{formatearMoneda(totales.total)}</span>
                    </div>
                  </div>

                  <div className="acciones">
                    <button
                      type="button"
                      className="boton"
                      onClick={() => window.print()}
                    >
                      Imprimir / Guardar PDF
                    </button>
                    {puedeEditar
                      ? (['enviada', 'autorizada', 'pagada'] as EstadoEstimacion[]).map(
                          (estado) => (
                            <button
                              key={estado}
                              type="button"
                              className="boton"
                              disabled={estimacionSeleccionada.estado === estado}
                              onClick={() => void cambiarEstado(estado)}
                            >
                              Marcar {TITULO_ESTADO[estado].toLowerCase()}
                            </button>
                          ),
                        )
                      : null}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  )
}
