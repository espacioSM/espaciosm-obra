import type { FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import {
  crearAvanceGenerador,
  crearGenerador,
  listarAvancesGenerador,
  listarGeneradores,
  listarProyectos,
} from '../datos/consultas'
import { formatearFecha, formatearMoneda, hoyISO } from '../lib/formato'
import { mensajeDeError } from '../lib/errores'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'

export function Generadores() {
  const { sesion, permisos } = useSesion()
  const usuarioId = sesion?.user.id ?? null
  const proyectosConsulta = useDatos(listarProyectos, [])
  const proyectos = proyectosConsulta.datos ?? []
  const [proyectoId, setProyectoId] = useState('')

  useEffect(() => {
    if (proyectoId === '' && proyectos.length > 0) {
      setProyectoId(proyectos[0].id)
    }
  }, [proyectoId, proyectos])

  const consulta = useDatos(async () => {
    if (proyectoId === '') return { generadores: [], avances: [] }
    const [generadores, avances] = await Promise.all([
      listarGeneradores(proyectoId),
      listarAvancesGenerador(proyectoId),
    ])
    return { generadores, avances }
  }, [proyectoId])

  const generadores = consulta.datos?.generadores ?? []
  const avances = consulta.datos?.avances ?? []
  const puedeVer = permisos.generadores?.ver === true
  const puedeCrear = permisos.generadores?.crear === true

  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(
    null,
  )
  const [guardandoGenerador, setGuardandoGenerador] = useState(false)
  const [guardandoAvance, setGuardandoAvance] = useState(false)

  const [clave, setClave] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [unidad, setUnidad] = useState('m2')
  const [cantidad, setCantidad] = useState('')
  const [precio, setPrecio] = useState('')

  const [generadorId, setGeneradorId] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [cantidadAvance, setCantidadAvance] = useState('')
  const [nota, setNota] = useState('')

  useEffect(() => {
    if (generadores.length === 0) {
      setGeneradorId('')
      return
    }

    if (!generadores.some((generador) => generador.id === generadorId)) {
      setGeneradorId(generadores[0].id)
    }
  }, [generadores, generadorId])

  const ejecutadoPorGenerador = new Map<string, number>()
  for (const avance of avances) {
    ejecutadoPorGenerador.set(
      avance.generador_id,
      (ejecutadoPorGenerador.get(avance.generador_id) ?? 0) + Number(avance.cantidad),
    )
  }

  const filas = generadores.map((generador) => {
    const ejecutado = ejecutadoPorGenerador.get(generador.id) ?? 0
    const importe = Number(generador.cantidad) * Number(generador.precio_unitario)
    const importeEjecutado = ejecutado * Number(generador.precio_unitario)
    const porcentaje = importe > 0 ? (importeEjecutado / importe) * 100 : 0
    return { generador, ejecutado, importe, importeEjecutado, porcentaje }
  })

  const contratado = filas.reduce((total, fila) => total + fila.importe, 0)
  const ejecutadoTotal = filas.reduce((total, fila) => total + fila.importeEjecutado, 0)
  const avanceGeneral = contratado > 0 ? (ejecutadoTotal / contratado) * 100 : 0
  const generadorSeleccionado = generadores.find(
    (generador) => generador.id === generadorId,
  )

  async function guardarGenerador(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (descripcion.trim() === '') {
      setAviso({ tipo: 'error', texto: 'Escribe la descripción del concepto.' })
      return
    }

    const cantidadNumero = Number(cantidad)
    const precioNumero = Number(precio)

    if (!Number.isFinite(cantidadNumero) || cantidadNumero <= 0) {
      setAviso({ tipo: 'error', texto: 'La cantidad debe ser mayor que cero.' })
      return
    }
    if (!Number.isFinite(precioNumero) || precioNumero < 0) {
      setAviso({ tipo: 'error', texto: 'El precio debe ser mayor o igual a cero.' })
      return
    }

    setGuardandoGenerador(true)
    setAviso(null)

    try {
      const generador = await crearGenerador({
        proyectoId,
        clave: clave.trim() === '' ? null : clave.trim(),
        descripcion: descripcion.trim(),
        unidad: unidad.trim() === '' ? 'pieza' : unidad.trim(),
        cantidad: Math.round(cantidadNumero * 100) / 100,
        precioUnitario: Math.round(precioNumero * 100) / 100,
      })
      setClave('')
      setDescripcion('')
      setCantidad('')
      setPrecio('')
      setGeneradorId(generador.id)
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Concepto agregado al generador.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardandoGenerador(false)
    }
  }

  async function guardarAvance(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (generadorId === '') {
      setAviso({ tipo: 'error', texto: 'Primero agrega un concepto al generador.' })
      return
    }

    const cantidadNumero = Number(cantidadAvance)

    if (!Number.isFinite(cantidadNumero) || cantidadNumero <= 0) {
      setAviso({ tipo: 'error', texto: 'La cantidad debe ser mayor que cero.' })
      return
    }

    setGuardandoAvance(true)
    setAviso(null)

    try {
      await crearAvanceGenerador({
        generadorId,
        fecha,
        cantidad: Math.round(cantidadNumero * 100) / 100,
        nota: nota.trim() === '' ? null : nota.trim(),
        usuarioId,
      })
      setCantidadAvance('')
      setNota('')
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Avance registrado.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardandoAvance(false)
    }
  }

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Generadores</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar generadores.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Generadores de obra</h1>
          <p className="subtitulo">
            Conceptos contratados, precios unitarios y avance ejecutado. Es la base
            para las estimaciones.
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
            sus generadores.
          </Vacio>
        </div>
      ) : (
        <>
          <section className="tarjeta tarjeta--plana">
            <div className="filtros">
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="generadores-proyecto">
                  Obra
                </label>
                <select
                  id="generadores-proyecto"
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
                {generadores.length} conceptos · {avances.length} avances
              </span>
            </div>
          </section>

          {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}

          <section className="rejilla-kpi">
            <article className="kpi">
              <p className="kpi__etiqueta">Conceptos</p>
              <p className="kpi__valor">{generadores.length}</p>
              <p className="kpi__nota">En el generador de esta obra</p>
            </article>
            <article className="kpi">
              <p className="kpi__etiqueta">Contratado</p>
              <p className="kpi__valor">{formatearMoneda(contratado)}</p>
              <p className="kpi__nota">Cantidad por precio unitario</p>
            </article>
            <article className="kpi">
              <p className="kpi__etiqueta">Ejecutado</p>
              <p className="kpi__valor">{formatearMoneda(ejecutadoTotal)}</p>
              <p className="kpi__nota">Avances acumulados</p>
            </article>
            <article className="kpi">
              <p className="kpi__etiqueta">Avance</p>
              <p className="kpi__valor">{avanceGeneral.toFixed(1)}%</p>
              <p className="kpi__nota">Importe ejecutado / contratado</p>
            </article>
          </section>

          {consulta.cargando && !consulta.datos ? (
            <Cargando />
          ) : (
            <>
              {puedeCrear ? (
                <div className="rejilla-dos">
                  <section className="tarjeta">
                    <div className="seccion__cabecera">
                      <div>
                        <h2 className="seccion__titulo">Nuevo concepto</h2>
                        <p className="seccion__nota">
                          Clave, descripción, unidad, cantidad y precio unitario.
                        </p>
                      </div>
                    </div>

                    <form
                      className="formulario"
                      onSubmit={(evento) => void guardarGenerador(evento)}
                    >
                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="gen-clave">
                          Clave
                        </label>
                        <input
                          id="gen-clave"
                          className="campo__control"
                          value={clave}
                          onChange={(evento) => setClave(evento.target.value)}
                          placeholder="Opcional"
                        />
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="gen-unidad">
                          Unidad
                        </label>
                        <input
                          id="gen-unidad"
                          className="campo__control"
                          value={unidad}
                          onChange={(evento) => setUnidad(evento.target.value)}
                          placeholder="m2, m3, ml, pieza"
                        />
                      </div>

                      <div className="campo campo--ancho">
                        <label className="campo__etiqueta" htmlFor="gen-descripcion">
                          Descripción
                        </label>
                        <input
                          id="gen-descripcion"
                          className="campo__control"
                          value={descripcion}
                          onChange={(evento) => setDescripcion(evento.target.value)}
                          placeholder="Muro de block de concreto"
                        />
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="gen-cantidad">
                          Cantidad contratada
                        </label>
                        <input
                          id="gen-cantidad"
                          className="campo__control"
                          inputMode="decimal"
                          value={cantidad}
                          onChange={(evento) => setCantidad(evento.target.value)}
                          placeholder="0.00"
                        />
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="gen-precio">
                          Precio unitario
                        </label>
                        <input
                          id="gen-precio"
                          className="campo__control"
                          inputMode="decimal"
                          value={precio}
                          onChange={(evento) => setPrecio(evento.target.value)}
                          placeholder="0.00"
                        />
                      </div>

                      <div className="acciones campo--ancho">
                        <button
                          type="submit"
                          className="boton boton--primario"
                          disabled={guardandoGenerador}
                        >
                          {guardandoGenerador ? 'Guardando…' : 'Agregar concepto'}
                        </button>
                      </div>
                    </form>
                  </section>

                  <section className="tarjeta">
                    <div className="seccion__cabecera">
                      <div>
                        <h2 className="seccion__titulo">Registrar avance</h2>
                        <p className="seccion__nota">
                          Cantidad ejecutada del concepto. No puede superar lo contratado.
                        </p>
                      </div>
                    </div>

                    {generadores.length === 0 ? (
                      <Vacio titulo="Primero agrega un concepto">
                        El avance se registra contra un concepto del generador.
                      </Vacio>
                    ) : (
                      <form
                        className="formulario"
                        onSubmit={(evento) => void guardarAvance(evento)}
                      >
                        <div className="campo campo--ancho">
                          <label className="campo__etiqueta" htmlFor="av-generador">
                            Concepto
                          </label>
                          <select
                            id="av-generador"
                            className="campo__control"
                            value={generadorId}
                            onChange={(evento) => setGeneradorId(evento.target.value)}
                          >
                            {generadores.map((generador) => (
                              <option key={generador.id} value={generador.id}>
                                {generador.clave ? `${generador.clave} · ` : ''}
                                {generador.descripcion}
                              </option>
                            ))}
                          </select>
                          {generadorSeleccionado ? (
                            <span className="campo__ayuda">
                              Contratado: {Number(generadorSeleccionado.cantidad).toFixed(2)}{' '}
                              {generadorSeleccionado.unidad} · Ejecutado:{' '}
                              {(
                                ejecutadoPorGenerador.get(generadorSeleccionado.id) ?? 0
                              ).toFixed(2)}
                            </span>
                          ) : null}
                        </div>

                        <div className="campo">
                          <label className="campo__etiqueta" htmlFor="av-fecha">
                            Fecha
                          </label>
                          <input
                            id="av-fecha"
                            className="campo__control"
                            type="date"
                            max={hoyISO()}
                            value={fecha}
                            onChange={(evento) => {
                              if (evento.target.value !== '') setFecha(evento.target.value)
                            }}
                          />
                        </div>

                        <div className="campo">
                          <label className="campo__etiqueta" htmlFor="av-cantidad">
                            Cantidad ejecutada
                          </label>
                          <input
                            id="av-cantidad"
                            className="campo__control"
                            inputMode="decimal"
                            value={cantidadAvance}
                            onChange={(evento) => setCantidadAvance(evento.target.value)}
                            placeholder="0.00"
                          />
                        </div>

                        <div className="campo campo--ancho">
                          <label className="campo__etiqueta" htmlFor="av-nota">
                            Nota
                          </label>
                          <input
                            id="av-nota"
                            className="campo__control"
                            value={nota}
                            onChange={(evento) => setNota(evento.target.value)}
                            placeholder="Frente, turno o comentario"
                          />
                        </div>

                        <div className="acciones campo--ancho">
                          <button
                            type="submit"
                            className="boton boton--primario"
                            disabled={guardandoAvance}
                          >
                            {guardandoAvance ? 'Guardando…' : 'Registrar avance'}
                          </button>
                        </div>
                      </form>
                    )}
                  </section>
                </div>
              ) : (
                <Aviso tipo="info">
                  Solo consulta. Los conceptos y avances los captura administración o
                  permiso medio.
                </Aviso>
              )}

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Conceptos</h2>
                    <p className="seccion__nota">
                      Importes y porcentaje de avance por concepto.
                    </p>
                  </div>
                </div>

                {filas.length === 0 ? (
                  <Vacio titulo="Generador vacío">
                    Agrega el primer concepto para medir el avance de la obra.
                  </Vacio>
                ) : (
                  <div className="tabla-marco">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Clave</th>
                          <th scope="col">Concepto</th>
                          <th scope="col">Unidad</th>
                          <th scope="col">Contratado</th>
                          <th scope="col">P. unitario</th>
                          <th scope="col">Importe</th>
                          <th scope="col">Ejecutado</th>
                          <th scope="col">Saldo</th>
                          <th scope="col">Avance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map(({ generador, ejecutado, importe, porcentaje }) => (
                          <tr key={generador.id}>
                            <td>{generador.clave ?? '—'}</td>
                            <td>
                              <span className="celda-principal">
                                {generador.descripcion}
                              </span>
                            </td>
                            <td>{generador.unidad}</td>
                            <td>{Number(generador.cantidad).toFixed(2)}</td>
                            <td>{formatearMoneda(Number(generador.precio_unitario))}</td>
                            <td>{formatearMoneda(importe)}</td>
                            <td>{ejecutado.toFixed(2)}</td>
                            <td>
                              {(Number(generador.cantidad) - ejecutado).toFixed(2)}
                            </td>
                            <td>{porcentaje.toFixed(1)}%</td>
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
                    <h2 className="seccion__titulo">Avances</h2>
                    <p className="seccion__nota">Registros que alimentan el porcentaje.</p>
                  </div>
                </div>

                {avances.length === 0 ? (
                  <Vacio titulo="Sin avances">
                    Registra el primer avance de un concepto.
                  </Vacio>
                ) : (
                  <div className="tabla-marco">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Fecha</th>
                          <th scope="col">Concepto</th>
                          <th scope="col">Cantidad</th>
                          <th scope="col">Nota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {avances.map((avance) => {
                          const generador = generadores.find(
                            (item) => item.id === avance.generador_id,
                          )
                          return (
                            <tr key={avance.id}>
                              <td>{formatearFecha(avance.fecha)}</td>
                              <td>
                                <span className="celda-principal">
                                  {generador?.descripcion ?? 'Concepto eliminado'}
                                </span>
                                <span className="celda-nota">
                                  {generador?.clave ?? ''}
                                </span>
                              </td>
                              <td>
                                {Number(avance.cantidad).toFixed(2)}{' '}
                                {generador?.unidad ?? ''}
                              </td>
                              <td>{avance.nota ?? '—'}</td>
                            </tr>
                          )
                        })}
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
