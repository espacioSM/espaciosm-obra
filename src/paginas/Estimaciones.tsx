import { useEffect, useState, type FormEvent } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import {
  actualizarEstadoEstimacion,
  crearEstimacion,
  listarEstimaciones,
  listarPartidasEstimacion,
  listarProyectos,
} from '../datos/consultas'
import type { EstadoEstimacion, Estimacion, EstimacionPartida } from '../lib/tipos'
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
  const { permisos } = useSesion()
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

  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(
    null,
  )
  const [guardando, setGuardando] = useState(false)
  const [numero, setNumero] = useState('')
  const [fechaInicio, setFechaInicio] = useState(`${hoyISO().slice(0, 7)}-01`)
  const [fechaFin, setFechaFin] = useState(hoyISO())
  const [retencion, setRetencion] = useState('0')
  const [notas, setNotas] = useState('')

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (numero.trim() === '') {
      setAviso({ tipo: 'error', texto: 'Escribe el número de estimación.' })
      return
    }
    if (fechaFin < fechaInicio) {
      setAviso({ tipo: 'error', texto: 'La fecha final debe ser posterior a la inicial.' })
      return
    }

    const retencionNumero = Number(retencion)
    if (!Number.isFinite(retencionNumero) || retencionNumero < 0 || retencionNumero > 100) {
      setAviso({ tipo: 'error', texto: 'La retención debe estar entre 0 y 100.' })
      return
    }

    setGuardando(true)
    setAviso(null)

    try {
      const id = await crearEstimacion({
        proyectoId,
        numero: numero.trim(),
        fechaInicio,
        fechaFin,
        retencion: retencionNumero,
        notas: notas.trim() === '' ? null : notas.trim(),
      })
      setNumero('')
      setNotas('')
      estimacionesConsulta.recargar()
      setEstimacionId(id)
      setAviso({ tipo: 'exito', texto: 'Estimación creada con los avances del periodo.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardando(false)
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
                  <h2 className="seccion__titulo">Nueva estimación</h2>
                  <p className="seccion__nota">
                    Toma los avances del periodo que aún no se han estimado.
                  </p>
                </div>
              </div>

              <form className="formulario" onSubmit={(evento) => void guardar(evento)}>
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
                      if (evento.target.value !== '') setFechaInicio(evento.target.value)
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
                      if (evento.target.value !== '') setFechaFin(evento.target.value)
                    }}
                  />
                </div>

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
                    disabled={guardando}
                  >
                    {guardando ? 'Calculando…' : 'Crear estimación'}
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <Aviso tipo="info">Solo consulta. La creación y autorización es de administración.</Aviso>
          )}

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

                  {puedeEditar ? (
                    <div className="acciones">
                      {(['enviada', 'autorizada', 'pagada'] as EstadoEstimacion[]).map(
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
                      )}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  )
}
