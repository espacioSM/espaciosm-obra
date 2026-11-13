import { useEffect, useState, type FormEvent } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import {
  crearSolicitud,
  listarProyectos,
  listarSolicitudes,
  responderSolicitud,
} from '../datos/consultas'
import type {
  EstadoSolicitud,
  PrioridadSolicitud,
  TipoSolicitud,
} from '../lib/tipos'
import { formatearFecha, hoyISO } from '../lib/formato'
import { mensajeDeError } from '../lib/errores'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'
import { Insignia } from '../componentes/Insignias'

const TIPO: Record<TipoSolicitud, string> = {
  material: 'Material',
  personal: 'Personal',
  equipo: 'Equipo',
  otro: 'Otro',
}

const PRIORIDAD: Record<PrioridadSolicitud, string> = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
}

const ESTADO: Record<EstadoSolicitud, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  atendida: 'Atendida',
}

const TONO_ESTADO: Record<EstadoSolicitud, 'tenue' | 'alerta' | 'en_ejecucion'> = {
  pendiente: 'alerta',
  aprobada: 'en_ejecucion',
  rechazada: 'tenue',
  atendida: 'en_ejecucion',
}

export function Solicitudes() {
  const { permisos } = useSesion()
  const proyectosConsulta = useDatos(listarProyectos, [])
  const proyectos = proyectosConsulta.datos ?? []
  const [proyectoId, setProyectoId] = useState('')

  useEffect(() => {
    if (proyectoId === '' && proyectos.length > 0) {
      setProyectoId(proyectos[0].id)
    }
  }, [proyectoId, proyectos])

  const consulta = useDatos(
    () => (proyectoId === '' ? Promise.resolve([]) : listarSolicitudes(proyectoId)),
    [proyectoId],
  )
  const solicitudes = consulta.datos ?? []
  const [solicitudId, setSolicitudId] = useState('')

  useEffect(() => {
    if (solicitudes.length === 0) {
      setSolicitudId('')
      return
    }
    if (!solicitudes.some((solicitud) => solicitud.id === solicitudId)) {
      setSolicitudId(solicitudes[0].id)
    }
  }, [solicitudes, solicitudId])

  const seleccionada =
    solicitudes.find((solicitud) => solicitud.id === solicitudId) ?? null

  const puedeVer = permisos.solicitudes?.ver === true
  const puedeCrear = permisos.solicitudes?.crear === true
  const puedeAprobar = permisos.solicitudes?.aprobar === true

  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(
    null,
  )
  const [guardando, setGuardando] = useState(false)
  const [tipo, setTipo] = useState<TipoSolicitud>('material')
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [unidad, setUnidad] = useState('')
  const [prioridad, setPrioridad] = useState<PrioridadSolicitud>('media')
  const [fechaRequerida, setFechaRequerida] = useState('')
  const [notas, setNotas] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [respondiendo, setRespondiendo] = useState<EstadoSolicitud | null>(null)

  useEffect(() => {
    setRespuesta(seleccionada?.respuesta ?? '')
  }, [seleccionada?.id, seleccionada?.respuesta])

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (descripcion.trim() === '') {
      setAviso({ tipo: 'error', texto: 'Describe qué necesitas.' })
      return
    }

    const cantidadNumero = cantidad.trim() === '' ? null : Number(cantidad)
    if (cantidadNumero !== null && (!Number.isFinite(cantidadNumero) || cantidadNumero <= 0)) {
      setAviso({ tipo: 'error', texto: 'La cantidad debe ser mayor que cero.' })
      return
    }

    setGuardando(true)
    setAviso(null)

    try {
      await crearSolicitud({
        proyectoId,
        tipo,
        descripcion: descripcion.trim(),
        cantidad: cantidadNumero,
        unidad: unidad.trim() === '' ? null : unidad.trim(),
        prioridad,
        fechaRequerida: fechaRequerida === '' ? null : fechaRequerida,
        notas: notas.trim() === '' ? null : notas.trim(),
      })
      setDescripcion('')
      setCantidad('')
      setUnidad('')
      setNotas('')
      setFechaRequerida('')
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Solicitud enviada.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardando(false)
    }
  }

  async function responder(estado: EstadoSolicitud) {
    if (!seleccionada) return

    setRespondiendo(estado)
    setAviso(null)

    try {
      await responderSolicitud(seleccionada.id, estado, respuesta)
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: `Solicitud marcada como ${ESTADO[estado].toLowerCase()}.` })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setRespondiendo(null)
    }
  }

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Solicitudes</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar solicitudes.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Solicitudes de recursos</h1>
          <p className="subtitulo">
            Pide material, personal o equipo. Administración y permiso medio responden
            con aprobación o rechazo.
          </p>
        </div>
      </div>

      {proyectosConsulta.error ? (
        <Aviso tipo="error">{proyectosConsulta.error}</Aviso>
      ) : null}

      {proyectos.length === 0 && !proyectosConsulta.cargando ? (
        <div className="tarjeta tarjeta--plana">
          <Vacio titulo="No tienes obras asignadas">
            Pide al administrador que te agregue al equipo de una obra para solicitar
            recursos.
          </Vacio>
        </div>
      ) : (
        <>
          <section className="tarjeta tarjeta--plana">
            <div className="filtros">
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="solicitudes-proyecto">
                  Obra
                </label>
                <select
                  id="solicitudes-proyecto"
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

              <span className="seccion__nota">
                {solicitudes.filter((solicitud) => solicitud.estado === 'pendiente').length}{' '}
                pendientes
              </span>
            </div>
          </section>

          {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}

          {puedeCrear ? (
            <section className="tarjeta">
              <div className="seccion__cabecera">
                <div>
                  <h2 className="seccion__titulo">Nueva solicitud</h2>
                  <p className="seccion__nota">
                    La solicitud queda pendiente hasta que oficina la responda.
                  </p>
                </div>
              </div>

              <form className="formulario" onSubmit={(evento) => void guardar(evento)}>
                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="sol-tipo">
                    Tipo
                  </label>
                  <select
                    id="sol-tipo"
                    className="campo__control"
                    value={tipo}
                    onChange={(evento) => setTipo(evento.target.value as TipoSolicitud)}
                  >
                    <option value="material">Material</option>
                    <option value="personal">Personal</option>
                    <option value="equipo">Equipo</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="sol-prioridad">
                    Prioridad
                  </label>
                  <select
                    id="sol-prioridad"
                    className="campo__control"
                    value={prioridad}
                    onChange={(evento) =>
                      setPrioridad(evento.target.value as PrioridadSolicitud)
                    }
                  >
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>

                <div className="campo campo--ancho">
                  <label className="campo__etiqueta" htmlFor="sol-descripcion">
                    Descripción
                  </label>
                  <input
                    id="sol-descripcion"
                    className="campo__control"
                    value={descripcion}
                    onChange={(evento) => setDescripcion(evento.target.value)}
                    placeholder="Cemento gris para colado del eje 3"
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="sol-cantidad">
                    Cantidad
                  </label>
                  <input
                    id="sol-cantidad"
                    className="campo__control"
                    inputMode="decimal"
                    value={cantidad}
                    onChange={(evento) => setCantidad(evento.target.value)}
                    placeholder="Opcional"
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="sol-unidad">
                    Unidad
                  </label>
                  <input
                    id="sol-unidad"
                    className="campo__control"
                    value={unidad}
                    onChange={(evento) => setUnidad(evento.target.value)}
                    placeholder="bulto, m3, persona"
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="sol-fecha">
                    Fecha requerida
                  </label>
                  <input
                    id="sol-fecha"
                    className="campo__control"
                    type="date"
                    min={hoyISO()}
                    value={fechaRequerida}
                    onChange={(evento) => setFechaRequerida(evento.target.value)}
                  />
                </div>

                <div className="campo campo--ancho">
                  <label className="campo__etiqueta" htmlFor="sol-notas">
                    Notas
                  </label>
                  <input
                    id="sol-notas"
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
                    {guardando ? 'Enviando…' : 'Enviar solicitud'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {consulta.cargando && !consulta.datos ? (
            <Cargando />
          ) : solicitudes.length === 0 ? (
            <div className="tarjeta tarjeta--plana">
              <Vacio titulo="Sin solicitudes">
                Cuando alguien pida material, personal o equipo aparecerá aquí.
              </Vacio>
            </div>
          ) : (
            <>
              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Solicitudes</h2>
                    <p className="seccion__nota">Selecciona una para ver el detalle.</p>
                  </div>
                </div>

                <div className="tabla-marco">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th scope="col">Fecha</th>
                        <th scope="col">Tipo</th>
                        <th scope="col">Descripción</th>
                        <th scope="col">Solicita</th>
                        <th scope="col">Prioridad</th>
                        <th scope="col">Requerida</th>
                        <th scope="col">Estado</th>
                        <th scope="col" aria-label="Acciones" />
                      </tr>
                    </thead>
                    <tbody>
                      {solicitudes.map((solicitud) => (
                        <tr key={solicitud.id}>
                          <td>{formatearFecha(solicitud.creado_en.slice(0, 10))}</td>
                          <td>{TIPO[solicitud.tipo]}</td>
                          <td>
                            <span className="celda-principal">{solicitud.descripcion}</span>
                            <span className="celda-nota">
                              {solicitud.cantidad
                                ? `${Number(solicitud.cantidad).toFixed(2)} ${
                                    solicitud.unidad ?? ''
                                  }`
                                : ''}
                            </span>
                          </td>
                          <td>{solicitud.solicitante_nombre ?? solicitud.solicitante_email}</td>
                          <td>{PRIORIDAD[solicitud.prioridad]}</td>
                          <td>{formatearFecha(solicitud.fecha_requerida)}</td>
                          <td>
                            <Insignia tono={TONO_ESTADO[solicitud.estado]}>
                              {ESTADO[solicitud.estado]}
                            </Insignia>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="boton"
                              onClick={() => setSolicitudId(solicitud.id)}
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

              {seleccionada ? (
                <section className="tarjeta">
                  <div className="seccion__cabecera">
                    <div>
                      <h2 className="seccion__titulo">{seleccionada.descripcion}</h2>
                      <p className="seccion__nota">
                        {TIPO[seleccionada.tipo]} · {PRIORIDAD[seleccionada.prioridad]} ·{' '}
                        {seleccionada.solicitante_nombre ?? seleccionada.solicitante_email}
                      </p>
                    </div>
                    <Insignia tono={TONO_ESTADO[seleccionada.estado]}>
                      {ESTADO[seleccionada.estado]}
                    </Insignia>
                  </div>

                  <div className="filtros">
                    <div className="dato">
                      <span className="meta-etiqueta">Cantidad</span>
                      <span className="dato__valor">
                        {seleccionada.cantidad
                          ? `${Number(seleccionada.cantidad).toFixed(2)} ${
                              seleccionada.unidad ?? ''
                            }`
                          : '—'}
                      </span>
                    </div>
                    <div className="dato">
                      <span className="meta-etiqueta">Requerida</span>
                      <span className="dato__valor">
                        {formatearFecha(seleccionada.fecha_requerida)}
                      </span>
                    </div>
                    <div className="dato">
                      <span className="meta-etiqueta">Solicitada</span>
                      <span className="dato__valor">
                        {formatearFecha(seleccionada.creado_en.slice(0, 10))}
                      </span>
                    </div>
                  </div>

                  {seleccionada.notas ? (
                    <p className="seccion__nota">Notas: {seleccionada.notas}</p>
                  ) : null}

                  {seleccionada.respuesta ? (
                    <Aviso tipo="info">Respuesta: {seleccionada.respuesta}</Aviso>
                  ) : null}

                  {puedeAprobar ? (
                    <>
                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="sol-respuesta">
                          Respuesta
                        </label>
                        <textarea
                          id="sol-respuesta"
                          className="campo__control"
                          rows={3}
                          value={respuesta}
                          onChange={(evento) => setRespuesta(evento.target.value)}
                          placeholder="Comentario para el residente"
                        />
                      </div>

                      <div className="acciones">
                        {seleccionada.estado === 'pendiente' ? (
                          <>
                            <button
                              type="button"
                              className="boton boton--primario"
                              disabled={respondiendo !== null}
                              onClick={() => void responder('aprobada')}
                            >
                              {respondiendo === 'aprobada' ? 'Guardando…' : 'Aprobar'}
                            </button>
                            <button
                              type="button"
                              className="boton boton--peligro"
                              disabled={respondiendo !== null}
                              onClick={() => void responder('rechazada')}
                            >
                              {respondiendo === 'rechazada' ? 'Guardando…' : 'Rechazar'}
                            </button>
                          </>
                        ) : null}

                        {seleccionada.estado === 'aprobada' ? (
                          <button
                            type="button"
                            className="boton"
                            disabled={respondiendo !== null}
                            onClick={() => void responder('atendida')}
                          >
                            {respondiendo === 'atendida' ? 'Guardando…' : 'Marcar atendida'}
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="seccion__nota">
                      Solo administración y permiso medio pueden responder.
                    </p>
                  )}
                </section>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  )
}
