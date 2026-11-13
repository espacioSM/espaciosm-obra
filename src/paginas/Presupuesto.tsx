import { useEffect, useState, type FormEvent } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import {
  crearCobroCliente,
  guardarPresupuesto,
  listarCobrosCliente,
  listarEstimaciones,
  listarPartidasEstimacion,
  listarProyectos,
  obtenerPresupuesto,
} from '../datos/consultas'
import type {
  Estimacion,
  EstimacionPartida,
  TipoCobro,
} from '../lib/tipos'
import { formatearFecha, formatearMoneda, hoyISO } from '../lib/formato'
import { mensajeDeError } from '../lib/errores'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'

const TIPO_COBRO: Record<TipoCobro, string> = {
  anticipo: 'Anticipo',
  estimacion: 'Pago por estimación',
  liquidacion: 'Liquidación',
  otro: 'Otro',
}

export function Presupuesto() {
  const { permisos } = useSesion()
  const proyectosConsulta = useDatos(listarProyectos, [])
  const proyectos = proyectosConsulta.datos ?? []
  const [proyectoId, setProyectoId] = useState('')

  useEffect(() => {
    if (proyectoId === '' && proyectos.length > 0) {
      setProyectoId(proyectos[0].id)
    }
  }, [proyectoId, proyectos])

  const consulta = useDatos(async () => {
    if (proyectoId === '') {
      return { presupuesto: null, cobros: [], estimaciones: [], partidas: [] }
    }
    const [presupuesto, cobros, estimaciones] = await Promise.all([
      obtenerPresupuesto(proyectoId),
      listarCobrosCliente(proyectoId),
      listarEstimaciones(proyectoId),
    ])
    const partidas = (
      await Promise.all(
        estimaciones.map((estimacion) => listarPartidasEstimacion(estimacion.id)),
      )
    ).flat()
    return { presupuesto, cobros, estimaciones, partidas }
  }, [proyectoId])

  const datos = consulta.datos
  const presupuesto = datos?.presupuesto ?? null
  const cobros = datos?.cobros ?? []
  const estimaciones = datos?.estimaciones ?? []
  const partidas = datos?.partidas ?? []

  const puedeVer = permisos.pagos?.ver === true
  const puedeCrear = permisos.pagos?.crear === true

  const [montoContrato, setMontoContrato] = useState('0')
  const [anticipo, setAnticipo] = useState('0')
  const [notas, setNotas] = useState('')
  const [tipo, setTipo] = useState<TipoCobro>('anticipo')
  const [estimacionId, setEstimacionId] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [referencia, setReferencia] = useState('')
  const [nota, setNota] = useState('')
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(
    null,
  )
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setMontoContrato(String(presupuesto?.monto_contrato ?? 0))
    setAnticipo(String(presupuesto?.anticipo_porcentaje ?? 0))
    setNotas(presupuesto?.notas ?? '')
    setEstimacionId('')
    setMonto('')
    setReferencia('')
    setNota('')
  }, [presupuesto])

  function subtotalEstimacion(estimacion: Estimacion): number {
    return partidas
      .filter((partida: EstimacionPartida) => partida.estimacion_id === estimacion.id)
      .reduce((total, partida) => total + Number(partida.importe), 0)
  }

  function netoEstimacion(estimacion: Estimacion): number {
    const subtotal = subtotalEstimacion(estimacion)
    const retencion = subtotal * (Number(estimacion.retencion_porcentaje) / 100)
    return subtotal - retencion
  }

  function amortizacionEstimacion(estimacion: Estimacion): number {
    return netoEstimacion(estimacion) * (Number(anticipo) / 100)
  }

  function cobradoDeEstimacion(estimacionId: string): number {
    return cobros
      .filter((cobro) => cobro.estimacion_id === estimacionId)
      .reduce((total, cobro) => total + Number(cobro.monto), 0)
  }

  const contrato = Number(montoContrato) || 0
  const anticipoPorcentaje = Number(anticipo) || 0
  const anticipoEsperado = contrato * (anticipoPorcentaje / 100)
  const totalEstimado = estimaciones.reduce(
    (total, estimacion) => total + netoEstimacion(estimacion),
    0,
  )
  const amortizacionTotal = totalEstimado * (anticipoPorcentaje / 100)
  const cobrado = cobros.reduce((total, cobro) => total + Number(cobro.monto), 0)
  const cobradoAnticipo = cobros
    .filter((cobro) => cobro.tipo === 'anticipo')
    .reduce((total, cobro) => total + Number(cobro.monto), 0)
  const porCobrar = contrato - cobrado
  const liquidacionEsperada = Math.max(contrato - totalEstimado, 0)

  const estimacionesPorCobrar = estimaciones.filter(
    (estimacion) =>
      (estimacion.estado === 'autorizada' || estimacion.estado === 'pagada') &&
      cobradoDeEstimacion(estimacion.id) < netoEstimacion(estimacion) - 0.01,
  )

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (contrato < 0 || anticipoPorcentaje < 0 || anticipoPorcentaje > 100) {
      setAviso({ tipo: 'error', texto: 'Revisa el monto y el porcentaje de anticipo.' })
      return
    }

    setGuardando(true)
    setAviso(null)
    try {
      await guardarPresupuesto(
        proyectoId,
        contrato,
        anticipoPorcentaje,
        notas.trim() === '' ? null : notas.trim(),
      )
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Presupuesto guardado.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardando(false)
    }
  }

  function prepararEstimacion(estimacion: Estimacion) {
    const pendiente = netoEstimacion(estimacion) - cobradoDeEstimacion(estimacion.id)
    setTipo('estimacion')
    setEstimacionId(estimacion.id)
    setMonto(Math.max(pendiente, 0).toFixed(2))
    setReferencia(`EST-${estimacion.numero}`)
  }

  function prepararAnticipo() {
    setTipo('anticipo')
    setEstimacionId('')
    setMonto(Math.max(anticipoEsperado - cobradoAnticipo, 0).toFixed(2))
    setReferencia('Anticipo')
  }

  function prepararLiquidacion() {
    setTipo('liquidacion')
    setEstimacionId('')
    setMonto(Math.max(liquidacionEsperada, 0).toFixed(2))
    setReferencia('Liquidación')
  }

  async function registrarCobro(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const montoNumero = Number(monto)
    if (!Number.isFinite(montoNumero) || montoNumero <= 0) {
      setAviso({ tipo: 'error', texto: 'El monto debe ser mayor que cero.' })
      return
    }

    setGuardando(true)
    setAviso(null)
    try {
      await crearCobroCliente({
        proyectoId,
        estimacionId: estimacionId === '' ? null : estimacionId,
        tipo,
        monto: Math.round(montoNumero * 100) / 100,
        fecha,
        referencia: referencia.trim() === '' ? null : referencia.trim(),
        nota: nota.trim() === '' ? null : nota.trim(),
      })
      consulta.recargar()
      setMonto('')
      setReferencia('')
      setNota('')
      setEstimacionId('')
      setAviso({ tipo: 'exito', texto: 'Cobro registrado.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardando(false)
    }
  }

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Presupuesto</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar el presupuesto.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Presupuesto y cobros</h1>
          <p className="subtitulo">
            Monto contractual, anticipo, pagos por estimación y liquidación del cliente.
          </p>
        </div>
      </div>

      {proyectosConsulta.error ? (
        <Aviso tipo="error">{proyectosConsulta.error}</Aviso>
      ) : null}

      {proyectos.length === 0 && !proyectosConsulta.cargando ? (
        <div className="tarjeta tarjeta--plana">
          <Vacio titulo="No tienes obras asignadas">
            Pide al administrador que te agregue al equipo de una obra.
          </Vacio>
        </div>
      ) : (
        <>
          <section className="tarjeta tarjeta--plana">
            <div className="filtros">
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="presupuesto-proyecto">
                  Obra
                </label>
                <select
                  id="presupuesto-proyecto"
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
                Los cobros son ingresos del cliente; no se mezclan con los pagos a proveedores.
              </span>
            </div>
          </section>

          {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}

          {consulta.cargando && !datos ? (
            <Cargando />
          ) : (
            <>
              <section className="rejilla-kpi">
                <article className="kpi">
                  <p className="kpi__etiqueta">Contrato</p>
                  <p className="kpi__valor">{formatearMoneda(contrato)}</p>
                  <p className="kpi__nota">Presupuesto del cliente</p>
                </article>
                <article className="kpi">
                  <p className="kpi__etiqueta">Anticipo</p>
                  <p className="kpi__valor">{formatearMoneda(anticipoEsperado)}</p>
                  <p className="kpi__nota">
                    {anticipoPorcentaje.toFixed(2)}% · cobrado{' '}
                    {formatearMoneda(cobradoAnticipo)}
                  </p>
                </article>
                <article className="kpi">
                  <p className="kpi__etiqueta">Cobrado</p>
                  <p className="kpi__valor">{formatearMoneda(cobrado)}</p>
                  <p className="kpi__nota">Acumulado del cliente</p>
                </article>
                <article className="kpi">
                  <p className="kpi__etiqueta">Saldo por cobrar</p>
                  <p className="kpi__valor">{formatearMoneda(porCobrar)}</p>
                  <p className="kpi__nota">Contrato menos cobrado</p>
                </article>
                <article className="kpi">
                  <p className="kpi__etiqueta">Estimado neto</p>
                  <p className="kpi__valor">{formatearMoneda(totalEstimado)}</p>
                  <p className="kpi__nota">
                    Amortización de anticipo {formatearMoneda(amortizacionTotal)}
                  </p>
                </article>
                <article className="kpi">
                  <p className="kpi__etiqueta">Liquidación estimada</p>
                  <p className="kpi__valor">{formatearMoneda(liquidacionEsperada)}</p>
                  <p className="kpi__nota">Contrato menos estimado</p>
                </article>
              </section>

              {puedeCrear ? (
                <section className="tarjeta">
                  <div className="seccion__cabecera">
                    <div>
                      <h2 className="seccion__titulo">Datos del contrato</h2>
                      <p className="seccion__nota">
                        Monto que entrega el cliente y porcentaje de anticipo.
                      </p>
                    </div>
                  </div>

                  <form className="formulario" onSubmit={(evento) => void guardar(evento)}>
                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="presupuesto-monto">
                        Monto del contrato
                      </label>
                      <input
                        id="presupuesto-monto"
                        className="campo__control"
                        inputMode="decimal"
                        value={montoContrato}
                        onChange={(evento) => setMontoContrato(evento.target.value)}
                      />
                    </div>

                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="presupuesto-anticipo">
                        Anticipo %
                      </label>
                      <input
                        id="presupuesto-anticipo"
                        className="campo__control"
                        inputMode="decimal"
                        value={anticipo}
                        onChange={(evento) => setAnticipo(evento.target.value)}
                      />
                    </div>

                    <div className="campo campo--ancho">
                      <label className="campo__etiqueta" htmlFor="presupuesto-notas">
                        Notas
                      </label>
                      <textarea
                        id="presupuesto-notas"
                        className="campo__control"
                        rows={2}
                        value={notas}
                        onChange={(evento) => setNotas(evento.target.value)}
                      />
                    </div>

                    <div className="acciones campo--ancho">
                      <button
                        type="submit"
                        className="boton boton--primario"
                        disabled={guardando}
                      >
                        {guardando ? 'Guardando…' : 'Guardar presupuesto'}
                      </button>
                    </div>
                  </form>
                </section>
              ) : null}

              {estimacionesPorCobrar.length > 0 ? (
                <section className="tarjeta tarjeta--plana">
                  <div className="seccion__cabecera">
                    <div>
                      <h2 className="seccion__titulo">Estimaciones por cobrar</h2>
                      <p className="seccion__nota">
                        Cortes autorizados o pagados al contratista, pendientes de cobro al
                        cliente.
                      </p>
                    </div>
                  </div>

                  <div className="tabla-marco">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Estimación</th>
                          <th scope="col">Neto</th>
                          <th scope="col">Amortización</th>
                          <th scope="col">Cobrado</th>
                          <th scope="col">Pendiente</th>
                          <th scope="col" aria-label="Acciones" />
                        </tr>
                      </thead>
                      <tbody>
                        {estimacionesPorCobrar.map((estimacion) => (
                          <tr key={estimacion.id}>
                            <td>{estimacion.numero}</td>
                            <td>{formatearMoneda(netoEstimacion(estimacion))}</td>
                            <td>{formatearMoneda(amortizacionEstimacion(estimacion))}</td>
                            <td>{formatearMoneda(cobradoDeEstimacion(estimacion.id))}</td>
                            <td>
                              {formatearMoneda(
                                netoEstimacion(estimacion) -
                                  cobradoDeEstimacion(estimacion.id),
                              )}
                            </td>
                            <td>
                              {puedeCrear ? (
                                <button
                                  type="button"
                                  className="boton boton--primario"
                                  onClick={() => prepararEstimacion(estimacion)}
                                >
                                  Cobrar estimación
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {puedeCrear ? (
                <section className="tarjeta">
                  <div className="seccion__cabecera">
                    <div>
                      <h2 className="seccion__titulo">Registrar cobro</h2>
                      <p className="seccion__nota">
                        Anticipo, pago por estimación o liquidación.
                      </p>
                    </div>
                    <div className="acciones">
                      <button type="button" className="boton" onClick={prepararAnticipo}>
                        Preparar anticipo
                      </button>
                      <button type="button" className="boton" onClick={prepararLiquidacion}>
                        Preparar liquidación
                      </button>
                    </div>
                  </div>

                  <form
                    className="formulario"
                    onSubmit={(evento) => void registrarCobro(evento)}
                  >
                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="cobro-tipo">
                        Tipo
                      </label>
                      <select
                        id="cobro-tipo"
                        className="campo__control"
                        value={tipo}
                        onChange={(evento) => setTipo(evento.target.value as TipoCobro)}
                      >
                        {Object.entries(TIPO_COBRO).map(([valor, etiqueta]) => (
                          <option key={valor} value={valor}>
                            {etiqueta}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="cobro-estimacion">
                        Estimación
                      </label>
                      <select
                        id="cobro-estimacion"
                        className="campo__control"
                        value={estimacionId}
                        onChange={(evento) => setEstimacionId(evento.target.value)}
                      >
                        <option value="">Sin estimación</option>
                        {estimaciones.map((estimacion) => (
                          <option key={estimacion.id} value={estimacion.id}>
                            {estimacion.numero}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="cobro-monto">
                        Monto
                      </label>
                      <input
                        id="cobro-monto"
                        className="campo__control"
                        inputMode="decimal"
                        value={monto}
                        onChange={(evento) => setMonto(evento.target.value)}
                      />
                    </div>

                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="cobro-fecha">
                        Fecha
                      </label>
                      <input
                        id="cobro-fecha"
                        className="campo__control"
                        type="date"
                        value={fecha}
                        onChange={(evento) => {
                          if (evento.target.value !== '') setFecha(evento.target.value)
                        }}
                      />
                    </div>

                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="cobro-referencia">
                        Referencia
                      </label>
                      <input
                        id="cobro-referencia"
                        className="campo__control"
                        value={referencia}
                        onChange={(evento) => setReferencia(evento.target.value)}
                      />
                    </div>

                    <div className="campo campo--ancho">
                      <label className="campo__etiqueta" htmlFor="cobro-nota">
                        Nota
                      </label>
                      <input
                        id="cobro-nota"
                        className="campo__control"
                        value={nota}
                        onChange={(evento) => setNota(evento.target.value)}
                      />
                    </div>

                    <div className="acciones campo--ancho">
                      <button
                        type="submit"
                        className="boton boton--primario"
                        disabled={guardando}
                      >
                        {guardando ? 'Guardando…' : 'Registrar cobro'}
                      </button>
                    </div>
                  </form>
                </section>
              ) : null}

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Cobros registrados</h2>
                    <p className="seccion__nota">Del más reciente al más antiguo.</p>
                  </div>
                </div>

                {cobros.length === 0 ? (
                  <Vacio titulo="Sin cobros">Registra el anticipo o el primer cobro.</Vacio>
                ) : (
                  <div className="tabla-marco">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Fecha</th>
                          <th scope="col">Tipo</th>
                          <th scope="col">Estimación</th>
                          <th scope="col">Monto</th>
                          <th scope="col">Referencia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cobros.map((cobro) => (
                          <tr key={cobro.id}>
                            <td>{formatearFecha(cobro.fecha)}</td>
                            <td>{TIPO_COBRO[cobro.tipo]}</td>
                            <td>
                              {estimaciones.find(
                                (estimacion) => estimacion.id === cobro.estimacion_id,
                              )?.numero ?? '—'}
                            </td>
                            <td>{formatearMoneda(Number(cobro.monto))}</td>
                            <td>{cobro.referencia ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
