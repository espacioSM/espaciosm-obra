import { useEffect, useState } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import {
  listarAsistencia,
  listarAvancesGenerador,
  listarBitacora,
  listarDirectorio,
  listarEstimaciones,
  listarGeneradores,
  listarMateriales,
  listarMovimientosMaterial,
  listarPagos,
  listarPartidasEstimacion,
  listarProyectos,
} from '../datos/consultas'
import { formatearFecha, formatearMoneda, hoyISO } from '../lib/formato'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'
import { InsigniaEstado } from '../componentes/Insignias'

export function Reportes() {
  const { permisos } = useSesion()
  const proyectosConsulta = useDatos(listarProyectos, [])
  const proyectos = proyectosConsulta.datos ?? []
  const [proyectoId, setProyectoId] = useState('')

  useEffect(() => {
    if (proyectoId === '' && proyectos.length > 0) {
      setProyectoId(proyectos[0].id)
    }
  }, [proyectoId, proyectos])

  const puedeVer = permisos.reportes?.ver === true
  const puedeVerEstimaciones = permisos.estimaciones?.ver === true
  const puedeVerPagos = permisos.pagos?.ver === true

  const consulta = useDatos(async () => {
    if (proyectoId === '') return null

    const [directorio, asistencia, materiales, movimientos, generadores, avances, bitacora] =
      await Promise.all([
        listarDirectorio(proyectoId),
        listarAsistencia(proyectoId, hoyISO()),
        listarMateriales(proyectoId),
        listarMovimientosMaterial(proyectoId),
        listarGeneradores(proyectoId),
        listarAvancesGenerador(proyectoId),
        listarBitacora(proyectoId),
      ])

    const estimaciones = puedeVerEstimaciones
      ? await listarEstimaciones(proyectoId)
      : []
    const partidas = puedeVerEstimaciones
      ? (await Promise.all(estimaciones.map((estimacion) => listarPartidasEstimacion(estimacion.id)))).flat()
      : []
    const pagos = puedeVerPagos ? await listarPagos(proyectoId) : []

    return {
      proyectoId,
      directorio,
      asistencia,
      materiales,
      movimientos,
      generadores,
      avances,
      bitacora,
      estimaciones,
      partidas,
      pagos,
    }
  }, [proyectoId, puedeVerEstimaciones, puedeVerPagos])

  const datos = consulta.datos
  const proyecto = proyectos.find((item) => item.id === proyectoId)

  const personalActivo = datos?.directorio.filter((persona) => persona.activo).length ?? 0
  const asistenciasHoy = datos?.asistencia.length ?? 0
  const materiales = datos?.materiales ?? []
  const movimientos = datos?.movimientos ?? []
  const generadores = datos?.generadores ?? []
  const avances = datos?.avances ?? []
  const estimaciones = datos?.estimaciones ?? []
  const partidas = datos?.partidas ?? []
  const pagos = datos?.pagos ?? []
  const bitacora = datos?.bitacora ?? []

  const stock = materiales.map((material) => {
    const existencia = movimientos
      .filter((movimiento) => movimiento.material_id === material.id)
      .reduce(
        (total, movimiento) =>
          total +
          (movimiento.tipo === 'entrada'
            ? Number(movimiento.cantidad)
            : -Number(movimiento.cantidad)),
        0,
      )
    return { material, existencia }
  })

  const ejecutadoPorGenerador = new Map<string, number>()
  for (const avance of avances) {
    if (avance.estado !== 'validado') continue
    ejecutadoPorGenerador.set(
      avance.generador_id,
      (ejecutadoPorGenerador.get(avance.generador_id) ?? 0) + Number(avance.cantidad),
    )
  }

  const contratado = generadores.reduce(
    (total, generador) =>
      total + Number(generador.cantidad) * Number(generador.precio_unitario),
    0,
  )
  const ejecutado = generadores.reduce(
    (total, generador) =>
      total +
      (ejecutadoPorGenerador.get(generador.id) ?? 0) *
        Number(generador.precio_unitario),
    0,
  )
  const avanceGeneral = contratado > 0 ? (ejecutado / contratado) * 100 : 0
  const totalEstimado = partidas.reduce(
    (total, partida) => total + Number(partida.importe),
    0,
  )
  const totalPagado = pagos.reduce((total, pago) => total + Number(pago.monto), 0)

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Reportes</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar reportes.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina reporte">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Reporte de obra</h1>
          <p className="subtitulo">
            Resumen ejecutivo al {formatearFecha(hoyISO())}. Listo para imprimir o guardar
            en PDF.
          </p>
        </div>
        <div className="acciones">
          <button
            type="button"
            className="boton boton--primario"
            onClick={() => window.print()}
          >
            Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      {proyectosConsulta.error ? (
        <Aviso tipo="error">{proyectosConsulta.error}</Aviso>
      ) : null}

      {proyectos.length === 0 && !proyectosConsulta.cargando ? (
        <div className="tarjeta tarjeta--plana">
          <Vacio titulo="No tienes obras asignadas">
            Pide al administrador que te agregue al equipo de una obra para consultar
            reportes.
          </Vacio>
        </div>
      ) : (
        <>
          <section className="tarjeta tarjeta--plana">
            <div className="filtros">
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="reportes-proyecto">
                  Obra
                </label>
                <select
                  id="reportes-proyecto"
                  className="campo__control"
                  value={proyectoId}
                  onChange={(evento) => setProyectoId(evento.target.value)}
                >
                  {proyectos.map((obra) => (
                    <option key={obra.id} value={obra.id}>
                      {obra.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {proyecto ? (
                <span className="seccion__nota">
                  {proyecto.ubicacion ?? 'Sin ubicación'} ·{' '}
                  <InsigniaEstado estado={proyecto.estado} />
                </span>
              ) : null}
            </div>
          </section>

          {consulta.cargando && !datos ? (
            <Cargando />
          ) : (
            <>
              <section className="rejilla-kpi">
                <article className="kpi">
                  <p className="kpi__etiqueta">Personal activo</p>
                  <p className="kpi__valor">{personalActivo}</p>
                  <p className="kpi__nota">En la obra</p>
                </article>
                <article className="kpi">
                  <p className="kpi__etiqueta">Asistencias de hoy</p>
                  <p className="kpi__valor">{asistenciasHoy}</p>
                  <p className="kpi__nota">Registros del día</p>
                </article>
                <article className="kpi">
                  <p className="kpi__etiqueta">Avance de obra</p>
                  <p className="kpi__valor">{avanceGeneral.toFixed(1)}%</p>
                  <p className="kpi__nota">
                    {formatearMoneda(ejecutado)} de {formatearMoneda(contratado)}
                  </p>
                </article>
                {puedeVerPagos ? (
                  <article className="kpi">
                    <p className="kpi__etiqueta">Pagado</p>
                    <p className="kpi__valor">{formatearMoneda(totalPagado)}</p>
                    <p className="kpi__nota">Acumulado</p>
                  </article>
                ) : null}
              </section>

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Generadores</h2>
                    <p className="seccion__nota">Avance validado por concepto.</p>
                  </div>
                </div>

                {generadores.length === 0 ? (
                  <Vacio titulo="Sin generadores">Agrega conceptos al generador.</Vacio>
                ) : (
                  <div className="tabla-marco">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Clave</th>
                          <th scope="col">Concepto</th>
                          <th scope="col">Contratado</th>
                          <th scope="col">Ejecutado</th>
                          <th scope="col">Avance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generadores.map((generador) => {
                          const cantidadEjecutada =
                            ejecutadoPorGenerador.get(generador.id) ?? 0
                          const porcentaje =
                            Number(generador.cantidad) > 0
                              ? (cantidadEjecutada / Number(generador.cantidad)) * 100
                              : 0
                          return (
                            <tr key={generador.id}>
                              <td>{generador.clave ?? '—'}</td>
                              <td>{generador.descripcion}</td>
                              <td>
                                {Number(generador.cantidad).toFixed(2)}{' '}
                                {generador.unidad}
                              </td>
                              <td>
                                {cantidadEjecutada.toFixed(2)} {generador.unidad}
                              </td>
                              <td>{porcentaje.toFixed(1)}%</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <div className="rejilla-dos">
                <section className="tarjeta tarjeta--plana">
                  <div className="seccion__cabecera">
                    <div>
                      <h2 className="seccion__titulo">Materiales</h2>
                      <p className="seccion__nota">Existencia actual.</p>
                    </div>
                  </div>

                  {stock.length === 0 ? (
                    <Vacio titulo="Sin materiales">El catálogo está vacío.</Vacio>
                  ) : (
                    <div className="tabla-marco">
                      <table className="tabla">
                        <thead>
                          <tr>
                            <th scope="col">Material</th>
                            <th scope="col">Existencia</th>
                            <th scope="col">Último precio</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stock.map(({ material, existencia }) => (
                            <tr key={material.id}>
                              <td>{material.nombre}</td>
                              <td>
                                {existencia.toFixed(2)} {material.unidad}
                              </td>
                              <td>
                                {material.ultimo_precio !== null
                                  ? formatearMoneda(Number(material.ultimo_precio))
                                  : formatearMoneda(Number(material.costo_unitario))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="tarjeta tarjeta--plana">
                  <div className="seccion__cabecera">
                    <div>
                      <h2 className="seccion__titulo">Bitácora</h2>
                      <p className="seccion__nota">Últimas entradas.</p>
                    </div>
                  </div>

                  {bitacora.length === 0 ? (
                    <Vacio titulo="Sin entradas">La bitácora está vacía.</Vacio>
                  ) : (
                    <ul className="lista-simple">
                      {bitacora.slice(0, 5).map((entrada) => (
                        <li key={entrada.id}>
                          <span>
                            <span className="celda-principal">{entrada.titulo}</span>
                            <span className="celda-nota">
                              {formatearFecha(entrada.fecha)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {puedeVerEstimaciones ? (
                <section className="tarjeta tarjeta--plana">
                  <div className="seccion__cabecera">
                    <div>
                      <h2 className="seccion__titulo">Estimaciones</h2>
                      <p className="seccion__nota">
                        Total estimado: {formatearMoneda(totalEstimado)}
                      </p>
                    </div>
                  </div>

                  {estimaciones.length === 0 ? (
                    <Vacio titulo="Sin estimaciones">No hay cortes registrados.</Vacio>
                  ) : (
                    <div className="tabla-marco">
                      <table className="tabla">
                        <thead>
                          <tr>
                            <th scope="col">Número</th>
                            <th scope="col">Periodo</th>
                            <th scope="col">Estado</th>
                            <th scope="col">Partidas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {estimaciones.map((estimacion) => {
                            const delCorte = partidas.filter(
                              (partida) => partida.estimacion_id === estimacion.id,
                            )
                            return (
                              <tr key={estimacion.id}>
                                <td>{estimacion.numero}</td>
                                <td>
                                  {formatearFecha(estimacion.fecha_inicio)} —{' '}
                                  {formatearFecha(estimacion.fecha_fin)}
                                </td>
                                <td>{estimacion.estado}</td>
                                <td>
                                  {formatearMoneda(
                                    delCorte.reduce(
                                      (total, partida) => total + Number(partida.importe),
                                      0,
                                    ),
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ) : null}

              {puedeVerPagos ? (
                <section className="tarjeta tarjeta--plana">
                  <div className="seccion__cabecera">
                    <div>
                      <h2 className="seccion__titulo">Pagos</h2>
                      <p className="seccion__nota">
                        Total pagado: {formatearMoneda(totalPagado)}
                      </p>
                    </div>
                  </div>

                  {pagos.length === 0 ? (
                    <Vacio titulo="Sin pagos">No hay pagos registrados.</Vacio>
                  ) : (
                    <div className="tabla-marco">
                      <table className="tabla">
                        <thead>
                          <tr>
                            <th scope="col">Fecha</th>
                            <th scope="col">Beneficiario</th>
                            <th scope="col">Concepto</th>
                            <th scope="col">Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagos.map((pago) => (
                            <tr key={pago.id}>
                              <td>{formatearFecha(pago.fecha)}</td>
                              <td>{pago.beneficiario}</td>
                              <td>{pago.concepto}</td>
                              <td>{formatearMoneda(Number(pago.monto))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
