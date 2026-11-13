import { useEffect, useState, type FormEvent } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import {
  crearPago,
  listarEstimaciones,
  listarPagos,
  listarPartidasEstimacion,
  listarProyectos,
} from '../datos/consultas'
import type { Estimacion, EstimacionPartida, MetodoPago, TipoPago } from '../lib/tipos'
import { formatearFecha, formatearMoneda, hoyISO } from '../lib/formato'
import { mensajeDeError } from '../lib/errores'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'

const TIPO: Record<TipoPago, string> = {
  personal: 'Personal',
  proveedor: 'Proveedor',
  contratista: 'Contratista',
  otro: 'Otro',
}

const METODO: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  otro: 'Otro',
}

export function Pagos() {
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
      return { pagos: [], estimaciones: [], partidas: [] }
    }
    const [pagos, estimaciones] = await Promise.all([
      listarPagos(proyectoId),
      listarEstimaciones(proyectoId),
    ])
    const partidas = (
      await Promise.all(
        estimaciones.map((estimacion) => listarPartidasEstimacion(estimacion.id)),
      )
    ).flat()
    return { pagos, estimaciones, partidas }
  }, [proyectoId])
  const pagos = consulta.datos?.pagos ?? []
  const estimaciones = consulta.datos?.estimaciones ?? []
  const partidas = consulta.datos?.partidas ?? []
  const puedeVer = permisos.pagos?.ver === true
  const puedeCrear = permisos.pagos?.crear === true

  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(
    null,
  )
  const [guardando, setGuardando] = useState(false)
  const [estimacionId, setEstimacionId] = useState('')
  const [tipo, setTipo] = useState<TipoPago>('proveedor')
  const [beneficiario, setBeneficiario] = useState('')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [metodo, setMetodo] = useState<MetodoPago>('transferencia')
  const [referencia, setReferencia] = useState('')
  const [nota, setNota] = useState('')

  const total = pagos.reduce((suma, pago) => suma + Number(pago.monto), 0)
  const pendientes = estimaciones.filter(
    (estimacion) => estimacion.estado === 'autorizada',
  )

  function totalEstimacion(estimacion: Estimacion): number {
    const delCorte = partidas.filter(
      (partida: EstimacionPartida) => partida.estimacion_id === estimacion.id,
    )
    const subtotal = delCorte.reduce(
      (suma, partida) => suma + Number(partida.importe),
      0,
    )
    const retencion = subtotal * (Number(estimacion.retencion_porcentaje) / 100)
    return subtotal - retencion
  }

  function prepararPagoEstimacion(estimacion: Estimacion) {
    const totalCorte = totalEstimacion(estimacion)
    setEstimacionId(estimacion.id)
    setConcepto(`Estimación ${estimacion.numero}`)
    setMonto(totalCorte.toFixed(2))
    setReferencia(`EST-${estimacion.numero}`)
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (beneficiario.trim() === '' || concepto.trim() === '') {
      setAviso({ tipo: 'error', texto: 'Captura beneficiario y concepto.' })
      return
    }

    const montoNumero = Number(monto)
    if (!Number.isFinite(montoNumero) || montoNumero <= 0) {
      setAviso({ tipo: 'error', texto: 'El monto debe ser mayor que cero.' })
      return
    }

    setGuardando(true)
    setAviso(null)

    try {
      await crearPago({
        proyectoId,
        estimacionId: estimacionId === '' ? null : estimacionId,
        tipo,
        beneficiario: beneficiario.trim(),
        concepto: concepto.trim(),
        monto: Math.round(montoNumero * 100) / 100,
        fecha,
        metodo,
        referencia: referencia.trim() === '' ? null : referencia.trim(),
        nota: nota.trim() === '' ? null : nota.trim(),
      })
      setBeneficiario('')
      setConcepto('')
      setMonto('')
      setReferencia('')
      setNota('')
      setEstimacionId('')
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Pago registrado.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardando(false)
    }
  }

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Pagos</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar pagos.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Pagos</h1>
          <p className="subtitulo">
            Pagos a personal, proveedores y contratistas por obra.
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
            sus pagos.
          </Vacio>
        </div>
      ) : (
        <>
          <section className="tarjeta tarjeta--plana">
            <div className="filtros">
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="pagos-proyecto">
                  Obra
                </label>
                <select
                  id="pagos-proyecto"
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

              <span className="seccion__nota">{pagos.length} pagos</span>
            </div>
          </section>

          {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}

          <section className="rejilla-kpi">
            <article className="kpi">
              <p className="kpi__etiqueta">Total pagado</p>
              <p className="kpi__valor">{formatearMoneda(total)}</p>
              <p className="kpi__nota">Acumulado de la obra</p>
            </article>
            <article className="kpi">
              <p className="kpi__etiqueta">Pagos registrados</p>
              <p className="kpi__valor">{pagos.length}</p>
              <p className="kpi__nota">En el periodo consultado</p>
            </article>
          </section>

          {puedeCrear && pendientes.length > 0 ? (
            <section className="tarjeta">
              <div className="seccion__cabecera">
                <div>
                  <h2 className="seccion__titulo">Estimaciones por pagar</h2>
                  <p className="seccion__nota">
                    Cortes autorizados pendientes de registrar su pago.
                  </p>
                </div>
              </div>

              <div className="tabla-marco">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Estimación</th>
                      <th scope="col">Periodo</th>
                      <th scope="col">Total</th>
                      <th scope="col" aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {pendientes.map((estimacion) => (
                      <tr key={estimacion.id}>
                        <td>{estimacion.numero}</td>
                        <td>
                          {formatearFecha(estimacion.fecha_inicio)} —{' '}
                          {formatearFecha(estimacion.fecha_fin)}
                        </td>
                        <td>{formatearMoneda(totalEstimacion(estimacion))}</td>
                        <td>
                          <button
                            type="button"
                            className="boton boton--primario"
                            onClick={() => prepararPagoEstimacion(estimacion)}
                          >
                            Registrar pago
                          </button>
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
                  <h2 className="seccion__titulo">Nuevo pago</h2>
                  <p className="seccion__nota">
                    Captura el pago y su referencia. Solo administración puede
                    registrarlo.
                  </p>
                </div>
              </div>

              <form className="formulario" onSubmit={(evento) => void guardar(evento)}>
                <div className="campo campo--ancho">
                  <label className="campo__etiqueta" htmlFor="pago-estimacion">
                    Estimación por pagar
                  </label>
                  <select
                    id="pago-estimacion"
                    className="campo__control"
                    value={estimacionId}
                    onChange={(evento) => {
                      const id = evento.target.value
                      setEstimacionId(id)
                      const estimacion = pendientes.find((item) => item.id === id)
                      if (estimacion) prepararPagoEstimacion(estimacion)
                    }}
                  >
                    <option value="">Pago general (sin estimación)</option>
                    {pendientes.map((estimacion) => (
                      <option key={estimacion.id} value={estimacion.id}>
                        {estimacion.numero} ·{' '}
                        {formatearMoneda(totalEstimacion(estimacion))}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="pago-tipo">
                    Tipo
                  </label>
                  <select
                    id="pago-tipo"
                    className="campo__control"
                    value={tipo}
                    onChange={(evento) => setTipo(evento.target.value as TipoPago)}
                  >
                    <option value="personal">Personal</option>
                    <option value="proveedor">Proveedor</option>
                    <option value="contratista">Contratista</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="pago-fecha">
                    Fecha
                  </label>
                  <input
                    id="pago-fecha"
                    className="campo__control"
                    type="date"
                    max={hoyISO()}
                    value={fecha}
                    onChange={(evento) => {
                      if (evento.target.value !== '') setFecha(evento.target.value)
                    }}
                  />
                </div>

                <div className="campo campo--ancho">
                  <label className="campo__etiqueta" htmlFor="pago-beneficiario">
                    Beneficiario
                  </label>
                  <input
                    id="pago-beneficiario"
                    className="campo__control"
                    value={beneficiario}
                    onChange={(evento) => setBeneficiario(evento.target.value)}
                    placeholder="Nombre o razón social"
                  />
                </div>

                <div className="campo campo--ancho">
                  <label className="campo__etiqueta" htmlFor="pago-concepto">
                    Concepto
                  </label>
                  <input
                    id="pago-concepto"
                    className="campo__control"
                    value={concepto}
                    onChange={(evento) => setConcepto(evento.target.value)}
                    placeholder="Estimación, material, destajo…"
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="pago-monto">
                    Monto
                  </label>
                  <input
                    id="pago-monto"
                    className="campo__control"
                    inputMode="decimal"
                    value={monto}
                    onChange={(evento) => setMonto(evento.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="pago-metodo">
                    Método
                  </label>
                  <select
                    id="pago-metodo"
                    className="campo__control"
                    value={metodo}
                    onChange={(evento) => setMetodo(evento.target.value as MetodoPago)}
                  >
                    <option value="transferencia">Transferencia</option>
                    <option value="efectivo">Efectivo</option>
                    <option value="cheque">Cheque</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="pago-referencia">
                    Referencia
                  </label>
                  <input
                    id="pago-referencia"
                    className="campo__control"
                    value={referencia}
                    onChange={(evento) => setReferencia(evento.target.value)}
                    placeholder="Folio, transferencia o factura"
                  />
                </div>

                <div className="campo campo--ancho">
                  <label className="campo__etiqueta" htmlFor="pago-nota">
                    Nota
                  </label>
                  <input
                    id="pago-nota"
                    className="campo__control"
                    value={nota}
                    onChange={(evento) => setNota(evento.target.value)}
                    placeholder="Opcional"
                  />
                </div>

                <div className="acciones campo--ancho">
                  <button
                    type="submit"
                    className="boton boton--primario"
                    disabled={guardando}
                  >
                    {guardando ? 'Guardando…' : 'Registrar pago'}
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <Aviso tipo="info">Solo consulta. El registro de pagos es de administración.</Aviso>
          )}

          {consulta.cargando && !consulta.datos ? (
            <Cargando />
          ) : pagos.length === 0 ? (
            <div className="tarjeta tarjeta--plana">
              <Vacio titulo="Sin pagos">
                Cuando registres un pago aparecerá aquí.
              </Vacio>
            </div>
          ) : (
            <section className="tarjeta tarjeta--plana">
              <div className="seccion__cabecera">
                <div>
                  <h2 className="seccion__titulo">Pagos registrados</h2>
                  <p className="seccion__nota">Ordenados del más reciente al más antiguo.</p>
                </div>
              </div>

              <div className="tabla-marco">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">Estimación</th>
                      <th scope="col">Tipo</th>
                      <th scope="col">Beneficiario</th>
                      <th scope="col">Concepto</th>
                      <th scope="col">Monto</th>
                      <th scope="col">Método</th>
                      <th scope="col">Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((pago) => (
                      <tr key={pago.id}>
                        <td>{formatearFecha(pago.fecha)}</td>
                        <td>
                          {estimaciones.find(
                            (estimacion) => estimacion.id === pago.estimacion_id,
                          )?.numero ?? '—'}
                        </td>
                        <td>{TIPO[pago.tipo]}</td>
                        <td>{pago.beneficiario}</td>
                        <td>{pago.concepto}</td>
                        <td>{formatearMoneda(Number(pago.monto))}</td>
                        <td>{METODO[pago.metodo]}</td>
                        <td>{pago.referencia ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
